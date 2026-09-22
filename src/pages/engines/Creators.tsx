import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { EmptyState, Spinner, Stat, errorMessage } from '../../components/ui'
import { api } from '../../lib/api'
import { safeHttpUrl } from '../../lib/drops'

interface Creator {
  id: string
  name: string
  niche: string | null
  email: string | null
  instagram: string | null
  tiktok: string | null
  youtube: string | null
  audience_size: number | null
  notes: string | null
}

interface Campaign {
  id: string
  title: string
  product: string
  brief: string | null
  commission_pct: number
  product_value: number | null
  status: 'open' | 'closed'
}

interface Deal {
  id: string
  campaign_id: string
  creator_id: string
  status: 'invited' | 'shipped' | 'submitted' | 'approved' | 'paid' | 'declined'
  referral_code: string | null
  content_url: string | null
  sales_total: number
  paid_total: number
  notes: string | null
}

interface Data {
  creators: Creator[]
  campaigns: Campaign[]
  deals: Deal[]
}

type Tab = 'deals' | 'creators' | 'campaigns'

const STATUSES: { id: Deal['status']; label: string }[] = [
  { id: 'invited', label: 'Invited' },
  { id: 'shipped', label: 'Product shipped' },
  { id: 'submitted', label: 'Content submitted' },
  { id: 'approved', label: 'Approved / live' },
  { id: 'paid', label: 'Paid' },
  { id: 'declined', label: 'Declined' },
]

const money = (n: number) => n.toLocaleString(undefined, { style: 'currency', currency: 'USD' })

export function Creators() {
  const [tab, setTab] = useState<Tab>('deals')
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setData(await api.get<Data>('creators'))
    } catch (e) {
      setError(errorMessage(e))
    }
  }, [])
  useEffect(() => {
    load()
  }, [load])

  if (!data) return error ? <p className="form-error">{error}</p> : <Spinner label="Loading…" />

  return (
    <>
      <div className="tabs" role="tablist">
        {([
          ['deals', `Deals (${data.deals.length})`],
          ['creators', `Creators (${data.creators.length})`],
          ['campaigns', `Campaigns (${data.campaigns.length})`],
        ] as [Tab, string][]).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={`tab${tab === id ? ' is-active' : ''}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {error && <p className="form-error">{error}</p>}
      {tab === 'deals' && <Deals data={data} reload={load} onError={setError} goTo={setTab} />}
      {tab === 'creators' && <CreatorsTab data={data} reload={load} onError={setError} />}
      {tab === 'campaigns' && <CampaignsTab data={data} reload={load} onError={setError} />}
    </>
  )
}

/* ---------------- Deals ---------------- */

function Deals({ data, reload, onError, goTo }: { data: Data; reload: () => Promise<void>; onError: (m: string | null) => void; goTo: (t: Tab) => void }) {
  const [campaignId, setCampaignId] = useState('')
  const [creatorId, setCreatorId] = useState('')
  const [filter, setFilter] = useState<string>('active')
  const campaigns = new Map(data.campaigns.map((c) => [c.id, c]))
  const creators = new Map(data.creators.map((c) => [c.id, c]))

  const owed = (d: Deal) => {
    const pct = campaigns.get(d.campaign_id)?.commission_pct ?? 0
    return { commission: (d.sales_total * pct) / 100, due: Math.max(0, (d.sales_total * pct) / 100 - d.paid_total) }
  }
  const totals = data.deals.reduce(
    (t, d) => ({ sales: t.sales + d.sales_total, commission: t.commission + owed(d).commission, due: t.due + owed(d).due }),
    { sales: 0, commission: 0, due: 0 },
  )

  if (data.creators.length === 0 || data.campaigns.length === 0) {
    return (
      <EmptyState title="Start by adding a creator and a campaign">
        <div className="row" style={{ justifyContent: 'center', marginTop: '0.75rem' }}>
          <button className="btn btn--primary btn--sm" onClick={() => goTo('creators')}>Add creators</button>
          <button className="btn btn--ghost btn--sm" onClick={() => goTo('campaigns')}>Add a campaign</button>
        </div>
      </EmptyState>
    )
  }

  const add = async (e: FormEvent) => {
    e.preventDefault()
    onError(null)
    try {
      await api.post('deals/save', { campaign_id: campaignId, creator_id: creatorId })
      setCreatorId('')
      await reload()
    } catch (err) {
      onError(errorMessage(err))
    }
  }

  const shown = data.deals.filter((d) => (filter === 'all' ? true : filter === 'active' ? !['paid', 'declined'].includes(d.status) : d.status === filter))

  return (
    <>
      <div className="stats">
        <Stat label="Active deals" value={data.deals.filter((d) => !['paid', 'declined'].includes(d.status)).length} />
        <Stat label="Sales from creators" value={money(totals.sales)} />
        <Stat label="Commission earned" value={money(totals.commission)} />
        <Stat label="Still owed to creators" value={money(totals.due)} />
      </div>

      <form className="card row" onSubmit={add}>
        <select className="grow" required value={campaignId} onChange={(e) => setCampaignId(e.target.value)} aria-label="Campaign">
          <option value="">Choose campaign…</option>
          {data.campaigns.filter((c) => c.status === 'open').map((c) => <option key={c.id} value={c.id}>{c.title} ({c.commission_pct}%)</option>)}
        </select>
        <select className="grow" required value={creatorId} onChange={(e) => setCreatorId(e.target.value)} aria-label="Creator">
          <option value="">Choose creator…</option>
          {data.creators.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button className="btn btn--primary">Add deal</button>
      </form>

      <div className="filters">
        <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter deals">
          <option value="active">Active deals</option>
          <option value="all">All deals</option>
          {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </div>

      {shown.length === 0 ? (
        <EmptyState title="No deals here" />
      ) : (
        <div className="stack">
          {shown.map((d) => (
            <DealCard key={d.id} deal={d} campaign={campaigns.get(d.campaign_id)} creator={creators.get(d.creator_id)} owed={owed(d)} reload={reload} onError={onError} />
          ))}
        </div>
      )}
      <p className="muted small">Tip: create each creator’s referral code as a discount code in your store, so you can see exactly which sales they drove.</p>
    </>
  )
}

function DealCard({ deal, campaign, creator, owed, reload, onError }: {
  deal: Deal
  campaign?: Campaign
  creator?: Creator
  owed: { commission: number; due: number }
  reload: () => Promise<void>
  onError: (m: string | null) => void
}) {
  const [contentUrl, setContentUrl] = useState(deal.content_url ?? '')
  const [sales, setSales] = useState(String(deal.sales_total))
  const [paid, setPaid] = useState(String(deal.paid_total))
  const content = safeHttpUrl(deal.content_url)

  const save = async (patch: Partial<Record<keyof Deal, unknown>>) => {
    onError(null)
    try {
      await api.post('deals/save', { id: deal.id, ...patch })
      await reload()
    } catch (err) {
      onError(errorMessage(err))
    }
  }

  return (
    <div className="card">
      <div className="card__head">
        <div>
          <h3>{creator?.name ?? 'Creator'} × {campaign?.title ?? 'Campaign'}</h3>
          <p className="muted small">
            {campaign?.product} · {campaign?.commission_pct}% commission{deal.referral_code ? <> · code <code>{deal.referral_code}</code></> : null}
          </p>
        </div>
        <select value={deal.status} onChange={(e) => save({ status: e.target.value })} aria-label="Deal status">
          {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </div>
      <div className="grid-2">
        <form className="row" onSubmit={(e) => { e.preventDefault(); save({ content_url: contentUrl }) }}>
          <input className="grow" type="url" placeholder="Link to their post or video" value={contentUrl} onChange={(e) => setContentUrl(e.target.value)} />
          <button className="btn btn--ghost btn--sm">Save link</button>
        </form>
        <form className="row" onSubmit={(e) => { e.preventDefault(); save({ sales_total: sales, paid_total: paid }) }}>
          <label className="field field--inline"><span>Sales $</span><input type="number" min={0} step="0.01" value={sales} onChange={(e) => setSales(e.target.value)} /></label>
          <label className="field field--inline"><span>Paid $</span><input type="number" min={0} step="0.01" value={paid} onChange={(e) => setPaid(e.target.value)} /></label>
          <button className="btn btn--ghost btn--sm">Save</button>
        </form>
      </div>
      <div className="row small" style={{ marginTop: '0.75rem', justifyContent: 'space-between' }}>
        <span>
          Commission {money(owed.commission)} · <strong>{owed.due > 0 ? `${money(owed.due)} still owed` : 'nothing owed'}</strong>
          {content && <> · <a href={content} target="_blank" rel="noopener noreferrer">View content ↗</a></>}
          {creator?.email && <> · <a href={`mailto:${creator.email}`}>Email creator</a></>}
        </span>
        <button className="link danger" onClick={() => confirm('Remove this deal?') && api.post('records/delete', { kind: 'deal', id: deal.id }).then(reload)}>Remove</button>
      </div>
    </div>
  )
}

/* ---------------- Creators ---------------- */

function CreatorsTab({ data, reload, onError }: { data: Data; reload: () => Promise<void>; onError: (m: string | null) => void }) {
  const [editing, setEditing] = useState<Partial<Creator> | null>(null)
  if (editing) return <CreatorForm initial={editing} onDone={async () => { setEditing(null); await reload() }} onError={onError} />
  return (
    <>
      <div className="toolbar">
        <p className="muted">Everyone you work with or want to work with.</p>
        <button className="btn btn--primary" onClick={() => setEditing({})}>+ Add creator</button>
      </div>
      {data.creators.length === 0 ? (
        <EmptyState title="No creators yet">Add the creators you’re talking to so you can track deals with them.</EmptyState>
      ) : (
        <div className="grid-2">
          {data.creators.map((c) => (
            <div key={c.id} className="card">
              <div className="card__head">
                <div>
                  <h3>{c.name}</h3>
                  <p className="muted small">{[c.niche, c.audience_size ? `${c.audience_size.toLocaleString()} followers` : null].filter(Boolean).join(' · ') || 'Creator'}</p>
                </div>
                <button className="btn btn--ghost btn--xs" onClick={() => setEditing(c)}>Edit</button>
              </div>
              <Socials c={c} />
              {c.notes && <p className="muted small pre">{c.notes}</p>}
              <p className="small">{data.deals.filter((d) => d.creator_id === c.id).length} deal(s)</p>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

function Socials({ c }: { c: Creator }) {
  const handle = (h: string) => h.replace(/^@/, '')
  const links = [
    c.instagram && ['Instagram', `https://instagram.com/${handle(c.instagram)}`],
    c.tiktok && ['TikTok', `https://tiktok.com/@${handle(c.tiktok)}`],
    c.youtube && ['YouTube', safeHttpUrl(c.youtube) ?? `https://youtube.com/@${handle(c.youtube)}`],
  ].filter(Boolean) as [string, string][]
  if (!links.length) return null
  return <div className="row small">{links.map(([label, href]) => <a key={label} href={href} target="_blank" rel="noopener noreferrer">{label} ↗</a>)}</div>
}

function CreatorForm({ initial, onDone, onError }: { initial: Partial<Creator>; onDone: () => void; onError: (m: string | null) => void }) {
  const [f, setF] = useState<Partial<Creator>>(initial)
  const set = (k: keyof Creator) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    onError(null)
    try {
      await api.post('creators/save', f)
      onDone()
    } catch (err) {
      onError(errorMessage(err))
    }
  }
  return (
    <form className="card form" onSubmit={submit}>
      <h2>{initial.id ? 'Edit creator' : 'Add creator'}</h2>
      <div className="grid-2">
        <label className="field"><span>Name</span><input required maxLength={80} value={f.name ?? ''} onChange={set('name')} /></label>
        <label className="field"><span>Niche</span><input value={f.niche ?? ''} onChange={set('niche')} placeholder="e.g. streetwear, skincare" /></label>
        <label className="field"><span>Email / shipping contact</span><input type="email" value={f.email ?? ''} onChange={set('email')} /></label>
        <label className="field"><span>Total followers</span><input type="number" min={0} value={f.audience_size ?? ''} onChange={set('audience_size')} /></label>
        <label className="field"><span>Instagram</span><input value={f.instagram ?? ''} onChange={set('instagram')} placeholder="@handle" /></label>
        <label className="field"><span>TikTok</span><input value={f.tiktok ?? ''} onChange={set('tiktok')} placeholder="@handle" /></label>
        <label className="field"><span>YouTube</span><input value={f.youtube ?? ''} onChange={set('youtube')} placeholder="@handle or link" /></label>
      </div>
      <label className="field"><span>Notes</span><textarea rows={3} maxLength={2000} value={f.notes ?? ''} onChange={set('notes')} placeholder="Rates, sizes, address, what they’re great at…" /></label>
      <div className="row">
        <button className="btn btn--primary">Save creator</button>
        <button type="button" className="btn btn--ghost" onClick={onDone}>Cancel</button>
        {initial.id && (
          <button type="button" className="link danger" onClick={async () => {
            if (confirm(`Delete ${initial.name} and their deals?`)) {
              await api.post('records/delete', { kind: 'creator', id: initial.id })
              onDone()
            }
          }}>Delete</button>
        )}
      </div>
    </form>
  )
}

/* ---------------- Campaigns ---------------- */

function CampaignsTab({ data, reload, onError }: { data: Data; reload: () => Promise<void>; onError: (m: string | null) => void }) {
  const [editing, setEditing] = useState<Partial<Campaign> | null>(null)
  if (editing) return <CampaignForm initial={editing} onDone={async () => { setEditing(null); await reload() }} onError={onError} />
  return (
    <>
      <div className="toolbar">
        <p className="muted">What you want creators to make, and the commission you pay on sales.</p>
        <button className="btn btn--primary" onClick={() => setEditing({ commission_pct: 15, status: 'open' })}>+ New campaign</button>
      </div>
      {data.campaigns.length === 0 ? (
        <EmptyState title="No campaigns yet">Create one for each product or push you want creators on.</EmptyState>
      ) : (
        <div className="stack">
          {data.campaigns.map((c) => {
            const deals = data.deals.filter((d) => d.campaign_id === c.id)
            const sales = deals.reduce((s, d) => s + d.sales_total, 0)
            return (
              <div key={c.id} className="card">
                <div className="card__head">
                  <div>
                    <h3>{c.title}</h3>
                    <p className="muted small">{c.product} · {c.commission_pct}% commission · <span className={`tag tag--${c.status}`}>{c.status}</span></p>
                  </div>
                  <button className="btn btn--ghost btn--xs" onClick={() => setEditing(c)}>Edit</button>
                </div>
                {c.brief && <p className="muted small pre clamp-3">{c.brief}</p>}
                <p className="small">{deals.length} creator(s) · {money(sales)} in sales</p>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

function CampaignForm({ initial, onDone, onError }: { initial: Partial<Campaign>; onDone: () => void; onError: (m: string | null) => void }) {
  const [f, setF] = useState<Partial<Campaign>>(initial)
  const set = (k: keyof Campaign) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    onError(null)
    try {
      await api.post('campaigns/save', f)
      onDone()
    } catch (err) {
      onError(errorMessage(err))
    }
  }
  return (
    <form className="card form" onSubmit={submit}>
      <h2>{initial.id ? 'Edit campaign' : 'New campaign'}</h2>
      <div className="grid-2">
        <label className="field"><span>Campaign name</span><input required maxLength={120} value={f.title ?? ''} onChange={set('title')} placeholder="e.g. Fall hoodie try-ons" /></label>
        <label className="field"><span>Product you’ll send</span><input required maxLength={200} value={f.product ?? ''} onChange={set('product')} /></label>
        <label className="field"><span>Commission on sales (%)</span><input type="number" required min={1} max={90} step="0.5" value={f.commission_pct ?? ''} onChange={set('commission_pct')} /></label>
        <label className="field"><span>Product value $ (optional)</span><input type="number" min={0} step="0.01" value={f.product_value ?? ''} onChange={set('product_value')} /></label>
      </div>
      <label className="field"><span>Brief (what to make, deadlines, do’s and don’ts)</span><textarea rows={4} maxLength={4000} value={f.brief ?? ''} onChange={set('brief')} /></label>
      <label className="field">
        <span>Status</span>
        <select value={f.status ?? 'open'} onChange={set('status')}><option value="open">Open</option><option value="closed">Closed</option></select>
      </label>
      <div className="row">
        <button className="btn btn--primary">Save campaign</button>
        <button type="button" className="btn btn--ghost" onClick={onDone}>Cancel</button>
        {initial.id && (
          <button type="button" className="link danger" onClick={async () => {
            if (confirm(`Delete "${initial.title}" and its deals?`)) {
              await api.post('records/delete', { kind: 'campaign', id: initial.id })
              onDone()
            }
          }}>Delete</button>
        )}
      </div>
    </form>
  )
}
