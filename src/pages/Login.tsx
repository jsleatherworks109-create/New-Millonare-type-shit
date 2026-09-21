import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Logo } from '../components/Logo'
import { DemoBanner } from '../components/DemoBanner'
import { useAuth } from '../lib/auth'

type Mode = 'signin' | 'signup' | 'reset'

function safeNext(raw: string | null): string {
  // Only allow same-site paths so ?next= can't bounce users to another website.
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/app'
}

export function Login() {
  const auth = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))

  const [mode, setMode] = useState<Mode>(params.get('mode') === 'signup' ? 'signup' : 'signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (auth.user) navigate(next, { replace: true })
  }, [auth.user, next, navigate])

  const run = async (action: () => Promise<string | null | void>) => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const msg = await action()
      if (msg) setNotice(msg)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (mode === 'signin') run(() => auth.signInWithEmail(email, password))
    else if (mode === 'signup') run(() => auth.signUpWithEmail(email, password))
    else
      run(async () => {
        await auth.resetPassword(email)
        return 'If an account exists for that email, a reset link is on its way.'
      })
  }

  const title = mode === 'signin' ? 'Welcome back' : mode === 'signup' ? 'Create your account' : 'Reset your password'

  return (
    <div className="auth-page">
      <DemoBanner />
      <div className="auth-card">
        <Logo />
        <h1>{title}</h1>
        {mode !== 'reset' && (
          <>
            <button className="btn btn--google btn--lg btn--block" onClick={() => run(auth.signInWithGoogle)} disabled={busy}>
              <GoogleIcon />
              Continue with Google
            </button>
            <div className="divider"><span>or</span></div>
          </>
        )}
        <form onSubmit={onSubmit} className="form">
          <label className="field">
            <span>Email</span>
            <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          {mode !== 'reset' && (
            <label className="field">
              <span>Password</span>
              <input
                type="password"
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                minLength={8}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          )}
          <button className="btn btn--primary btn--lg btn--block" type="submit" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
          </button>
        </form>
        {error && <p className="form-error">{error}</p>}
        {notice && <p className="form-notice">{notice}</p>}
        <div className="auth-switch">
          {mode === 'signin' && (
            <>
              <button className="link" onClick={() => setMode('reset')}>Forgot password?</button>
              <span>
                New here? <button className="link" onClick={() => setMode('signup')}>Create an account</button>
              </span>
            </>
          )}
          {mode === 'signup' && (
            <span>
              Already have an account? <button className="link" onClick={() => setMode('signin')}>Sign in</button>
            </span>
          )}
          {mode === 'reset' && <button className="link" onClick={() => setMode('signin')}>Back to sign in</button>}
        </div>
        <p className="muted small center">
          <Link to="/">← Back to home</Link>
        </p>
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}
