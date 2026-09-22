import { db, getSetting, newId } from './db.js'
import { HttpError, json, readJson, str } from './http.js'

type Row = Record<string, unknown>

const SLUG_RE = /^[a-z0-9][a-z0-9-]{2,59}$/
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function httpUrl(v: unknown, field: string): string | null {
  const s = str(v, 2000, field)
  if (!s) return null
  try {
    const u = new URL(s)
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.toString()
  } catch {
    // fall through
  }
  throw new HttpError(400, `${field} must be a web link starting with http:// or https://`)
}

/* ------------------------------ Drops ------------------------------ */

function dropFields(body: Row) {
  const slug = str(body.slug, 60, 'Page link', true).toLowerCase()
  if (!SLUG_RE.test(slug)) throw new HttpError(400, 'Page link must be 3–60 lowercase letters, numbers or dashes.')
  const status = str(body.status, 10, 'Status') || 'draft'
  if (!['draft', 'live', 'ended'].includes(status)) throw new HttpError(400, 'Invalid status.')
  const launchAt = new Date(str(body.launch_at, 40, 'Launch time', true))
  if (Number.isNaN(launchAt.getTime())) throw new HttpError(400, 'Invalid launch time.')
  const image = typeof body.image_url === 'string' ? body.image_url : ''
  if (image && !/^data:image\/(jpeg|png|webp);base64,/.test(image) && !/^https?:\/\//.test(image)) {
    throw new HttpError(400, 'Image must be an uploaded photo or a web link.')
  }
  if (image.length > 1_500_000) throw new HttpError(400, 'Image is too large.')
  const quantity = num(body.quantity)
  return {
    slug,
    title: str(body.title, 120, 'Drop name', true),
    description: str(body.description, 4000, 'Description') || null,
    image_url: image || null,
    price: str(body.price, 40, 'Price') || null,
    store_url: httpUrl(body.store_url, 'Store link'),
    launch_at: launchAt.toISOString(),
    quantity: quantity && quantity > 0 ? Math.floor(quantity) : null,
    status,
  }
}

function uniqueError(err: unknown): never {
  if (err instanceof Error && /UNIQUE/.test(err.message)) throw new HttpError(409, 'That page link is already used by another drop.')
  throw err
}

export function listDrops(): Response {
  const drops = db()
    .prepare(
      `SELECT d.*, (SELECT COUNT(*) FROM waitlist w WHERE w.drop_id = d.id) AS waitlist_count
       FROM drops d ORDER BY d.created_at DESC`,
    )
    .all()
  return json({ drops })
}

export async function createDrop(req: Request): Promise<Response> {
  const f = dropFields(await readJson<Row>(req, 2_000_000))
  const id = newId()
  try {
    db()
      .prepare(
        `INSERT INTO drops (id, slug, title, description, image_url, price, store_url, launch_at, quantity, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, f.slug, f.title, f.description, f.image_url, f.price, f.store_url, f.launch_at, f.quantity, f.status)
  } catch (err) {
    uniqueError(err)
  }
  return json({ drop: db().prepare('SELECT * FROM drops WHERE id = ?').get(id) })
}

export async function updateDrop(req: Request): Promise<Response> {
  const body = await readJson<Row>(req, 2_000_000)
  const id = str(body.id, 60, 'id', true)
  const existing = db().prepare('SELECT * FROM drops WHERE id = ?').get(id) as Row | undefined
  if (!existing) throw new HttpError(404, 'Drop not found.')
  const f = dropFields({ ...existing, ...body })
  try {
    db()
      .prepare(
        `UPDATE drops SET slug=?, title=?, description=?, image_url=?, price=?, store_url=?, launch_at=?, quantity=?, status=? WHERE id=?`,
      )
      .run(f.slug, f.title, f.description, f.image_url, f.price, f.store_url, f.launch_at, f.quantity, f.status, id)
  } catch (err) {
    uniqueError(err)
  }
  return json({ drop: db().prepare('SELECT * FROM drops WHERE id = ?').get(id) })
}

export async function deleteDrop(req: Request): Promise<Response> {
  const { id } = await readJson<{ id?: string }>(req, 1_000)
  db().prepare('DELETE FROM drops WHERE id = ?').run(id ?? '')
  return json({ ok: true })
}

export function dropWaitlist(req: Request): Response {
  const id = new URL(req.url).searchParams.get('id') ?? ''
  const rows = db().prepare('SELECT email, created_at FROM waitlist WHERE drop_id = ? ORDER BY created_at DESC').all(id)
  return json({ waitlist: rows })
}

/* ------------------------------ Analytics ------------------------------ */

export function analytics(req: Request): Response {
  const url = new URL(req.url)
  const dropId = url.searchParams.get('drop') || 'all'
  const days = Math.min(365, Math.max(1, Number(url.searchParams.get('days')) || 30))
  const since = new Date(Date.now() - days * 86_400_000).toISOString()
  const where = dropId === 'all' ? '' : 'AND drop_id = ?'
  const args = dropId === 'all' ? [since] : [since, dropId]

  const events = db()
    .prepare(`SELECT type, visitor_id, substr(created_at, 1, 10) AS day FROM drop_events WHERE created_at >= ? ${where}`)
    .all(...args) as { type: string; visitor_id: string | null; day: string }[]
  const waitlistTotal = (
    db()
      .prepare(`SELECT COUNT(*) AS n FROM waitlist ${dropId === 'all' ? '' : 'WHERE drop_id = ?'}`)
      .get(...(dropId === 'all' ? [] : [dropId])) as { n: number }
  ).n

  const byDay = new Map<string, { views: number; signups: number; clicks: number }>()
  for (let i = days - 1; i >= 0; i--) {
    byDay.set(new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10), { views: 0, signups: 0, clicks: 0 })
  }
  const visitors = new Set<string>()
  let views = 0
  let signups = 0
  let clicks = 0
  for (const e of events) {
    const bucket = byDay.get(e.day)
    if (e.type === 'view') {
      views++
      if (e.visitor_id) visitors.add(e.visitor_id)
      if (bucket) bucket.views++
    } else if (e.type === 'signup') {
      signups++
      if (bucket) bucket.signups++
    } else {
      clicks++
      if (bucket) bucket.clicks++
    }
  }
  return json({
    views,
    visitors: visitors.size,
    signups,
    clicks,
    waitlistTotal,
    series: [...byDay.entries()].map(([day, v]) => ({ day, ...v })),
  })
}

/* ------------------------------ Public (shoppers) ------------------------------ */

const PUBLIC_DROP_FIELDS = 'id, slug, title, description, image_url, price, store_url, launch_at, quantity, status'

export function publicDrop(req: Request, isPreview: boolean): Response {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''
  const drop = db().prepare(`SELECT ${PUBLIC_DROP_FIELDS} FROM drops WHERE slug = ?`).get(slug) as Row | undefined
  // Drafts are only visible from the owner's own app, never through the public link.
  if (!drop || (drop.status === 'draft' && !isPreview)) throw new HttpError(404, 'Drop not found.')
  return json({ drop })
}

export async function joinWaitlist(req: Request): Promise<Response> {
  const body = await readJson<Row>(req, 2_000)
  const email = str(body.email, 254, 'Email', true).toLowerCase()
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Please enter a valid email address.')
  const drop = db().prepare("SELECT id FROM drops WHERE id = ? AND status = 'live'").get(str(body.dropId, 60, 'Drop', true)) as Row | undefined
  if (!drop) throw new HttpError(404, 'This drop isn’t taking sign-ups.')
  try {
    db().prepare('INSERT INTO waitlist (drop_id, email) VALUES (?, ?)').run(drop.id as string, email)
  } catch (err) {
    if (err instanceof Error && /UNIQUE/.test(err.message)) return json({ ok: true, already: true })
    throw err
  }
  db().prepare("INSERT INTO drop_events (drop_id, type, visitor_id) VALUES (?, 'signup', ?)").run(drop.id as string, str(body.visitorId, 64, 'Visitor') || null)
  return json({ ok: true, already: false })
}

export async function trackEvent(req: Request): Promise<Response> {
  const body = await readJson<Row>(req, 1_000)
  const type = str(body.type, 10, 'Type')
  if (type !== 'view' && type !== 'click') throw new HttpError(400, 'Invalid event.')
  const drop = db().prepare("SELECT id FROM drops WHERE id = ? AND status IN ('live','ended')").get(str(body.dropId, 60, 'Drop', true)) as Row | undefined
  if (drop) {
    db().prepare('INSERT INTO drop_events (drop_id, type, visitor_id) VALUES (?, ?, ?)').run(drop.id as string, type, str(body.visitorId, 64, 'Visitor') || null)
  }
  return json({ ok: true })
}

export function settings(): Response {
  return json({ publicUrl: getSetting('public_url') })
}

/* ------------------------------ Creator tracker ------------------------------ */

export function listCreatorData(): Response {
  const d = db()
  return json({
    creators: d.prepare('SELECT * FROM creators ORDER BY name COLLATE NOCASE').all(),
    campaigns: d.prepare('SELECT * FROM campaigns ORDER BY created_at DESC').all(),
    deals: d.prepare('SELECT * FROM deals ORDER BY created_at DESC').all(),
  })
}

export async function saveCreator(req: Request): Promise<Response> {
  const b = await readJson<Row>(req, 20_000)
  const f = {
    name: str(b.name, 80, 'Name', true),
    niche: str(b.niche, 80, 'Niche') || null,
    email: str(b.email, 254, 'Email') || null,
    instagram: str(b.instagram, 80, 'Instagram') || null,
    tiktok: str(b.tiktok, 80, 'TikTok') || null,
    youtube: str(b.youtube, 200, 'YouTube') || null,
    audience_size: num(b.audience_size),
    notes: str(b.notes, 2000, 'Notes') || null,
  }
  const id = str(b.id, 60, 'id') || newId()
  db()
    .prepare(
      `INSERT INTO creators (id, name, niche, email, instagram, tiktok, youtube, audience_size, notes) VALUES (?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, niche=excluded.niche, email=excluded.email, instagram=excluded.instagram,
       tiktok=excluded.tiktok, youtube=excluded.youtube, audience_size=excluded.audience_size, notes=excluded.notes`,
    )
    .run(id, f.name, f.niche, f.email, f.instagram, f.tiktok, f.youtube, f.audience_size, f.notes)
  return json({ id })
}

export async function saveCampaign(req: Request): Promise<Response> {
  const b = await readJson<Row>(req, 20_000)
  const pct = num(b.commission_pct)
  if (pct === null || pct <= 0 || pct > 90) throw new HttpError(400, 'Commission must be between 0 and 90%.')
  const status = str(b.status, 10, 'Status') || 'open'
  if (!['open', 'closed'].includes(status)) throw new HttpError(400, 'Invalid status.')
  const id = str(b.id, 60, 'id') || newId()
  db()
    .prepare(
      `INSERT INTO campaigns (id, title, product, brief, commission_pct, product_value, status) VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET title=excluded.title, product=excluded.product, brief=excluded.brief,
       commission_pct=excluded.commission_pct, product_value=excluded.product_value, status=excluded.status`,
    )
    .run(id, str(b.title, 120, 'Title', true), str(b.product, 200, 'Product', true), str(b.brief, 4000, 'Brief') || null, pct, num(b.product_value), status)
  return json({ id })
}

const DEAL_STATUSES = ['invited', 'shipped', 'submitted', 'approved', 'paid', 'declined']

export async function saveDeal(req: Request): Promise<Response> {
  const b = await readJson<Row>(req, 20_000)
  const d = db()
  const id = str(b.id, 60, 'id')
  if (!id) {
    const campaignId = str(b.campaign_id, 60, 'Campaign', true)
    const creator = d.prepare('SELECT name FROM creators WHERE id = ?').get(str(b.creator_id, 60, 'Creator', true)) as { name: string } | undefined
    if (!creator) throw new HttpError(404, 'Creator not found.')
    const code = `${creator.name.replace(/[^A-Za-z0-9]/g, '').slice(0, 10).toUpperCase() || 'CREATOR'}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
    try {
      const newDeal = newId()
      d.prepare('INSERT INTO deals (id, campaign_id, creator_id, referral_code) VALUES (?, ?, ?, ?)').run(newDeal, campaignId, b.creator_id as string, code)
      return json({ id: newDeal })
    } catch (err) {
      if (err instanceof Error && /UNIQUE/.test(err.message)) throw new HttpError(409, 'That creator is already on this campaign.')
      throw err
    }
  }
  const status = str(b.status, 12, 'Status')
  if (status && !DEAL_STATUSES.includes(status)) throw new HttpError(400, 'Invalid status.')
  const sales = num(b.sales_total)
  const paid = num(b.paid_total)
  d.prepare(
    `UPDATE deals SET status = COALESCE(?, status), content_url = COALESCE(?, content_url),
     sales_total = COALESCE(?, sales_total), paid_total = COALESCE(?, paid_total), notes = COALESCE(?, notes) WHERE id = ?`,
  ).run(
    status || null,
    b.content_url === undefined ? null : httpUrl(b.content_url, 'Content link') ?? '',
    sales === null ? null : Math.max(0, sales),
    paid === null ? null : Math.max(0, paid),
    b.notes === undefined ? null : str(b.notes, 2000, 'Notes'),
    id,
  )
  return json({ ok: true })
}

export async function deleteRecord(req: Request): Promise<Response> {
  const { kind, id } = await readJson<{ kind?: string; id?: string }>(req, 1_000)
  const table = { creator: 'creators', campaign: 'campaigns', deal: 'deals' }[kind ?? '']
  if (!table) throw new HttpError(400, 'Unknown record type.')
  db().prepare(`DELETE FROM ${table} WHERE id = ?`).run(id ?? '')
  return json({ ok: true })
}
