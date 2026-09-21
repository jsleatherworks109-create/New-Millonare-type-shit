import Stripe from 'stripe'
import { admin, getCaller } from './auth.js'
import { HttpError, json, readJson } from './http.js'

let stripeClient: Stripe | null = null
function stripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) throw new HttpError(503, 'Payments are not set up yet (STRIPE_SECRET_KEY missing).')
  stripeClient ??= new Stripe(process.env.STRIPE_SECRET_KEY)
  return stripeClient
}

function siteUrl(req: Request): string {
  return process.env.SITE_URL?.replace(/\/$/, '') ?? new URL(req.url).origin
}

const PRICE_BY_PLAN: Record<string, string | undefined> = {
  growth: process.env.STRIPE_PRICE_GROWTH,
  scale: process.env.STRIPE_PRICE_SCALE,
}

function planForPrice(priceId: string | undefined): 'growth' | 'scale' | null {
  for (const [plan, id] of Object.entries(PRICE_BY_PLAN)) if (id && id === priceId) return plan as 'growth' | 'scale'
  return null
}

async function customerFor(userId: string, email: string | undefined): Promise<string> {
  if (!admin) throw new HttpError(500, 'Database not configured.')
  const { data: profile } = await admin.from('profiles').select('stripe_customer_id').eq('id', userId).maybeSingle()
  if (profile?.stripe_customer_id) return profile.stripe_customer_id
  const customer = await stripe().customers.create({ email, metadata: { supabase_user_id: userId } })
  await admin.from('profiles').upsert({ id: userId, email, stripe_customer_id: customer.id })
  return customer.id
}

export async function handleCheckout(req: Request): Promise<Response> {
  const caller = await getCaller(req)
  if (!caller.user) throw new HttpError(400, 'Payments need real sign-in (Supabase) to be configured.')
  if (caller.isAdmin) throw new HttpError(400, 'Admin accounts already have every feature for free.')
  const { plan } = await readJson<{ plan?: string }>(req, 1_000)
  const price = PRICE_BY_PLAN[plan ?? '']
  if (!price) throw new HttpError(400, 'Unknown plan, or its Stripe price is not configured.')

  const customer = await customerFor(caller.user.id, caller.user.email)
  const base = siteUrl(req)

  // Already subscribed? Switch plans in the portal instead of stacking a second subscription.
  const existing = await stripe().subscriptions.list({ customer, status: 'active', limit: 1 })
  if (existing.data.length > 0) {
    const portal = await stripe().billingPortal.sessions.create({ customer, return_url: `${base}/app/billing` })
    return json({ url: portal.url })
  }

  const session = await stripe().checkout.sessions.create({
    mode: 'subscription',
    customer,
    line_items: [{ price, quantity: 1 }],
    client_reference_id: caller.user.id,
    subscription_data: { metadata: { supabase_user_id: caller.user.id } },
    allow_promotion_codes: true,
    success_url: `${base}/app/billing?checkout=success`,
    cancel_url: `${base}/app/billing?checkout=cancelled`,
  })
  return json({ url: session.url })
}

export async function handlePortal(req: Request): Promise<Response> {
  const caller = await getCaller(req)
  if (!caller.user) throw new HttpError(400, 'Payments need real sign-in (Supabase) to be configured.')
  const customer = await customerFor(caller.user.id, caller.user.email)
  const session = await stripe().billingPortal.sessions.create({ customer, return_url: `${siteUrl(req)}/app/billing` })
  return json({ url: session.url })
}

const ACTIVE = new Set(['active', 'trialing', 'past_due'])

async function syncSubscription(sub: Stripe.Subscription) {
  if (!admin) throw new Error('Database not configured')
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id
  const item = sub.items.data[0]
  const paidPlan = planForPrice(item?.price.id)
  const plan = ACTIVE.has(sub.status) && paidPlan ? paidPlan : 'free'
  const periodEnd = item?.current_period_end
  const { error } = await admin
    .from('profiles')
    .update({
      plan,
      subscription_status: sub.status,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_customer_id', customerId)
    .eq('is_admin', false)
  if (error) throw error
}

/** Stripe calls this after payments, plan changes and cancellations. The only place a paid plan is granted. */
export async function handleWebhook(req: Request): Promise<Response> {
  const signature = req.headers.get('stripe-signature')
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!signature || !secret) return new Response('Missing signature', { status: 400 })

  let event: Stripe.Event
  try {
    event = stripe().webhooks.constructEvent(await req.text(), signature, secret)
  } catch (err) {
    console.error('Bad webhook signature', err)
    return new Response('Invalid signature', { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object
        if (session.subscription) {
          const id = typeof session.subscription === 'string' ? session.subscription : session.subscription.id
          await syncSubscription(await stripe().subscriptions.retrieve(id))
        }
        break
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await syncSubscription(event.data.object)
        break
    }
  } catch (err) {
    console.error(`Failed handling ${event.type}`, err)
    return new Response('Handler error', { status: 500 }) // Stripe retries.
  }
  return json({ received: true })
}
