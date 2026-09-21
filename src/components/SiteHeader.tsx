import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { Logo } from './Logo'

export function SiteHeader() {
  const { user } = useAuth()
  return (
    <header className="site-header">
      <div className="container site-header__inner">
        <Logo />
        <nav className="site-nav">
          <a href="/#products">Products</a>
          <Link to="/pricing">Pricing</Link>
          {user ? (
            <Link to="/app" className="btn btn--primary btn--sm">Open dashboard</Link>
          ) : (
            <>
              <Link to="/login" className="site-nav__signin">Sign in</Link>
              <Link to="/login?mode=signup" className="btn btn--primary btn--sm">Get started</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container site-footer__inner">
        <span>© {new Date().getFullYear()} Selamont</span>
        <span className="muted">Built for independent brands.</span>
      </div>
    </footer>
  )
}
