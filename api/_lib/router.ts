import { handleAdminSetPlan, handleAdminUsers } from './admin.js'
import { handleAnalyze } from './analyzer.js'
import { handleCheckout, handlePortal, handleWebhook } from './billing.js'
import { aiConfigured } from './claude.js'
import { handleContent, handleDropCopy } from './content.js'
import { HttpError, json } from './http.js'

type Handler = (req: Request) => Promise<Response>

const POST_ROUTES: Record<string, Handler> = {
  content: handleContent,
  'drop-copy': handleDropCopy,
  analyze: handleAnalyze,
  checkout: handleCheckout,
  portal: handlePortal,
  'stripe-webhook': handleWebhook,
  'admin/set-plan': handleAdminSetPlan,
}

const GET_ROUTES: Record<string, Handler> = {
  health: async () =>
    json({
      ok: true,
      ai: aiConfigured(),
      database: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      payments: !!process.env.STRIPE_SECRET_KEY,
    }),
  'admin/users': handleAdminUsers,
}

/** Works out which endpoint was called: from ?route= (Vercel rewrite) or the /api/... path (local dev). */
function routeOf(req: Request): string {
  const url = new URL(req.url)
  const fromQuery = url.searchParams.get('route')
  const raw = fromQuery ?? url.pathname.replace(/^\/api\/?/, '')
  return raw.replace(/^\/+|\/+$/g, '')
}

export async function dispatch(req: Request): Promise<Response> {
  const route = routeOf(req)
  const handler = (req.method === 'GET' ? GET_ROUTES : req.method === 'POST' ? POST_ROUTES : {})[route]
  if (!handler) return json({ error: 'Not found' }, 404)
  try {
    return await handler(req)
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status)
    console.error(`/api/${route} failed`, err)
    return json({ error: 'Something went wrong on our side. Please try again.' }, 500)
  }
}
