import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { CopyButton, Spinner, errorMessage } from '../../components/ui'
import { api } from '../../lib/api'
import { supabase } from '../../lib/supabase'

type Category = 'conversion' | 'trust' | 'product' | 'mobile' | 'seo'

interface Check {
  id: string
  category: Category
  label: string
  pass: boolean
  weight: number
  detail: string
  fix: string
}

interface AnalysisResult {
  url: string
  analyzedAt: string
  full: boolean
  score: number
  categories: { category: Category; score: number }[]
  checks: Check[]
  hiddenIssues: number
  speed: { performance: number | null; lcpSeconds: number | null; cls: number | null; tbtMs: number | null } | null
  advice: {
    summary: string
    priorities: { title: string; category: Category; impact: 'high' | 'medium' | 'low'; why: string; how: string }[]
    quick_wins: string[]
    copy_suggestions: { element: string; current: string; suggested: string }[]
  } | null
  aiNote: string | null
  speedNote?: string | null
  responseMs: number
}

const CATEGORY_NAMES: Record<Category, string> = {
  conversion: 'Conversion',
  trust: 'Trust',
  product: 'Product pages',
  mobile: 'Mobile & speed',
  seo: 'Search (SEO)',
}

function tone(score: number) {
  return score >= 80 ? 'good' : score >= 55 ? 'ok' : 'bad'
}

export function StoreAnalyzer() {
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [history, setHistory] = useState<{ id: string; url: string; score: number; created_at: string; result: AnalysisResult }[]>([])
  const resultRef = useRef<HTMLDivElement>(null)

  const loadHistory = async () => {
    if (!supabase) return
    const { data } = await supabase
      .from('store_analyses')
      .select('id, url, score, created_at, result')
      .order('created_at', { ascending: false })
      .limit(15)
    setHistory(data ?? [])
  }
  useEffect(() => {
    loadHistory()
  }, [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const { result } = await api.post<{ result: AnalysisResult }>('analyze', { url })
      setResult(result)
      loadHistory()
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <form className="card form" onSubmit={submit}>
        <div className="workspace__form">
          <label className="field">
            <span>Store or product page URL</span>
            <input required inputMode="url" placeholder="yourstore.com or a product page link" value={url} onChange={(e) => setUrl(e.target.value)} />
          </label>
          <button className="btn btn--primary" disabled={busy}>{busy ? 'Analyzing…' : 'Analyze'}</button>
        </div>
        {busy && <Spinner label="Visiting your store as a phone shopper, testing speed and writing recommendations. Up to a minute." />}
        {error && <p className="form-error">{error}</p>}
        <p className="muted small">Tip: analyze a product page as well as your homepage. That’s where most sales are won or lost.</p>
      </form>

      <div ref={resultRef}>{result && <AnalysisReport result={result} />}</div>

      {history.length > 0 && (
        <section className="section-block">
          <h2 className="section-title">Past scans</h2>
          <div className="list">
            {history.map((h) => (
              <button key={h.id} className="list__item" onClick={() => {
                setResult(h.result)
                setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
              }}>
                <span className={`score-pill score-pill--${tone(h.score)}`}>{h.score}</span>
                <strong className="truncate">{h.url}</strong>
                <span className="muted small">{new Date(h.created_at).toLocaleDateString()}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </>
  )
}

function AnalysisReport({ result }: { result: AnalysisResult }) {
  const failed = result.checks.filter((c) => !c.pass).sort((a, b) => b.weight - a.weight)
  const passed = result.checks.filter((c) => c.pass)

  return (
    <div className="results">
      <section className="card report-head">
        <div className={`score-ring score-ring--${tone(result.score)}`} style={{ ['--pct' as string]: result.score }}>
          <span>{result.score}</span>
          <small>/ 100</small>
        </div>
        <div className="report-head__body">
          <h2 className="truncate">{result.url.replace(/^https?:\/\//, '')}</h2>
          <p className="muted small">Scanned {new Date(result.analyzedAt).toLocaleString()} · page served in {(result.responseMs / 1000).toFixed(1)}s</p>
          <div className="bars">
            {result.categories.map((c) => (
              <div key={c.category} className="bar">
                <span className="bar__label">{CATEGORY_NAMES[c.category]}</span>
                <span className="bar__track"><span className={`bar__fill bar__fill--${tone(c.score)}`} style={{ width: `${c.score}%` }} /></span>
                <span className="bar__value">{c.score}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {!result.full && (
        <div className="panel">
          <div>
            <h3>{result.hiddenIssues > 0 ? `${result.hiddenIssues} more issues found` : 'Get the full report'}</h3>
            <p className="muted">Growth unlocks every check, mobile speed testing, and AI recommendations written for your store.</p>
          </div>
          <Link to="/app/billing" className="btn btn--primary">Upgrade</Link>
        </div>
      )}

      {result.advice && (
        <>
          <section className="card">
            <h3>Verdict</h3>
            <p>{result.advice.summary}</p>
          </section>
          <section className="card">
            <h3>Fix these first</h3>
            <div className="stack">
              {result.advice.priorities.map((p, i) => (
                <div key={i} className="sub-card">
                  <div className="card__head">
                    <h4>{i + 1}. {p.title}</h4>
                    <span className={`tag tag--${p.impact}`}>{p.impact} impact</span>
                  </div>
                  <p className="muted small">{CATEGORY_NAMES[p.category]}</p>
                  <p><strong>Why:</strong> {p.why}</p>
                  <p className="pre"><strong>How:</strong> {p.how}</p>
                </div>
              ))}
            </div>
          </section>
          <div className="grid-2">
            <section className="card">
              <h3>Quick wins (under 30 min)</h3>
              <ul className="checklist">{result.advice.quick_wins.map((w, i) => <li key={i}>{w}</li>)}</ul>
            </section>
            <section className="card">
              <h3>Copy rewrites</h3>
              <div className="stack">
                {result.advice.copy_suggestions.map((c, i) => (
                  <div key={i} className="sub-card">
                    <div className="card__head"><span className="tag">{c.element}</span><CopyButton text={c.suggested} /></div>
                    <p className="muted small strike">{c.current}</p>
                    <p>{c.suggested}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </>
      )}
      {result.aiNote && <p className="form-notice">{result.aiNote}</p>}
      {result.speedNote && <p className="form-notice">{result.speedNote}</p>}

      {result.speed && (
        <section className="card">
          <h3>Mobile speed (Google PageSpeed)</h3>
          <div className="stats">
            <SpeedStat label="Performance" value={result.speed.performance} suffix="/100" good={(v) => v >= 70} />
            <SpeedStat label="Largest paint" value={result.speed.lcpSeconds} suffix="s" good={(v) => v <= 2.5} />
            <SpeedStat label="Layout shift" value={result.speed.cls} good={(v) => v <= 0.1} />
            <SpeedStat label="Blocking time" value={result.speed.tbtMs} suffix="ms" good={(v) => v <= 300} />
          </div>
        </section>
      )}

      <section className="card">
        <h3>{result.full ? `Issues (${failed.length})` : 'Top issues'}</h3>
        <div className="stack">
          {failed.map((c) => (
            <div key={c.id} className="check check--fail">
              <span className="check__icon" aria-hidden="true">!</span>
              <div>
                <strong>{c.label}</strong> <span className="muted small">· {CATEGORY_NAMES[c.category]}</span>
                <p className="muted small">{c.detail}</p>
                <p className="small">{c.fix}</p>
              </div>
            </div>
          ))}
          {failed.length === 0 && <p className="muted">No issues found by the automated checks.</p>}
        </div>
      </section>

      {passed.length > 0 && (
        <section className="card">
          <h3>Doing well ({passed.length})</h3>
          <div className="pass-grid">
            {passed.map((c) => (
              <div key={c.id} className="check check--pass" title={c.detail}>
                <span className="check__icon" aria-hidden="true">✓</span>
                <span>{c.label}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function SpeedStat({ label, value, suffix = '', good }: { label: string; value: number | null; suffix?: string; good: (v: number) => boolean }) {
  return (
    <div className="stat">
      <div className={`stat__value ${value == null ? '' : good(value) ? 'text-good' : 'text-bad'}`}>
        {value == null ? '–' : `${value}${suffix}`}
      </div>
      <div className="stat__label">{label}</div>
    </div>
  )
}
