import { useState, type ReactNode } from 'react'

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard blocked (e.g. insecure context); nothing sensible to do.
    }
  }
  return (
    <button type="button" className="btn btn--ghost btn--xs" onClick={copy}>
      {copied ? 'Copied ✓' : label}
    </button>
  )
}

export function Spinner({ label }: { label: string }) {
  return (
    <div className="spinner-row" role="status">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}

export function NeedsDatabase({ feature }: { feature: string }) {
  return (
    <div className="panel panel--stack">
      <h3>{feature} needs a database</h3>
      <p className="muted">
        You’re in demo mode, which only simulates sign-in. Connect a free Supabase project (steps in <code>README.md</code>)
        and {feature} will save launches, sign-ups and deals for real.
      </p>
    </div>
  )
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children && <div className="muted">{children}</div>}
    </div>
  )
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="stat">
      <div className="stat__value">{value}</div>
      <div className="stat__label">{label}</div>
      {hint && <div className="stat__hint">{hint}</div>}
    </div>
  )
}

export function errorMessage(e: unknown, fallback = 'Something went wrong.'): string {
  if (e instanceof Error) return e.message
  if (e && typeof e === 'object' && 'message' in e && typeof e.message === 'string') return e.message
  return fallback
}
