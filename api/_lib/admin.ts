import { admin, getCaller, requireAdmin } from './auth.js'
import { HttpError, json, readJson } from './http.js'

export async function handleAdminUsers(req: Request): Promise<Response> {
  const caller = await getCaller(req)
  requireAdmin(caller)
  if (!admin) return json({ users: [], stats: null })

  const { data: users, error } = await admin
    .from('profiles')
    .select('id, email, plan, is_admin, subscription_status, created_at')
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) throw new HttpError(500, error.message)

  const count = async (table: string) =>
    (await admin!.from(table).select('*', { count: 'exact', head: true })).count ?? 0
  const [generations, analyses, drops, briefs] = await Promise.all([
    count('content_generations'),
    count('store_analyses'),
    count('drops'),
    count('briefs'),
  ])
  return json({ users, stats: { generations, analyses, drops, briefs } })
}

export async function handleAdminSetPlan(req: Request): Promise<Response> {
  const caller = await getCaller(req)
  requireAdmin(caller)
  if (!admin) throw new HttpError(400, 'Database not configured.')
  const { userId, plan } = await readJson<{ userId?: string; plan?: string }>(req, 1_000)
  if (!userId || !['free', 'growth', 'scale'].includes(plan ?? '')) throw new HttpError(400, 'Choose a user and a plan.')
  const { error } = await admin.from('profiles').update({ plan }).eq('id', userId).eq('is_admin', false)
  if (error) throw new HttpError(500, error.message)
  return json({ ok: true })
}
