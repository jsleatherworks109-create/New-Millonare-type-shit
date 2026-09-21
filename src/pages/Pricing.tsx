import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SiteFooter, SiteHeader } from '../components/SiteHeader'
import { useAuth } from '../lib/auth'
import { hasAccess, PLANS, type Plan } from '../lib/plans'

export function PricingCards() {
  const { user, plan, startCheckout } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState<Plan | null>(null)
  const [error, setError] = useState<string | null>(null)

  const choose = async (target: Plan) => {
    setError(null)
    if (!user) {
      navigate(`/login?mode=signup&next=${encodeURIComponent(target === 'free' ? '/app' : `/pricing?plan=${target}`)}`)
      return
    }
    if (target === 'free') {
      navigate('/app')
      return
    }
    setBusy(target)
    try {
      await startCheckout(target)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start checkout.')
      setBusy(null)
    }
  }

  return (
    <>
      <div className="pricing-grid">
        {PLANS.map((p) => {
          const current = !!user && plan === p.id
          const included = !!user && !current && hasAccess(plan, p.id)
          return (
            <div key={p.id} className={`price-card${p.highlight ? ' price-card--highlight' : ''}`}>
              {p.highlight && <div className="price-card__flag">Most popular</div>}
              <h3>{p.name}</h3>
              <p className="muted price-card__blurb">{p.blurb}</p>
              <div className="price-card__price">
                <span className="price-card__amount">${p.price}</span>
                <span className="muted">/month</span>
              </div>
              <ul className="checklist">
                {p.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              <button
                className={`btn btn--lg ${p.highlight ? 'btn--primary' : 'btn--ghost'}`}
                disabled={current || included || busy !== null}
                onClick={() => choose(p.id)}
              >
                {current
                  ? 'Current plan'
                  : included
                    ? 'Included in your plan'
                    : busy === p.id
                      ? 'Opening checkout…'
                      : p.price === 0
                        ? 'Start free'
                        : `Choose ${p.name}`}
              </button>
            </div>
          )
        })}
      </div>
      {error && <p className="form-error center">{error}</p>}
      <p className="muted center small">
        Creator marketplace deals carry a disclosed platform fee, shown before you agree to any deal.
      </p>
    </>
  )
}

export function Pricing() {
  return (
    <>
      <SiteHeader />
      <main className="section">
        <div className="container">
          <div className="section__head">
            <span className="eyebrow">Pricing</span>
            <h1>Simple plans for growing brands</h1>
          </div>
          <PricingCards />
        </div>
      </main>
      <SiteFooter />
    </>
  )
}
