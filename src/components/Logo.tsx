import { Link } from 'react-router-dom'

export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="var(--ink)" />
      <path d="M5 25 L13.5 10 L18 17.5 L21 13 L27 25 Z" fill="var(--ink-contrast)" />
      <circle cx="23.5" cy="8.5" r="2.6" fill="var(--accent)" />
    </svg>
  )
}

export function Logo({ to = '/' }: { to?: string }) {
  return (
    <Link to={to} className="logo" aria-label="Selamont home">
      <LogoMark />
      <span>Selamont</span>
    </Link>
  )
}
