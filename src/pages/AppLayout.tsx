import { useState, type FormEvent } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { Logo } from '../components/Logo'
import { setPasscode } from '../lib/api'
import { PRODUCTS } from '../lib/products'
import { useAppStatus } from '../lib/status'

export function AppLayout() {
  const { ai, needsPasscode } = useAppStatus()
  if (needsPasscode) return <PasscodeGate />

  const aiLabel = !ai
    ? 'Checking AI…'
    : ai.provider === 'claude'
      ? 'AI: Claude'
      : ai.ready
        ? `Local AI ready${ai.visionModel ? '' : ' (no photo model)'}`
        : 'Local AI offline'

  return (
    <div className="app">
      <div className="app__body">
        <aside className="sidebar">
          <Logo to="/app" />
          <nav className="sidebar__nav">
            <NavLink to="/app" end>Overview</NavLink>
            <div className="sidebar__label">Tools</div>
            {PRODUCTS.map((p) => (
              <NavLink key={p.slug} to={`/app/${p.slug}`}>
                <span className="sidebar__icon" aria-hidden="true">{p.icon}</span>
                {p.name}
              </NavLink>
            ))}
          </nav>
          <div className="sidebar__user" title={ai?.problem ?? undefined}>
            <span className={`dot ${ai?.ready ? 'dot--ok' : ai ? 'dot--bad' : ''}`} aria-hidden="true" />
            <div className="sidebar__who">
              <div className="sidebar__email">{aiLabel}</div>
              <div className="muted small">{ai?.provider === 'ollama' && ai.textModel ? ai.textModel : 'Brand workspace'}</div>
            </div>
          </div>
        </aside>
        <main className="app__main">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function PasscodeGate() {
  const { refresh } = useAppStatus()
  const [value, setValue] = useState('')
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setPasscode(value)
    await refresh()
  }
  return (
    <div className="auth-page">
      <form className="auth-card form" onSubmit={submit}>
        <Logo />
        <h1>Enter passcode</h1>
        <p className="muted small">This Selamont workspace is protected. Ask the owner for the passcode.</p>
        <input className="search" type="password" autoFocus value={value} onChange={(e) => setValue(e.target.value)} />
        <button className="btn btn--primary btn--block">Unlock</button>
      </form>
    </div>
  )
}
