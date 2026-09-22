import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { CopyButton, EmptyState, Spinner, errorMessage } from '../../components/ui'
import { api } from '../../lib/api'
import { slugify, toLocalInput, type Drop } from '../../lib/drops'
import { prepareImage } from '../../lib/images'
import { aiWaitHint, useAppStatus } from '../../lib/status'

type DropRow = Drop & { waitlist_count?: number }

export function Drops() {
  const [drops, setDrops] = useState<DropRow[] | null>(null)
  const [editing, setEditing] = useState<Drop | 'new' | null>(null)
  const [selected, setSelected] = useState<Drop | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setDrops((await api.get<{ drops: DropRow[] }>('drops')).drops)
    } catch (e) {
      setError(errorMessage(e))
      setDrops([])
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (editing) {
    return (
      <DropForm
        drop={editing === 'new' ? null : editing}
        onCancel={() => setEditing(null)}
        onSaved={async (d) => {
          setEditing(null)
          await load()
          setSelected(d)
        }}
      />
    )
  }

  if (selected) {
    return (
      <DropDetail
        drop={selected}
        onBack={() => {
          setSelected(null)
          load()
        }}
        onEdit={() => setEditing(selected)}
        onChanged={async (d) => {
          await load()
          setSelected(d)
        }}
      />
    )
  }

  return (
    <>
      <div className="toolbar">
        <p className="muted">Create a launch page with a countdown and waitlist, share the link, and watch sign-ups roll in.</p>
        <button className="btn btn--primary" onClick={() => setEditing('new')}>+ New drop</button>
      </div>
      <SharingPanel />
      {error && <p className="form-error">{error}</p>}
      {!drops ? (
        <Spinner label="Loading drops…" />
      ) : drops.length === 0 ? (
        <EmptyState title="No drops yet">Create your first launch page. It takes about a minute.</EmptyState>
      ) : (
        <div className="drop-grid">
          {drops.map((d) => (
            <button key={d.id} className="drop-card" onClick={() => setSelected(d)}>
              {d.image_url ? <img src={d.image_url} alt="" /> : <div className="drop-card__ph">▲</div>}
              <div className="drop-card__body">
                <span className={`tag tag--${d.status}`}>{d.status}</span>
                <h3>{d.title}</h3>
                <p className="muted small">Launches {new Date(d.launch_at).toLocaleString()}</p>
                <p className="small"><strong>{d.waitlist_count ?? 0}</strong> on the waitlist</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </>
  )
}

function SharingPanel() {
  const { publicUrl } = useAppStatus()
  if (publicUrl) {
    return (
      <div className="form-notice">
        <strong>Sharing is on.</strong> Shoppers can open your live drops at <code>{publicUrl}/d/…</code>. Keep the sharing window open.
      </div>
    )
  }
  return (
    <div className="panel panel--stack small">
      <strong>Launch pages are only visible on this PC right now.</strong>
      <span className="muted">
        To let shoppers see them, double-click <code>Share launch pages.bat</code> in the Selamont folder (or run <code>npm run share</code>).
        It creates a free public link that only shows launch pages, never your tools.
      </span>
    </div>
  )
}

function DropForm({ drop, onCancel, onSaved }: { drop: Drop | null; onCancel: () => void; onSaved: (d: Drop) => void }) {
  const tomorrow = new Date(Date.now() + 86_400_000)
  tomorrow.setMinutes(0, 0, 0)
  const [title, setTitle] = useState(drop?.title ?? '')
  const [slug, setSlug] = useState(drop?.slug ?? '')
  const [slugTouched, setSlugTouched] = useState(!!drop)
  const [description, setDescription] = useState(drop?.description ?? '')
  const [imageUrl, setImageUrl] = useState(drop?.image_url ?? '')
  const [price, setPrice] = useState(drop?.price ?? '')
  const [storeUrl, setStoreUrl] = useState(drop?.store_url ?? '')
  const [launchAt, setLaunchAt] = useState(toLocalInput(drop?.launch_at ?? tomorrow.toISOString()))
  const [quantity, setQuantity] = useState(drop?.quantity?.toString() ?? '')
  const [status, setStatus] = useState<Drop['status']>(drop?.status ?? 'live')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onImage = async (file: File | undefined) => {
    if (!file) return
    try {
      setImageUrl((await prepareImage(file, 1000)).previewUrl)
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const row = {
      id: drop?.id,
      title,
      slug: slug || slugify(title),
      description,
      image_url: imageUrl,
      price,
      store_url: storeUrl,
      launch_at: new Date(launchAt).toISOString(),
      quantity: quantity ? Number(quantity) : null,
      status,
    }
    try {
      const { drop: saved } = await api.post<{ drop: Drop }>(drop ? 'drops/update' : 'drops/create', row)
      onSaved(saved)
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <form className="card form" onSubmit={submit}>
      <h2>{drop ? 'Edit drop' : 'New drop'}</h2>
      <div className="grid-2">
        <label className="field">
          <span>Drop name</span>
          <input required maxLength={120} value={title} onChange={(e) => {
            setTitle(e.target.value)
            if (!slugTouched) setSlug(slugify(e.target.value))
          }} placeholder="e.g. Fall Capsule 01" />
        </label>
        <label className="field">
          <span>Page link</span>
          <div className="prefix-input">
            <span>/d/</span>
            <input required pattern="[a-z0-9][a-z0-9\-]{2,59}" title="3–60 lowercase letters, numbers or dashes" value={slug}
              onChange={(e) => { setSlug(slugify(e.target.value)); setSlugTouched(true) }} />
          </div>
        </label>
      </div>
      <label className="field">
        <span>Description</span>
        <textarea rows={4} maxLength={4000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What’s dropping, why it’s special, how many are available…" />
      </label>
      <div className="grid-2">
        <label className="field">
          <span>Launch date & time</span>
          <input type="datetime-local" required value={launchAt} onChange={(e) => setLaunchAt(e.target.value)} />
        </label>
        <label className="field">
          <span>Price (optional)</span>
          <input maxLength={40} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="$48" />
        </label>
        <label className="field">
          <span>Link to buy (your store)</span>
          <input type="url" value={storeUrl} onChange={(e) => setStoreUrl(e.target.value)} placeholder="https://yourstore.com/products/…" />
        </label>
        <label className="field">
          <span>Quantity available (optional)</span>
          <input type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="e.g. 100" />
        </label>
      </div>
      <div className="field">
        <span>Hero image</span>
        <div className="row">
          {imageUrl && <img className="thumb" src={imageUrl} alt="" />}
          <label className="btn btn--ghost btn--sm">
            Upload image
            <input type="file" accept="image/*" hidden onChange={(e) => onImage(e.target.files?.[0])} />
          </label>
          {imageUrl && <button type="button" className="link" onClick={() => setImageUrl('')}>Remove</button>}
        </div>
      </div>
      <label className="field">
        <span>Status</span>
        <select value={status} onChange={(e) => setStatus(e.target.value as Drop['status'])}>
          <option value="live">Live (page is public and collecting sign-ups)</option>
          <option value="draft">Draft (only you can see it)</option>
          <option value="ended">Ended (page shows the drop is over)</option>
        </select>
      </label>
      {error && <p className="form-error">{error}</p>}
      <div className="row">
        <button className="btn btn--primary" disabled={busy}>{busy ? 'Saving…' : drop ? 'Save changes' : 'Create drop'}</button>
        <button type="button" className="btn btn--ghost" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}

interface DropCopy {
  email_subject: string
  email_body: string
  instagram_caption: string
  tiktok_script: string
  sms: string
  countdown_posts: { when: string; post: string }[]
}

function DropDetail({ drop, onBack, onEdit, onChanged }: { drop: Drop; onBack: () => void; onEdit: () => void; onChanged: (d: Drop) => void }) {
  const { ai, publicUrl } = useAppStatus()
  const [waitlist, setWaitlist] = useState<{ email: string; created_at: string }[]>([])
  const [copy, setCopy] = useState<DropCopy | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const publicLink = publicUrl ? `${publicUrl}/d/${drop.slug}` : null

  useEffect(() => {
    api.get<{ waitlist: typeof waitlist }>(`drops/waitlist?id=${encodeURIComponent(drop.id)}`).then((d) => setWaitlist(d.waitlist)).catch(() => {})
  }, [drop.id])

  const exportCsv = () => {
    const csv = ['email,joined_at', ...waitlist.map((w) => `${w.email},${w.created_at}`)].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `${drop.slug}-waitlist.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const writeCopy = async () => {
    setBusy(true)
    setError(null)
    try {
      const { output } = await api.post<{ output: DropCopy }>('drop-copy', {
        title: drop.title,
        description: drop.description,
        price: drop.price,
        launchAt: new Date(drop.launch_at).toLocaleString(),
        quantity: drop.quantity,
        url: publicLink ?? '',
      })
      setCopy(output)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const setStatus = async (status: Drop['status']) => {
    try {
      onChanged((await api.post<{ drop: Drop }>('drops/update', { id: drop.id, status })).drop)
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  const remove = async () => {
    if (!confirm(`Delete "${drop.title}" and its waitlist? This can’t be undone.`)) return
    try {
      await api.post('drops/delete', { id: drop.id })
      onBack()
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  return (
    <>
      <button className="link" onClick={onBack}>← All drops</button>
      <section className="card drop-detail">
        {drop.image_url && <img src={drop.image_url} alt="" className="drop-detail__img" />}
        <div className="stack">
          <div className="card__head">
            <h2>{drop.title}</h2>
            <span className={`tag tag--${drop.status}`}>{drop.status}</span>
          </div>
          <p className="muted">Launches {new Date(drop.launch_at).toLocaleString()}{drop.price ? ` · ${drop.price}` : ''}{drop.quantity ? ` · ${drop.quantity} available` : ''}</p>
          {publicLink ? (
            <div className="link-box">
              <code className="truncate">{publicLink}</code>
              <CopyButton text={publicLink} label="Copy public link" />
            </div>
          ) : (
            <p className="muted small">Public link appears here when sharing is on (see the Drops page).</p>
          )}
          <div className="row">
            <a className="btn btn--ghost btn--sm" href={`/d/${drop.slug}`} target="_blank" rel="noreferrer">Preview page ↗</a>
            <button className="btn btn--ghost btn--sm" onClick={onEdit}>Edit</button>
            {drop.status !== 'live' && <button className="btn btn--ghost btn--sm" onClick={() => setStatus('live')}>Set live</button>}
            {drop.status === 'live' && <button className="btn btn--ghost btn--sm" onClick={() => setStatus('ended')}>End drop</button>}
            <button className="btn btn--ghost btn--sm danger" onClick={remove}>Delete</button>
          </div>
          {drop.status === 'draft' && <p className="form-notice">Draft: shoppers can’t see this page. Set it live to start collecting sign-ups.</p>}
        </div>
      </section>
      {error && <p className="form-error">{error}</p>}

      <div className="grid-2">
        <section className="card">
          <div className="card__head">
            <h3>Waitlist ({waitlist.length})</h3>
            {waitlist.length > 0 && <button className="btn btn--ghost btn--xs" onClick={exportCsv}>Export CSV</button>}
          </div>
          {waitlist.length === 0 ? (
            <p className="muted">No sign-ups yet. Share your link in your bio, stories and emails.</p>
          ) : (
            <ul className="plain-list">
              {waitlist.slice(0, 100).map((w) => (
                <li key={w.email}><span className="truncate">{w.email}</span><span className="muted small">{new Date(w.created_at).toLocaleDateString()}</span></li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h3>Launch announcements</h3>
          <p className="muted">Email, Instagram, TikTok, SMS and countdown posts written for this drop. {aiWaitHint(ai, '2–4 minutes')}</p>
          <button className="btn btn--primary" onClick={writeCopy} disabled={busy || ai?.ready === false}>{busy ? 'Writing…' : copy ? 'Write new versions' : 'Write announcements'}</button>
          {busy && <Spinner label="Writing announcements…" />}
        </section>
      </div>

      {copy && (
        <div className="results">
          <section className="card">
            <div className="card__head"><h3>Email</h3><CopyButton text={`Subject: ${copy.email_subject}\n\n${copy.email_body}`} /></div>
            <p><strong>Subject:</strong> {copy.email_subject}</p>
            <p className="pre">{copy.email_body}</p>
          </section>
          <div className="grid-2">
            <section className="card"><div className="card__head"><h3>Instagram</h3><CopyButton text={copy.instagram_caption} /></div><p className="pre">{copy.instagram_caption}</p></section>
            <section className="card"><div className="card__head"><h3>TikTok script</h3><CopyButton text={copy.tiktok_script} /></div><p className="pre">{copy.tiktok_script}</p></section>
          </div>
          <section className="card"><div className="card__head"><h3>SMS</h3><CopyButton text={copy.sms} /></div><p>{copy.sms}</p></section>
          <section className="card">
            <h3>Countdown posts</h3>
            <ol className="numbered">
              {copy.countdown_posts.map((p, i) => <li key={i}><span><strong>{p.when}:</strong> {p.post}</span><CopyButton text={p.post} /></li>)}
            </ol>
          </section>
        </div>
      )}
    </>
  )
}
