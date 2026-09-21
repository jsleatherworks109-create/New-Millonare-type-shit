import { useState, type ReactNode } from 'react'
import { useAuth } from '../lib/auth'
import { hasAccess, PLANS, type Plan } from '../lib/plans'

interface PaywallProps {
  required: Exclude<Plan, 'free'>
  feature: string
  children: ReactNode
}

/**
 * Shows children only when the user's plan is high enough.
 * This is a UX gate. Anything valuable must also be checked on the server,
 * because anyone can edit code running in their own browser.
 */
export function Paywall({ required, feature, children }: PaywallProps) {
  const { plan, startCheckout } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (hasAccess(plan, required)) return <>{children}</>

  const target = PLANS.find((p) => p.id === required)!

  const upgrade = async () => {
    setBusy(true)
    setError(null)
    try {
      await startCheckout(required)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start checkout.')
      setBusy(false)
    }
  }

  return (
    <div className="paywall">
      <div className="paywall__badge">{target.name} plan</div>
      <h2>Unlock {feature}</h2>
      <p className="muted">
        {feature} is included with {target.name} and above for ${target.price}/month. Cancel anytime.
      </p>
      <ul className="checklist">
        {target.features.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
      <button className="btn btn--primary btn--lg" onClick={upgrade} disabled={busy}>
        {busy ? 'Opening checkout…' : `Upgrade to ${target.name}`}
      </button>
      {error && <p className="form-error">{error}</p>}
    </div>
  )
}
