import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { hasAccess, planName } from '../lib/plans'
import { PRODUCTS } from '../lib/products'

export function Dashboard() {
  const { user, plan } = useAuth()
  const firstName = user?.name?.split(' ')[0]

  return (
    <div className="page">
      <header className="page__head">
        <h1>{firstName ? `Welcome, ${firstName}` : 'Welcome to Selamont'}</h1>
        <p className="muted">
          You’re on the <strong>{planName(plan)}</strong> plan.
          {plan === 'free' && (
            <> <Link to="/app/billing">Upgrade</Link> to unlock the Content Engine, full store reports and unlimited drops.</>
          )}
        </p>
      </header>
      <div className="product-grid">
        {PRODUCTS.map((p) => {
          const open = hasAccess(plan, p.required)
          return (
            <Link key={p.slug} to={`/app/${p.slug}`} className={`product-card product-card--link${open ? '' : ' is-locked'}`}>
              <div className="product-card__top">
                <div className="product-card__icon" aria-hidden="true">{p.icon}</div>
                {!open && <span className="lock-tag">🔒 {planName(p.required)}</span>}
              </div>
              <h3>{p.name}</h3>
              <p className="muted">{p.description}</p>
              <span className="product-card__cta">{open ? 'Open →' : 'See plans →'}</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
