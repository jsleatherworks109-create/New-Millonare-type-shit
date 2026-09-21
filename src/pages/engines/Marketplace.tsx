import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { EmptyState, NeedsDatabase, Spinner, errorMessage } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { PLATFORM_FEE_PCT } from '../../lib/plans'
import { supabase } from '../../lib/supabase'
import { safeHttpUrl } from '../../lib/drops'

interface CreatorProfile {
  user_id: string
  display_name: string
  niche: string | null
  bio: string | null
  instagram: string | null
  tiktok: string | null
  youtube: string | null
  audience_size: number | null
  portfolio_url: string | null
  contact_email: string | null
}

interface Brief {
  id: string
  brand_id: string
  brand_name: string
  contact_email: string | null
  title: string
  product: string
  description: string | null
  requirements: string | null
  commission_pct: number
  product_value: number | null
  platforms: string[]
  status: 'open' | 'closed'
  created_at: string
}

interface Application {
  id: string
  brief_id: string
  creator_id: string
  pitch: string | null
  status: 'pending' | 'accepted' | 'declined' | 'submitted' | 'approved'
  content_url: string | null
  referral_code: string | null
  sales_total: number
  created_at: string
}

type Tab = 'browse' | 'my-briefs' | 'my-deals' | 'profile'

const money = (n: number) => n.toLocaleString(undefined, { style: 'currency', currency: 'USD' })

function earnings(sales: number, pct: number) {
  const commission = (sales * pct) / 100
  const fee = (commission * PLATFORM_FEE_PCT) / 100
  return { commission, fee, creatorNet: commission - fee }
}

export function Marketplace() {
  const [tab, setTab] = useState<Tab>('browse')
  if (!supabase) return <NeedsDatabase feature="The Creator Marketplace" />

  return (
    <>
      <div className="tabs" role="tablist">
        {([
          ['browse', 'Browse briefs'],
          ['my-briefs', 'My briefs (brand)'],
          ['my-deals', 'My deals (creator)'],
          ['profile', 'Creator profile'],
        ] as [Tab, string][]).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={`tab${tab === id ? ' is-active' : ''}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      <p className="muted small">
        Creators earn an agreed commission on the sales they drive. Selamont’s platform fee is {PLATFORM_FEE_PCT}% of that
        commission, shown on every deal. Earnings are tracked here; brands pay creators directly until automated payouts launch.
      </p>
      {tab === 'browse' && <Browse onNeedProfile={() => setTab('profile')} />}
      {tab === 'my-briefs' && <MyBriefs />}
      {tab === 'my-deals' && <MyDeals />}
      {tab === 'profile' && <ProfileForm />}
    </>
  )
}

/* ---------------- Browse & apply ---------------- */

function Browse({ onNeedProfile }: { onNeedProfile: () => void }) {
  const { user } = useAuth()
  const [briefs, setBriefs] = useState<Brief[] | null>(null)
  const [applied, setApplied] = useState<Set<string>>(new Set())
  const [hasProfile, setHasProfile] = useState(false)
  const [open, setOpen] = useState<Brief | null>(null)
  const [filter, setFilter] = useState('')

  const load = useCallback(async () => {
    const [{ data: b }, { data: a }, { data: p }] = await Promise.all([
      supabase!.from('briefs').select('*').eq('status', 'open').order('created_at', { ascending: false }).limit(100),
      supabase!.from('applications').select('brief_id').eq('creator_id', user!.id),
      supabase!.from('creator_profiles').select('user_id').eq('user_id', user!.id).maybeSingle(),
    ])
    setBriefs((b ?? []) as Brief[])
    setApplied(new Set((a ?? []).map((x) => x.brief_id)))
    setHasProfile(!!p)
  }, [user])

  useEffect(() => {
    load()
  }, [load])

  if (!briefs) return <Spinner label="Loading briefs…" />
  const q = filter.toLowerCase()
  const shown = briefs.filter((b) => !q || `${b.title} ${b.product} ${b.brand_name} ${b.platforms.join(' ')}`.toLowerCase().includes(q))

  return (
    <>
      <input className="search" placeholder="Search briefs by product, brand or platform" value={filter} onChange={(e) => setFilter(e.target.value)} />
      {shown.length === 0 ? (
        <EmptyState title="No open briefs yet">Brands post briefs from the “My briefs” tab.</EmptyState>
      ) : (
        <div className="grid-2">
          {shown.map((b) => (
            <div key={b.id} className="card brief">
              <div className="card__head">
                <span className="muted small">{b.brand_name}</span>
                <span className="tag tag--commission">{b.commission_pct}% commission</span>
              </div>
              <h3>{b.title}</h3>
              <p className="small"><strong>Product:</strong> {b.product}{b.product_value ? ` (worth ${money(b.product_value)})` : ''}</p>
              {b.description && <p className="muted small clamp-3">{b.description}</p>}
              {b.platforms.length > 0 && <div className="chips">{b.platforms.map((p) => <span key={p} className="chip is-on">{p}</span>)}</div>}
              {b.brand_id === user!.id ? (
                <p className="muted small">Your brief</p>
              ) : applied.has(b.id) ? (
                <p className="form-notice">Applied ✓</p>
              ) : !hasProfile ? (
                <button className="btn btn--ghost" onClick={onNeedProfile}>Create a creator profile to apply</button>
              ) : (
                <button className="btn btn--primary" onClick={() => setOpen(b)}>View & apply</button>
              )}
            </div>
          ))}
        </div>
      )}
      {open && <ApplyDialog brief={open} onClose={() => setOpen(null)} onApplied={() => { setOpen(null); load() }} />}
    </>
  )
}

function ApplyDialog({ brief, onClose, onApplied }: { brief: Brief; onClose: () => void; onApplied: () => void }) {
  const [pitch, setPitch] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const example = earnings(1000, brief.commission_pct)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    const { error } = await supabase!.from('applications').insert({ brief_id: brief.id, pitch: pitch.trim() })
    setBusy(false)
    if (error) setError(error.code === '23505' ? 'You already applied to this brief.' : error.message)
    else onApplied()
  }

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={brief.title} onClick={onClose}>
      <form className="modal__card form" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="card__head">
          <h2>{brief.title}</h2>
          <button type="button" className="btn btn--ghost btn--xs" onClick={onClose}>Close</button>
        </div>
        <p className="muted">{brief.brand_name} · {brief.product}</p>
        {brief.description && <p className="pre">{brief.description}</p>}
        {brief.requirements && (<><h4>Requirements</h4><p className="pre small">{brief.requirements}</p></>)}
        <div className="panel panel--stack small">
          <strong>How you get paid</strong>
          <span>You earn {brief.commission_pct}% of the sales your content drives, tracked with your own referral code.</span>
          <span className="muted">Example: {money(1000)} in sales = {money(example.commission)} commission, minus the {PLATFORM_FEE_PCT}% platform fee ({money(example.fee)}) = <strong>{money(example.creatorNet)}</strong> to you.</span>
        </div>
        <label className="field">
          <span>Your pitch</span>
          <textarea rows={5} required maxLength={2000} value={pitch} onChange={(e) => setPitch(e.target.value)}
            placeholder="Why you’re a fit, the content you’d make, links to similar work…" />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button className="btn btn--primary" disabled={busy}>{busy ? 'Sending…' : 'Send application'}</button>
      </form>
    </div>
  )
}

/* ---------------- Brand side ---------------- */

function MyBriefs() {
  const { user } = useAuth()
  const [briefs, setBriefs] = useState<Brief[] | null>(null)
  const [creating, setCreating] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data } = await supabase!.from('briefs').select('*').eq('brand_id', user!.id).order('created_at', { ascending: false })
    setBriefs((data ?? []) as Brief[])
  }, [user])
  useEffect(() => {
    load()
  }, [load])

  if (!briefs) return <Spinner label="Loading…" />
  if (creating) return <BriefForm onDone={() => { setCreating(false); load() }} />

  return (
    <>
      <div className="toolbar">
        <p className="muted">Post what you want made and the commission you’ll pay. Creators apply; you choose.</p>
        <button className="btn btn--primary" onClick={() => setCreating(true)}>+ Post a brief</button>
      </div>
      {briefs.length === 0 ? (
        <EmptyState title="No briefs yet">Post your first brief to start receiving creator applications.</EmptyState>
      ) : (
        <div className="stack">
          {briefs.map((b) => (
            <div key={b.id} className="card">
              <div className="card__head">
                <div>
                  <h3>{b.title}</h3>
                  <p className="muted small">{b.product} · {b.commission_pct}% commission · <span className={`tag tag--${b.status}`}>{b.status}</span></p>
                </div>
                <div className="row">
                  <button className="btn btn--ghost btn--sm" onClick={async () => {
                    await supabase!.from('briefs').update({ status: b.status === 'open' ? 'closed' : 'open' }).eq('id', b.id)
                    load()
                  }}>{b.status === 'open' ? 'Close' : 'Reopen'}</button>
                  <button className="btn btn--primary btn--sm" onClick={() => setOpenId(openId === b.id ? null : b.id)}>
                    {openId === b.id ? 'Hide applicants' : 'Applicants'}
                  </button>
                </div>
              </div>
              {openId === b.id && <Applicants brief={b} />}
            </div>
          ))}
        </div>
      )}
    </>
  )
}

function BriefForm({ onDone }: { onDone: () => void }) {
  const { user } = useAuth()
  const [f, setF] = useState({ brand_name: '', contact_email: user?.email ?? '', title: '', product: '', description: '', requirements: '', commission_pct: '15', product_value: '' })
  const [platforms, setPlatforms] = useState<string[]>(['tiktok', 'instagram'])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    const { error } = await supabase!.from('briefs').insert({
      brand_name: f.brand_name.trim(),
      contact_email: f.contact_email.trim() || null,
      title: f.title.trim(),
      product: f.product.trim(),
      description: f.description.trim() || null,
      requirements: f.requirements.trim() || null,
      commission_pct: Number(f.commission_pct),
      product_value: f.product_value ? Number(f.product_value) : null,
      platforms,
    })
    setBusy(false)
    if (error) setError(error.message)
    else onDone()
  }

  return (
    <form className="card form" onSubmit={submit}>
      <h2>Post a brief</h2>
      <div className="grid-2">
        <label className="field"><span>Brand name</span><input required maxLength={80} value={f.brand_name} onChange={set('brand_name')} /></label>
        <label className="field"><span>Contact email (shown to creators you accept)</span><input type="email" value={f.contact_email} onChange={set('contact_email')} /></label>
        <label className="field"><span>Brief title</span><input required maxLength={120} value={f.title} onChange={set('title')} placeholder="e.g. Unboxing + try-on for our new hoodie" /></label>
        <label className="field"><span>Product you’ll send</span><input required maxLength={200} value={f.product} onChange={set('product')} /></label>
        <label className="field"><span>Commission on sales (%)</span><input type="number" required min={1} max={90} step="0.5" value={f.commission_pct} onChange={set('commission_pct')} /></label>
        <label className="field"><span>Product value in USD (optional)</span><input type="number" min={0} step="0.01" value={f.product_value} onChange={set('product_value')} /></label>
      </div>
      <label className="field"><span>What you want made</span><textarea rows={4} maxLength={4000} value={f.description} onChange={set('description')} /></label>
      <label className="field"><span>Requirements (deadlines, do’s and don’ts, usage rights)</span><textarea rows={3} maxLength={2000} value={f.requirements} onChange={set('requirements')} /></label>
      <fieldset className="field">
        <span>Platforms</span>
        <div className="chips">
          {['tiktok', 'instagram', 'youtube', 'pinterest', 'facebook'].map((p) => (
            <label key={p} className={`chip${platforms.includes(p) ? ' is-on' : ''}`}>
              <input type="checkbox" checked={platforms.includes(p)} onChange={() => setPlatforms(platforms.includes(p) ? platforms.filter((x) => x !== p) : [...platforms, p])} />
              {p}
            </label>
          ))}
        </div>
      </fieldset>
      <p className="muted small">Platform fee: {PLATFORM_FEE_PCT}% of the commission you pay creators, disclosed to both sides.</p>
      {error && <p className="form-error">{error}</p>}
      <div className="row">
        <button className="btn btn--primary" disabled={busy}>{busy ? 'Posting…' : 'Post brief'}</button>
        <button type="button" className="btn btn--ghost" onClick={onDone}>Cancel</button>
      </div>
    </form>
  )
}

function Applicants({ brief }: { brief: Brief }) {
  const [apps, setApps] = useState<(Application & { profile?: CreatorProfile })[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data } = await supabase!.from('applications').select('*').eq('brief_id', brief.id).order('created_at')
    const list = (data ?? []) as Application[]
    const ids = list.map((a) => a.creator_id)
    const { data: profiles } = ids.length
      ? await supabase!.from('creator_profiles').select('*').in('user_id', ids)
      : { data: [] }
    const byId = new Map((profiles ?? []).map((p) => [p.user_id, p as CreatorProfile]))
    setApps(list.map((a) => ({ ...a, profile: byId.get(a.creator_id) })))
  }, [brief.id])
  useEffect(() => {
    load()
  }, [load])

  const update = async (id: string, patch: Partial<Application>) => {
    setError(null)
    const { error } = await supabase!.from('applications').update(patch).eq('id', id)
    if (error) setError(errorMessage(error))
    load()
  }

  if (!apps) return <Spinner label="Loading applicants…" />
  if (apps.length === 0) return <p className="muted">No applications yet.</p>

  return (
    <div className="stack applicants">
      {error && <p className="form-error">{error}</p>}
      {apps.map((a) => {
        const e = earnings(Number(a.sales_total), brief.commission_pct)
        const content = safeHttpUrl(a.content_url)
        return (
          <div key={a.id} className="sub-card">
            <div className="card__head">
              <div>
                <strong>{a.profile?.display_name ?? 'Creator'}</strong>
                <span className="muted small"> · {a.profile?.niche ?? 'creator'}{a.profile?.audience_size ? ` · ${a.profile.audience_size.toLocaleString()} followers` : ''}</span>
              </div>
              <span className={`tag tag--${a.status}`}>{a.status}</span>
            </div>
            <Socials p={a.profile} />
            {a.pitch && <p className="pre small">{a.pitch}</p>}
            {a.referral_code && <p className="small">Referral code: <code>{a.referral_code}</code> (create this as a discount code in your store to attribute sales)</p>}
            {content && <p className="small">Content: <a href={content} target="_blank" rel="noopener noreferrer">{content}</a></p>}
            {a.status === 'pending' && (
              <div className="row">
                <button className="btn btn--primary btn--sm" onClick={() => update(a.id, { status: 'accepted' })}>Accept</button>
                <button className="btn btn--ghost btn--sm" onClick={() => update(a.id, { status: 'declined' })}>Decline</button>
              </div>
            )}
            {a.status === 'accepted' && <p className="muted small">Ship the product to {a.profile?.contact_email ?? 'the creator'}. Waiting for their content.</p>}
            {a.status === 'submitted' && (
              <div className="row">
                <button className="btn btn--primary btn--sm" onClick={() => update(a.id, { status: 'approved' })}>Approve content</button>
                <button className="btn btn--ghost btn--sm" onClick={() => update(a.id, { status: 'accepted' })}>Request changes</button>
              </div>
            )}
            {['accepted', 'submitted', 'approved'].includes(a.status) && (
              <SalesEditor
                total={Number(a.sales_total)}
                onSave={(v) => update(a.id, { sales_total: v })}
                summary={`Commission owed: ${money(e.commission)} (creator gets ${money(e.creatorNet)}, platform fee ${money(e.fee)})`}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

function SalesEditor({ total, onSave, summary }: { total: number; onSave: (v: number) => void; summary: string }) {
  const [value, setValue] = useState(total.toString())
  return (
    <div className="sales">
      <label className="field field--inline">
        <span>Attributed sales ($)</span>
        <input type="number" min={0} step="0.01" value={value} onChange={(e) => setValue(e.target.value)} />
      </label>
      <button className="btn btn--ghost btn--sm" onClick={() => onSave(Math.max(0, Number(value) || 0))}>Save</button>
      <span className="muted small">{summary}</span>
    </div>
  )
}

function Socials({ p }: { p?: CreatorProfile }) {
  if (!p) return null
  const links = [
    p.instagram && ['Instagram', `https://instagram.com/${p.instagram.replace(/^@/, '')}`],
    p.tiktok && ['TikTok', `https://tiktok.com/@${p.tiktok.replace(/^@/, '')}`],
    p.youtube && ['YouTube', safeHttpUrl(p.youtube) ?? `https://youtube.com/@${p.youtube.replace(/^@/, '')}`],
    safeHttpUrl(p.portfolio_url) && ['Portfolio', safeHttpUrl(p.portfolio_url)!],
  ].filter(Boolean) as [string, string][]
  if (!links.length) return null
  return (
    <div className="row small">
      {links.map(([label, href]) => <a key={label} href={href} target="_blank" rel="noopener noreferrer">{label} ↗</a>)}
    </div>
  )
}

/* ---------------- Creator side ---------------- */

function MyDeals() {
  const { user } = useAuth()
  const [rows, setRows] = useState<(Application & { brief?: Brief })[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data } = await supabase!.from('applications').select('*').eq('creator_id', user!.id).order('created_at', { ascending: false })
    const list = (data ?? []) as Application[]
    const { data: briefs } = list.length
      ? await supabase!.from('briefs').select('*').in('id', list.map((a) => a.brief_id))
      : { data: [] }
    const byId = new Map((briefs ?? []).map((b) => [b.id, b as Brief]))
    setRows(list.map((a) => ({ ...a, brief: byId.get(a.brief_id) })))
  }, [user])
  useEffect(() => {
    load()
  }, [load])

  if (!rows) return <Spinner label="Loading…" />
  if (rows.length === 0) return <EmptyState title="No deals yet">Browse briefs and apply to the ones that fit your audience.</EmptyState>

  const totals = rows.reduce(
    (acc, r) => {
      if (!r.brief) return acc
      const e = earnings(Number(r.sales_total), r.brief.commission_pct)
      return { sales: acc.sales + Number(r.sales_total), net: acc.net + e.creatorNet }
    },
    { sales: 0, net: 0 },
  )

  return (
    <>
      <div className="stats">
        <div className="stat"><div className="stat__value">{rows.filter((r) => ['accepted', 'submitted', 'approved'].includes(r.status)).length}</div><div className="stat__label">Active deals</div></div>
        <div className="stat"><div className="stat__value">{money(totals.sales)}</div><div className="stat__label">Sales you drove</div></div>
        <div className="stat"><div className="stat__value">{money(totals.net)}</div><div className="stat__label">Your earnings (after fee)</div></div>
      </div>
      {error && <p className="form-error">{error}</p>}
      <div className="stack">
        {rows.map((r) => (
          <DealCard key={r.id} row={r} onChanged={load} onError={setError} />
        ))}
      </div>
    </>
  )
}

function DealCard({ row, onChanged, onError }: { row: Application & { brief?: Brief }; onChanged: () => void; onError: (m: string | null) => void }) {
  const [url, setUrl] = useState(row.content_url ?? '')
  const b = row.brief
  const e = b ? earnings(Number(row.sales_total), b.commission_pct) : null

  const submitContent = async (ev: FormEvent) => {
    ev.preventDefault()
    onError(null)
    const { error } = await supabase!.from('applications').update({ content_url: url.trim(), status: 'submitted' }).eq('id', row.id)
    if (error) onError(error.message)
    onChanged()
  }

  return (
    <div className="card">
      <div className="card__head">
        <div>
          <h3>{b?.title ?? 'Brief removed'}</h3>
          <p className="muted small">{b?.brand_name} · {b?.commission_pct}% commission</p>
        </div>
        <span className={`tag tag--${row.status}`}>{row.status}</span>
      </div>
      {row.status === 'pending' && <p className="muted small">Waiting for the brand to review your application.</p>}
      {row.status === 'declined' && <p className="muted small">The brand went with other creators this time.</p>}
      {row.referral_code && <p className="small">Your referral code: <code>{row.referral_code}</code>. Share it with your audience so your sales are credited to you.</p>}
      {['accepted', 'submitted', 'approved'].includes(row.status) && b?.contact_email && (
        <p className="small">Brand contact: <a href={`mailto:${b.contact_email}`}>{b.contact_email}</a></p>
      )}
      {(row.status === 'accepted' || row.status === 'submitted') && (
        <form className="row" onSubmit={submitContent}>
          <input className="grow" type="url" required placeholder="Link to your post or video file" value={url} onChange={(ev) => setUrl(ev.target.value)} />
          <button className="btn btn--primary btn--sm">{row.status === 'submitted' ? 'Update link' : 'Submit content'}</button>
        </form>
      )}
      {row.status === 'approved' && <p className="form-notice">Content approved. Keep sharing your code!</p>}
      {e && Number(row.sales_total) > 0 && (
        <p className="small">Sales credited: {money(Number(row.sales_total))} → commission {money(e.commission)} − fee {money(e.fee)} = <strong>{money(e.creatorNet)}</strong></p>
      )}
    </div>
  )
}

function ProfileForm() {
  const { user } = useAuth()
  const [p, setP] = useState<Partial<CreatorProfile>>({})
  const [loaded, setLoaded] = useState(false)
  const [exists, setExists] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase!
      .from('creator_profiles')
      .select('*')
      .eq('user_id', user!.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setP(data)
          setExists(true)
        } else setP({ contact_email: user!.email })
        setLoaded(true)
      })
  }, [user])

  if (!loaded) return <Spinner label="Loading…" />
  const set = (k: keyof CreatorProfile) => (e: { target: { value: string } }) => setP({ ...p, [k]: e.target.value })

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setMsg(null)
    setError(null)
    const row = {
      display_name: (p.display_name ?? '').trim(),
      niche: p.niche?.trim() || null,
      bio: p.bio?.trim() || null,
      instagram: p.instagram?.trim() || null,
      tiktok: p.tiktok?.trim() || null,
      youtube: p.youtube?.trim() || null,
      audience_size: p.audience_size ? Number(p.audience_size) : null,
      portfolio_url: p.portfolio_url?.trim() || null,
      contact_email: p.contact_email?.trim() || null,
      updated_at: new Date().toISOString(),
    }
    const { error } = exists
      ? await supabase!.from('creator_profiles').update(row).eq('user_id', user!.id)
      : await supabase!.from('creator_profiles').insert(row)
    if (error) setError(error.message)
    else {
      setExists(true)
      setMsg('Profile saved. Brands will see this when you apply.')
    }
  }

  return (
    <form className="card form" onSubmit={save}>
      <h2>Creator profile</h2>
      <p className="muted">Brands see this when you apply to their briefs.</p>
      <div className="grid-2">
        <label className="field"><span>Display name</span><input required maxLength={80} value={p.display_name ?? ''} onChange={set('display_name')} /></label>
        <label className="field"><span>Niche</span><input value={p.niche ?? ''} onChange={set('niche')} placeholder="e.g. streetwear, skincare, home decor" /></label>
        <label className="field"><span>Instagram handle</span><input value={p.instagram ?? ''} onChange={set('instagram')} placeholder="@you" /></label>
        <label className="field"><span>TikTok handle</span><input value={p.tiktok ?? ''} onChange={set('tiktok')} placeholder="@you" /></label>
        <label className="field"><span>YouTube (handle or link)</span><input value={p.youtube ?? ''} onChange={set('youtube')} /></label>
        <label className="field"><span>Total followers</span><input type="number" min={0} value={p.audience_size ?? ''} onChange={set('audience_size')} /></label>
        <label className="field"><span>Portfolio link</span><input type="url" value={p.portfolio_url ?? ''} onChange={set('portfolio_url')} /></label>
        <label className="field"><span>Contact / shipping email</span><input type="email" value={p.contact_email ?? ''} onChange={set('contact_email')} /></label>
      </div>
      <label className="field"><span>Bio</span><textarea rows={3} maxLength={1000} value={p.bio ?? ''} onChange={set('bio')} /></label>
      {error && <p className="form-error">{error}</p>}
      {msg && <p className="form-notice">{msg}</p>}
      <button className="btn btn--primary">Save profile</button>
    </form>
  )
}
