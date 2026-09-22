import { Link } from 'react-router-dom'
import { PRODUCTS } from '../lib/products'
import { useAppStatus } from '../lib/status'

export function Dashboard() {
  const { ai } = useAppStatus()
  return (
    <div className="page">
      <header className="page__head">
        <h1>Your brand workspace</h1>
        <p className="muted">Everything runs on this PC for free. No accounts, no subscriptions.</p>
      </header>
      {ai && !ai.ready && (
        <div className="form-error">
          <strong>AI tools are offline.</strong> {ai.problem} The Store Analyzer scan, drops, creators and analytics still work.
        </div>
      )}
      {ai?.ready && ai.provider === 'ollama' && !ai.visionModel && (
        <div className="form-notice">Photo reading is off (vision model not installed). Content Engine will write from your text description.</div>
      )}
      <div className="product-grid" style={{ marginTop: '1rem' }}>
        {PRODUCTS.map((p) => (
          <Link key={p.slug} to={`/app/${p.slug}`} className="product-card product-card--link">
            <div className="product-card__icon" aria-hidden="true">{p.icon}</div>
            <h3>{p.name}</h3>
            <p className="muted">{p.description}</p>
            <span className="product-card__cta">Open →</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
