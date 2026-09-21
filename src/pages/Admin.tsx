import { useCallback, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Spinner, Stat, errorMessage } from '../components/ui'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { PLANS, type Plan } from '../lib/plans'

interface AdminUser {
  id: string
  email: string | null
  plan: Plan
  is_admin: boolean
  subscription_status: string | null
  created_at: string
}

interface Health {
  ai: boolean
  database: boolean
  payments: boolean
}

export function Admin() {
  const { isAdmin, mode } = useAuth()
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [stats, setStats] = useState<Record<string, number> | null>(null)
  const [health, setHealth] = useState<Health | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')

  const load = useCallback(async () => {
    setError(null)
    try {
      const [h, u] = await Promise.all([
        api.get<Health>('health'),
        mode === 'live' ? api.get<{ users: AdminUser[]; stats: Record<string, number> }>('admin/users') : Promise.resolve({ users: [], stats: null }),
      ])
      setHealth(h)
      setUsers(u.users)
      setStats(u.stats)
    } catch (e) {
      setError(errorMessage(e))
      setUsers([])
    }
  }, [mode])

  useEffect(() => {
    if (isAdmin) load()
  }, [isAdmin, load])

  if (!isAdmin) return <Navigate to="/app" replace />

  const setPlan = async (userId: string, plan: Plan) => {
    try {
      await api.post('admin/set-plan', { userId, plan })
      setUsers((prev) => prev?.map((u) => (u.id === userId ? { ...u, plan } : u)) ?? null)
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  const q = filter.toLowerCase()
  const shown = (users ?? []).filter((u) => !q || (u.email ?? '').toLowerCase().includes(q))

  return (
    <div className="page">
      <header className="page__head">
        <h1>Admin</h1>
        <p className="muted">Your account has every feature free. Manage users and check the platform’s setup here.</p>
      </header>

      {health && (
        <section className="card">
          <h3>Setup status</h3>
          <div className="pass-grid">
            {[
              ['Sign-in & database (Supabase)', mode === 'live' && health.database],
              ['AI engines (Anthropic key)', health.ai],
              ['Payments (Stripe)', health.payments],
            ].map(([label, ok]) => (
              <div key={label as string} className={`check ${ok ? 'check--pass' : 'check--fail'}`}>
                <span className="check__icon" aria-hidden="true">{ok ? '✓' : '!'}</span>
                <span>{label} {ok ? '' : '(not configured)'}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {stats && (
        <div className="stats">
          <Stat label="Users" value={users?.length ?? 0} />
          <Stat label="Content packs" value={stats.generations} />
          <Stat label="Store scans" value={stats.analyses} />
          <Stat label="Drops" value={stats.drops} />
          <Stat label="Creator briefs" value={stats.briefs} />
        </div>
      )}

      {error && <p className="form-error">{error}</p>}

      {mode === 'demo' ? (
        <p className="form-notice">User management turns on once Supabase is connected.</p>
      ) : !users ? (
        <Spinner label="Loading users…" />
      ) : (
        <section className="card">
          <div className="card__head">
            <h3>Users ({users.length})</h3>
            <input className="search search--sm" placeholder="Search email" value={filter} onChange={(e) => setFilter(e.target.value)} />
          </div>
          <div className="table-scroll">
            <table className="table">
              <thead><tr><th>Email</th><th>Joined</th><th>Billing</th><th>Plan</th></tr></thead>
              <tbody>
                {shown.map((u) => (
                  <tr key={u.id}>
                    <td className="truncate">{u.email}{u.is_admin && <span className="tag"> admin</span>}</td>
                    <td>{new Date(u.created_at).toLocaleDateString()}</td>
                    <td className="muted">{u.subscription_status ?? '–'}</td>
                    <td>
                      {u.is_admin ? (
                        'All access'
                      ) : (
                        <select value={u.plan} onChange={(e) => setPlan(u.id, e.target.value as Plan)} aria-label={`Plan for ${u.email}`}>
                          {PLANS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted small">Changing a plan here gives free access (comps). Paying customers’ plans are also updated automatically by Stripe.</p>
        </section>
      )}
    </div>
  )
}
