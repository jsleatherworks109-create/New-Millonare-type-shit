import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { DemoBanner } from '../components/DemoBanner'
import { Logo } from '../components/Logo'
import { useAuth } from '../lib/auth'
import { hasAccess, planName } from '../lib/plans'
import { PRODUCTS } from '../lib/products'

export function AppLayout() {
  const { user, plan, isAdmin, signOut } = useAuth()
  const navigate = useNavigate()

  const logout = async () => {
    await signOut()
    navigate('/')
  }

  const initial = (user?.name || user?.email || '?').charAt(0).toUpperCase()

  return (
    <div className="app">
      <DemoBanner />
      <div className="app__body">
        <aside className="sidebar">
          <Logo to="/app" />
          <nav className="sidebar__nav">
            <NavLink to="/app" end>Overview</NavLink>
            <div className="sidebar__label">Products</div>
            {PRODUCTS.map((p) => (
              <NavLink key={p.slug} to={`/app/${p.slug}`}>
                <span className="sidebar__icon" aria-hidden="true">{p.icon}</span>
                {p.name}
                {!hasAccess(plan, p.required) && <span className="lock-tag">{planName(p.required)}</span>}
              </NavLink>
            ))}
            <div className="sidebar__label">Account</div>
            <NavLink to="/app/billing">Plan & billing</NavLink>
            {isAdmin && <NavLink to="/app/admin">Admin</NavLink>}
          </nav>
          <div className="sidebar__user">
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="avatar" referrerPolicy="no-referrer" />
            ) : (
              <div className="avatar" aria-hidden="true">{initial}</div>
            )}
            <div className="sidebar__who">
              <div className="sidebar__email" title={user?.email}>{user?.name || user?.email}</div>
              <div className="muted small">{isAdmin ? 'Admin · all access' : `${planName(plan)} plan`}</div>
            </div>
            <button className="btn btn--ghost btn--sm" onClick={logout}>Sign out</button>
          </div>
        </aside>
        <main className="app__main">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
