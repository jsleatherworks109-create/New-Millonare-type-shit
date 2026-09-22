import { useEffect, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { LogoMark } from '../components/Logo'
import { api, ApiError } from '../lib/api'
import { safeHttpUrl, visitorId, type Drop } from '../lib/drops'

function useCountdown(target: number) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  const diff = Math.max(0, target - now)
  return {
    done: diff === 0,
    days: Math.floor(diff / 86_400_000),
    hours: Math.floor((diff / 3_600_000) % 24),
    minutes: Math.floor((diff / 60_000) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  }
}

export function PublicDrop() {
  const { slug } = useParams()
  const [drop, setDrop] = useState<Drop | null>(null)
  const [preview, setPreview] = useState(false)
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading')

  useEffect(() => {
    if (!slug) return
    const q = `?slug=${encodeURIComponent(slug)}`
    // In your own app, "preview" shows drafts and doesn't count as a visit.
    // On the public link that route doesn't exist, so shoppers fall through to the public one.
    api
      .get<{ drop: Drop }>(`preview/drop${q}`)
      .then((d) => ({ ...d, isPreview: true }))
      .catch(async (e) => {
        if (e instanceof ApiError && (e.status === 404 || e.status === 401)) return { ...(await api.get<{ drop: Drop }>(`public/drop${q}`)), isPreview: false }
        throw e
      })
      .then(({ drop, isPreview }) => {
        setDrop(drop)
        setPreview(isPreview)
        setState('ready')
        document.title = drop.title
        if (!isPreview) api.post('public/event', { dropId: drop.id, type: 'view', visitorId: visitorId() }).catch(() => {})
      })
      .catch(() => setState('missing'))
  }, [slug])

  if (state === 'loading') return <div className="page-loading">Loading…</div>
  if (state === 'missing' || !drop) {
    return (
      <div className="drop-page drop-page--center">
        <h1>Drop not found</h1>
        <p className="muted">This launch page doesn’t exist or isn’t public yet.</p>
      </div>
    )
  }
  return <DropView drop={drop} preview={preview} />
}

function DropView({ drop, preview }: { drop: Drop; preview: boolean }) {
  const t = useCountdown(new Date(drop.launch_at).getTime())
  const storeUrl = safeHttpUrl(drop.store_url)
  const isLive = drop.status === 'live' && t.done
  const ended = drop.status === 'ended'

  return (
    <div className="drop-page">
      {preview && <div className="demo-banner">Preview from your app{drop.status === 'draft' ? '. This is a draft, shoppers can’t see it' : ''}. Visits here aren’t counted.</div>}
      <div className="drop-hero">
        {drop.image_url && (
          <div className="drop-hero__media">
            <img src={drop.image_url} alt={drop.title} />
          </div>
        )}
        <div className="drop-hero__body">
          <span className="eyebrow">{ended ? 'Drop ended' : isLive ? 'Live now' : 'Dropping soon'}</span>
          <h1>{drop.title}</h1>
          <div className="drop-meta">
            {drop.price && <span>{drop.price}</span>}
            {drop.quantity && <span>Limited to {drop.quantity}</span>}
          </div>
          {drop.description && <p className="drop-desc">{drop.description}</p>}

          {!ended && !t.done && (
            <div className="countdown" aria-label="Time until launch">
              {([['days', t.days], ['hours', t.hours], ['mins', t.minutes], ['secs', t.seconds]] as const).map(([label, value]) => (
                <div key={label} className="countdown__cell">
                  <span className="countdown__num">{String(value).padStart(2, '0')}</span>
                  <span className="countdown__label">{label}</span>
                </div>
              ))}
            </div>
          )}
          {!ended && !t.done && <p className="muted small">Launches {new Date(drop.launch_at).toLocaleString()}</p>}

          {isLive && storeUrl && (
            <a className="btn btn--primary btn--lg btn--block" href={storeUrl} target="_blank" rel="noopener noreferrer"
              onClick={() => !preview && api.post('public/event', { dropId: drop.id, type: 'click', visitorId: visitorId() }).catch(() => {})}>
              Shop the drop →
            </a>
          )}

          {drop.status === 'live' && <WaitlistForm drop={drop} live={isLive} />}
          {ended && <p className="muted">This drop is over. Thanks to everyone who took part.</p>}
        </div>
      </div>
      <footer className="drop-footer">
        <LogoMark size={18} /> <span>Powered by Selamont</span>
      </footer>
    </div>
  )
}

function WaitlistForm({ drop, live }: { drop: Drop; live: boolean }) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'busy' | 'done' | 'dupe' | 'error'>('idle')
  const [message, setMessage] = useState('')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setStatus('busy')
    try {
      const res = await api.post<{ already: boolean }>('public/waitlist', { dropId: drop.id, email, visitorId: visitorId() })
      setStatus(res.already ? 'dupe' : 'done')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Couldn’t join right now.')
      setStatus('error')
    }
  }

  if (status === 'done' || status === 'dupe') {
    return <p className="form-notice">{status === 'done' ? 'You’re on the list! We’ll let you know when it drops.' : 'You’re already on the list.'}</p>
  }

  return (
    <form className="waitlist" onSubmit={submit}>
      <label className="sr-only" htmlFor="wl-email">Email</label>
      <input id="wl-email" type="email" required placeholder="you@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
      <button className={`btn btn--lg ${live ? 'btn--ghost' : 'btn--primary'}`} disabled={status === 'busy'}>
        {status === 'busy' ? 'Joining…' : live ? 'Notify me next time' : 'Join the waitlist'}
      </button>
      {status === 'error' && <p className="form-error">{message}</p>}
    </form>
  )
}
