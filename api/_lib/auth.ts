import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import { HttpError } from './http.js'

export type Plan = 'free' | 'growth' | 'scale'
const RANK: Record<Plan, number> = { free: 0, growth: 1, scale: 2 }

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

/** Service-role client: bypasses row-level security. Server-side only, never sent to browsers. */
export const admin: SupabaseClient | null =
  SUPABASE_URL && SERVICE_KEY ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } }) : null

/** Deployed on Vercel (production or preview) rather than running on your own computer. */
const DEPLOYED = process.env.VERCEL_ENV === 'production' || process.env.VERCEL_ENV === 'preview'

export interface Caller {
  user: User | null // null only in local demo mode
  plan: Plan
  isAdmin: boolean
  demo: boolean
}

/**
 * Identifies who is calling from their Supabase access token.
 * With no Supabase configured on a local machine, everyone is a local demo admin
 * so the engines can be tried out; deployed sites always require a real sign-in.
 */
export async function getCaller(req: Request): Promise<Caller> {
  if (!admin) {
    if (DEPLOYED) throw new HttpError(500, 'Server is missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.')
    return { user: null, plan: 'scale', isAdmin: true, demo: true }
  }
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) throw new HttpError(401, 'Please sign in.')
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user) throw new HttpError(401, 'Your session expired. Please sign in again.')

  const { data: profile } = await admin
    .from('profiles')
    .select('plan, is_admin')
    .eq('id', data.user.id)
    .maybeSingle()
  const isAdmin = !!profile?.is_admin
  const plan: Plan = isAdmin ? 'scale' : ((profile?.plan as Plan | undefined) ?? 'free')
  return { user: data.user, plan, isAdmin, demo: false }
}

export function hasPlan(caller: Caller, required: Plan): boolean {
  return RANK[caller.plan] >= RANK[required]
}

export function requirePlan(caller: Caller, required: Plan, feature: string) {
  if (!hasPlan(caller, required)) {
    const name = required === 'growth' ? 'Growth' : 'Scale'
    throw new HttpError(402, `${feature} needs the ${name} plan.`)
  }
}

export function requireAdmin(caller: Caller) {
  if (!caller.isAdmin) throw new HttpError(403, 'Admins only.')
}

/**
 * Per-day usage caps keep AI costs predictable. Admins are uncapped.
 * Counts rows the user created in `table` since midnight UTC.
 */
export async function enforceDailyLimit(caller: Caller, table: string, limits: Record<Plan, number>) {
  if (caller.isAdmin || !admin || !caller.user) return
  const since = new Date()
  since.setUTCHours(0, 0, 0, 0)
  const { count } = await admin
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('user_id', caller.user.id)
    .gte('created_at', since.toISOString())
  const limit = limits[caller.plan]
  if ((count ?? 0) >= limit) {
    throw new HttpError(429, `You've reached today's limit of ${limit} on your plan. It resets at midnight UTC.`)
  }
}
