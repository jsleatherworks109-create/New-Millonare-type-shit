import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { CopyButton, EmptyState, NeedsDatabase, Spinner, errorMessage } from '../../components/ui'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { dropUrl, slugify, toLocalInput, type Drop } from '../../lib/drops'
import { prepareImage } from '../../lib/images'
import { hasAccess } from '../../lib/plans'
import { supabase } from '../../lib/supabase'

export function Drops() {
  const { user, plan } = useAuth()
  const [drops, setDrops] = useState<Drop[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Drop | 'new' | null>(null)
  const [selected, setSelected] = useState<Drop | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!supabase || !user) return
    const { data, error } = await supabase.from('drops').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
    if (error) setError(error.message)
    const list = (data ?? []) as Drop[]
    setDrops(list)
    if (list.length) {
      const { data: rows } = await supabase.from('waitlist').select('drop_id').in('drop_id', list.map((d) => d.id))
      const c: Record<string, number> = {}
      for (const r of rows ?? []) c[r.drop_id] = (c[r.drop_id] ?? 0) + 1
      setCounts(c)
    }
    setLoading(false)
  }, [user])

  useEffect(() => {
    load()
  }, [load])

  if (!supabase) return <NeedsDatabase feature="Drops & Launches" />

  const canCreate = hasAccess(plan, 'growth') || drops.length < 1

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
        onBack={() => setSelected(null)}
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
        {canCreate ? (
          <button className="btn btn--primary" onClick={() => setEditing('new')}>+ New drop</button>
        ) : (
          <Link className="btn btn--primary" to="/app/billing">Upgrade for more drops</Link>
        )}
      </div>
      {error && <p className="form-error">{error}</p>}
      {loading ? (
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
                <p className="small"><strong>{counts[d.id] ?? 0}</strong> on the waitlist</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </>
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
      title: title.trim(),
      slug: slug || slugify(title),
      description: description.trim() || null,
      image_url: imageUrl.trim() || null,
      price: price.trim() || null,
      store_url: storeUrl.trim() || null,
      launch_at: new Date(launchAt).toISOString(),
      quantity: quantity ? Number(quantity) : null,
      status,
    }
    const query = drop
      ? supabase!.from('drops').update(row).eq('id', drop.id).select().single()
      : supabase!.from('drops').insert(row).select().single()
    const { data, error } = await query
    setBusy(false)
    if (error) {
      setError(
        error.code === '23505'
          ? 'That link name is taken. Try another.'
          : error.code === '42501'
            ? 'The Starter plan includes one launch page. Upgrade to create more.'
            : error.message,
      )
      return
    }
    onSaved(data as Drop)
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
          <span>Launch date & time (your time zone)</span>
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
  email_preview: string
  email_body: string
  instagram_caption: string
  tiktok_script: string
  sms: string
  countdown_posts: { when: string; post: string }[]
}

function DropDetail({ drop, onBack, onEdit, onChanged }: { drop: Drop; onBack: () => void; onEdit: () => void; onChanged: (d: Drop) => void }) {
  const { plan } = useAuth()
  const [waitlist, setWaitlist] = useState<{ email: string; created_at: string }[]>([])
  const [copy, setCopy] = useState<DropCopy | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const link = dropUrl(drop.slug)

  useEffect(() => {
    supabase!
      .from('waitlist')
      .select('email, created_at')
      .eq('drop_id', drop.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => setWaitlist(data ?? []))
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
        url: link,
      })
      setCopy(output)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const setStatus = async (status: Drop['status']) => {
    const { data, error } = await supabase!.from('drops').update({ status }).eq('id', drop.id).select().single()
    if (error) setError(error.message)
    else onChanged(data as Drop)
  }

  const remove = async () => {
    if (!confirm(`Delete "${drop.title}" and its waitlist? This can’t be undone.`)) return
    const { error } = await supabase!.from('drops').delete().eq('id', drop.id)
    if (error) setError(error.message)
    else onBack()
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
          <div className="link-box">
            <code className="truncate">{link}</code>
            <CopyButton text={link} label="Copy link" />
            <a className="btn btn--ghost btn--xs" href={`/d/${drop.slug}`} target="_blank" rel="noreferrer">Open ↗</a>
          </div>
          {drop.status === 'draft' && <p className="form-notice">This drop is a draft. Only you can see the page. Set it live to start collecting sign-ups.</p>}
          <div className="row">
            <button className="btn btn--ghost btn--sm" onClick={onEdit}>Edit</button>
            {drop.status !== 'live' && <button className="btn btn--ghost btn--sm" onClick={() => setStatus('live')}>Set live</button>}
            {drop.status === 'live' && <button className="btn btn--ghost btn--sm" onClick={() => setStatus('ended')}>End drop</button>}
            <button className="btn btn--ghost btn--sm danger" onClick={remove}>Delete</button>
          </div>
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
              {waitlist.slice(0, 50).map((w) => (
                <li key={w.email}><span className="truncate">{w.email}</span><span className="muted small">{new Date(w.created_at).toLocaleDateString()}</span></li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h3>Launch announcements</h3>
          {hasAccess(plan, 'growth') ? (
            <>
              <p className="muted">Email, Instagram, TikTok, SMS and a countdown schedule written for this drop.</p>
              <button className="btn btn--primary" onClick={writeCopy} disabled={busy}>{busy ? 'Writing…' : copy ? 'Write new versions' : 'Write announcements'}</button>
              {busy && <Spinner label="Writing announcements…" />}
            </>
          ) : (
            <p className="muted">AI-written announcements are included with Growth. <Link to="/app/billing">Upgrade</Link></p>
          )}
        </section>
      </div>

      {copy && (
        <div className="results">
          <section className="card">
            <div className="card__head"><h3>Email</h3><CopyButton text={`Subject: ${copy.email_subject}\nPreview: ${copy.email_preview}\n\n${copy.email_body}`} /></div>
            <p><strong>Subject:</strong> {copy.email_subject}</p>
            <p className="muted small">Preview: {copy.email_preview}</p>
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
