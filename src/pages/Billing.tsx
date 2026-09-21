import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { planName } from '../lib/plans'
import { PricingCards } from './Pricing'

export function Billing() {
  const { mode, plan, openBillingPortal, refreshPlan } = useAuth()
  const [params] = useSearchParams()
  const checkout = params.get('checkout')
  const [waiting, setWaiting] = useState(checkout === 'success' && mode === 'live')
  const [error, setError] = useState<string | null>(null)

  const refreshRef = useRef(refreshPlan)
  useEffect(() => {
    refreshRef.current = refreshPlan
  })

  // Stripe's webhook can land a few seconds after the redirect, so poll briefly for the new plan.
  useEffect(() => {
    if (!waiting) return
    let tries = 0
    const id = setInterval(async () => {
      tries++
      const p = await refreshRef.current()
      if (p !== 'free' || tries >= 10) {
        clearInterval(id)
        setWaiting(false)
      }
    }, 2000)
    return () => clearInterval(id)
  }, [waiting])

  const manage = async () => {
    setError(null)
    try {
      await openBillingPortal()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open billing portal.')
    }
  }

  return (
    <div className="page">
      <header className="page__head">
        <h1>Plan & billing</h1>
        <p className="muted">
          Current plan: <strong>{planName(plan)}</strong>
        </p>
      </header>

      {checkout === 'success' && (
        <div className="form-notice">
          {waiting ? 'Payment received. Activating your plan…' : `Thanks! You’re now on the ${planName(plan)} plan.`}
        </div>
      )}
      {checkout === 'cancelled' && <div className="form-error">Checkout was cancelled. You have not been charged.</div>}

      {plan !== 'free' && (
        <div className="panel">
          <div>
            <h3>Manage subscription</h3>
            <p className="muted">
              {mode === 'demo'
                ? 'In demo mode this simply cancels back to Starter.'
                : 'Update your card, download invoices, or cancel in the secure Stripe portal.'}
            </p>
          </div>
          <button className="btn btn--ghost" onClick={manage}>
            {mode === 'demo' ? 'Cancel subscription (demo)' : 'Open billing portal'}
          </button>
        </div>
      )}
      {error && <p className="form-error">{error}</p>}

      <h2 className="section-title">Plans</h2>
      <PricingCards />
    </div>
  )
}
