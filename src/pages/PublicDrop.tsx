import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { LogoMark } from '../components/Logo'
import { safeHttpUrl, visitorId, type Drop } from '../lib/drops'
import { supabase } from '../lib/supabase'

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

function track(dropId: string, type: 'view' | 'click' | 'signup') {
  supabase?.from('drop_events').insert({ drop_id: dropId, type, visitor_id: visitorId() }).then(() => {})
}

export function PublicDrop() {
  const { slug } = useParams()
  const [drop, setDrop] = useState<Drop | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading')

  useEffect(() => {
    if (!supabase || !slug) {
      setState('missing')
      return
    }
    supabase
      .from('drops')
      .select('*')
      .eq('slug', slug)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return setState('missing')
        setDrop(data as Drop)
        setState('ready')
        document.title = `${data.title} · Drop`
        if (data.status !== 'draft') track(data.id, 'view')
      })
  }, [slug])

  if (state === 'loading') return <div className="page-loading">Loading…</div>
  if (state === 'missing' || !drop) {
    return (
      <div className="drop-page drop-page--center">
        <h1>Drop not found</h1>
        <p className="muted">This launch page doesn’t exist or isn’t public yet.</p>
        <Link to="/" className="btn btn--ghost">Go home</Link>
      </div>
    )
  }
  return <DropView drop={drop} />
}

function DropView({ drop }: { drop: Drop }) {
  const t = useCountdown(new Date(drop.launch_at).getTime())
  const storeUrl = safeHttpUrl(drop.store_url)
  const isLive = drop.status === 'live' && t.done
  const ended = drop.status === 'ended'

  return (
    <div className="drop-page">
      {drop.status === 'draft' && <div className="demo-banner">Draft preview. Only you can see this page.</div>}
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
              {[['days', t.days], ['hours', t.hours], ['mins', t.minutes], ['secs', t.seconds]].map(([label, value]) => (
                <div key={label as string} className="countdown__cell">
                  <span className="countdown__num">{String(value).padStart(2, '0')}</span>
                  <span className="countdown__label">{label}</span>
                </div>
              ))}
            </div>
          )}
          {!ended && !t.done && <p className="muted small">Launches {new Date(drop.launch_at).toLocaleString()}</p>}

          {isLive && storeUrl && (
            <a className="btn btn--primary btn--lg btn--block" href={storeUrl} target="_blank" rel="noopener noreferrer"
              onClick={() => track(drop.id, 'click')}>Shop the drop →</a>
          )}

          {!ended && <WaitlistForm drop={drop} live={isLive} />}
          {ended && <p className="muted">This drop is over. Thanks to everyone who took part.</p>}
        </div>
      </div>
      <footer className="drop-footer">
        <LogoMark size={18} /> <span>Launch page by <Link to="/">Selamont</Link></span>
      </footer>
    </div>
  )
}

function WaitlistForm({ drop, live }: { drop: Drop; live: boolean }) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'busy' | 'done' | 'dupe' | 'error'>('idle')

  if (drop.status !== 'live') return null

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setStatus('busy')
    const { error } = await supabase!.from('waitlist').insert({ drop_id: drop.id, email: email.trim().toLowerCase() })
    if (!error) {
      track(drop.id, 'signup')
      setStatus('done')
    } else setStatus(error.code === '23505' ? 'dupe' : 'error')
  }

  if (status === 'done' || status === 'dupe') {
    return <p className="form-notice">{status === 'done' ? 'You’re on the list! We’ll email you when it drops.' : 'You’re already on the list.'}</p>
  }

  return (
    <form className="waitlist" onSubmit={submit}>
      <label className="sr-only" htmlFor="wl-email">Email</label>
      <input id="wl-email" type="email" required placeholder="you@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
      <button className={`btn btn--lg ${live ? 'btn--ghost' : 'btn--primary'}`} disabled={status === 'busy'}>
        {status === 'busy' ? 'Joining…' : live ? 'Notify me next time' : 'Join the waitlist'}
      </button>
      {status === 'error' && <p className="form-error">Couldn’t join right now. Please try again.</p>}
    </form>
  )
}
