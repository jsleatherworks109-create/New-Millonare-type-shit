import { useAuth } from '../lib/auth'

export function DemoBanner() {
  const { mode } = useAuth()
  if (mode !== 'demo') return null
  return (
    <div className="demo-banner" role="status">
      <strong>Demo mode.</strong> Sign-in and payments are simulated in this browser. Add your Supabase keys to
      <code>.env</code> to go live.
    </div>
  )
}
