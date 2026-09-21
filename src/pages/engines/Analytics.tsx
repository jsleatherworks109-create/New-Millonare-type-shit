import { useEffect, useMemo, useState } from 'react'
import { EmptyState, NeedsDatabase, Spinner, Stat } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import type { Drop } from '../../lib/drops'
import { supabase } from '../../lib/supabase'

interface EventRow {
  drop_id: string
  type: 'view' | 'click' | 'signup'
  visitor_id: string | null
  created_at: string
}

const RANGES = [7, 30, 90] as const

function dayKey(d: Date) {
  return d.toISOString().slice(0, 10)
}

export function Analytics() {
  const { user } = useAuth()
  const [drops, setDrops] = useState<Drop[] | null>(null)
  const [dropId, setDropId] = useState<string>('all')
  const [days, setDays] = useState<(typeof RANGES)[number]>(30)
  const [events, setEvents] = useState<EventRow[] | null>(null)
  const [waitlistTotal, setWaitlistTotal] = useState(0)

  useEffect(() => {
    if (!supabase || !user) return
    supabase
      .from('drops')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => setDrops((data ?? []) as Drop[]))
  }, [user])

  useEffect(() => {
    if (!supabase || !drops || drops.length === 0) return
    const ids = dropId === 'all' ? drops.map((d) => d.id) : [dropId]
    const since = new Date(Date.now() - days * 86_400_000).toISOString()
    setEvents(null)
    Promise.all([
      supabase.from('drop_events').select('drop_id, type, visitor_id, created_at').in('drop_id', ids).gte('created_at', since).limit(50_000),
      supabase.from('waitlist').select('id', { count: 'exact', head: true }).in('drop_id', ids),
    ]).then(([ev, wl]) => {
      setEvents((ev.data ?? []) as EventRow[])
      setWaitlistTotal(wl.count ?? 0)
    })
  }, [drops, dropId, days])

  const stats = useMemo(() => {
    if (!events) return null
    const views = events.filter((e) => e.type === 'view')
    const visitors = new Set(views.map((e) => e.visitor_id)).size
    const signups = events.filter((e) => e.type === 'signup').length
    const clicks = events.filter((e) => e.type === 'click').length
    const byDay = new Map<string, { views: number; signups: number; clicks: number }>()
    for (let i = days - 1; i >= 0; i--) byDay.set(dayKey(new Date(Date.now() - i * 86_400_000)), { views: 0, signups: 0, clicks: 0 })
    for (const e of events) {
      const bucket = byDay.get(e.created_at.slice(0, 10))
      if (!bucket) continue
      if (e.type === 'view') bucket.views++
      else if (e.type === 'signup') bucket.signups++
      else bucket.clicks++
    }
    return {
      views: views.length,
      visitors,
      signups,
      clicks,
      signupRate: visitors ? (signups / visitors) * 100 : 0,
      clickRate: visitors ? (clicks / visitors) * 100 : 0,
      series: [...byDay.entries()].map(([day, v]) => ({ day, ...v })),
    }
  }, [events, days])

  if (!supabase) return <NeedsDatabase feature="Launch Analytics" />
  if (!drops) return <Spinner label="Loading…" />
  if (drops.length === 0) return <EmptyState title="No drops to analyze yet">Create a drop and share its page. Visits and sign-ups show up here.</EmptyState>

  return (
    <>
      <div className="filters">
        <select value={dropId} onChange={(e) => setDropId(e.target.value)} aria-label="Drop">
          <option value="all">All drops</option>
          {drops.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
        </select>
        <div className="segmented" role="group" aria-label="Date range">
          {RANGES.map((r) => (
            <button key={r} className={days === r ? 'is-active' : ''} onClick={() => setDays(r)}>{r}d</button>
          ))}
        </div>
      </div>

      {!stats ? (
        <Spinner label="Crunching numbers…" />
      ) : (
        <>
          <div className="stats">
            <Stat label="Page views" value={stats.views.toLocaleString()} />
            <Stat label="Unique visitors" value={stats.visitors.toLocaleString()} />
            <Stat label="Waitlist sign-ups" value={stats.signups.toLocaleString()} hint={`${waitlistTotal.toLocaleString()} on waitlist all-time`} />
            <Stat label="Sign-up rate" value={`${stats.signupRate.toFixed(1)}%`} hint="of unique visitors" />
            <Stat label="Clicks to store" value={stats.clicks.toLocaleString()} hint={`${stats.clickRate.toFixed(1)}% of visitors`} />
          </div>
          <div className="grid-2">
            <BarChart title="Page views per day" data={stats.series.map((s) => ({ day: s.day, value: s.views }))} unit="views" />
            <BarChart title="Sign-ups per day" data={stats.series.map((s) => ({ day: s.day, value: s.signups }))} unit="sign-ups" />
          </div>
          <details className="card">
            <summary>View as table</summary>
            <table className="table">
              <thead><tr><th>Day</th><th>Views</th><th>Sign-ups</th><th>Store clicks</th></tr></thead>
              <tbody>
                {[...stats.series].reverse().map((s) => (
                  <tr key={s.day}><td>{s.day}</td><td>{s.views}</td><td>{s.signups}</td><td>{s.clicks}</td></tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </>
  )
}

/** Single-series daily bar chart with a per-bar hover tooltip. */
function BarChart({ title, data, unit }: { title: string; data: { day: string; value: number }[]; unit: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 600
  const H = 200
  const PAD = { top: 12, right: 8, bottom: 22, left: 32 }
  const max = Math.max(1, ...data.map((d) => d.value))
  const niceMax = max <= 5 ? 5 : Math.ceil(max / 5) * 5
  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom
  const slot = plotW / data.length
  const barW = Math.max(2, slot - 2) // 2px surface gap between bars
  const y = (v: number) => PAD.top + plotH - (v / niceMax) * plotH
  const ticks = [0, niceMax / 2, niceMax]
  const labelEvery = Math.ceil(data.length / 6)
  const fmt = (day: string) => new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const total = data.reduce((s, d) => s + d.value, 0)

  return (
    <figure className="card chart">
      <figcaption className="card__head">
        <h3>{title}</h3>
        <span className="muted small">{total.toLocaleString()} total</span>
      </figcaption>
      <div className="chart__wrap" onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}: ${total} ${unit} over ${data.length} days`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="chart__grid" />
              <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end" className="chart__axis">{t}</text>
            </g>
          ))}
          {data.map((d, i) => {
            const x = PAD.left + i * slot + (slot - barW) / 2
            const h = Math.max(0, y(0) - y(d.value))
            const r = Math.min(4, barW / 2, h)
            return (
              <g key={d.day} onMouseEnter={() => setHover(i)}>
                {/* Hit target is the full column, larger than the bar itself */}
                <rect x={PAD.left + i * slot} y={PAD.top} width={slot} height={plotH} fill="transparent" />
                {h > 0 && (
                  <path
                    className={`chart__bar${hover === i ? ' is-hover' : ''}`}
                    d={`M${x},${y(0)} V${y(0) - h + r} Q${x},${y(0) - h} ${x + r},${y(0) - h} H${x + barW - r} Q${x + barW},${y(0) - h} ${x + barW},${y(0) - h + r} V${y(0)} Z`}
                  />
                )}
                {i % labelEvery === 0 && (
                  <text x={x + barW / 2} y={H - 6} textAnchor="middle" className="chart__axis">{fmt(d.day)}</text>
                )}
              </g>
            )
          })}
          <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} className="chart__baseline" />
        </svg>
        {hover !== null && (
          <div className="chart__tip" style={{ left: `${((PAD.left + (hover + 0.5) * slot) / W) * 100}%` }}>
            <strong>{data[hover].value.toLocaleString()}</strong> {unit}
            <span>{fmt(data[hover].day)}</span>
          </div>
        )}
      </div>
    </figure>
  )
}
