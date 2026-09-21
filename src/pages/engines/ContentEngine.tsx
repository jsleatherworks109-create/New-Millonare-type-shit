import { useEffect, useRef, useState, type FormEvent } from 'react'
import { CopyButton, Spinner, errorMessage } from '../../components/ui'
import { api } from '../../lib/api'
import { prepareImage, type PreparedImage } from '../../lib/images'
import { supabase } from '../../lib/supabase'

interface ContentOutput {
  product_summary: string
  hooks: string[]
  captions: { platform: string; caption: string; hashtags: string[] }[]
  product_description: { headline: string; body: string; bullets: string[] }
  ad_concepts: { name: string; angle: string; hook: string; script: string; visual: string; cta: string }[]
  content_ideas: { format: string; title: string; description: string }[]
  launch_plan: { day: string; platform: string; post: string }[]
}

interface HistoryItem {
  id: string
  product_name: string
  created_at: string
  output: ContentOutput
}

const PLATFORMS = ['instagram', 'tiktok', 'facebook', 'pinterest', 'youtube', 'email']
const TONES = ['Confident and friendly', 'Playful and bold', 'Minimal and premium', 'Warm and personal', 'Edgy streetwear', 'Calm and wellness']
const GOALS = ['Product launch', 'Limited drop', 'Evergreen sales', 'Sale or promotion', 'Build brand awareness']

export function ContentEngine() {
  const [images, setImages] = useState<PreparedImage[]>([])
  const [productName, setProductName] = useState('')
  const [details, setDetails] = useState('')
  const [audience, setAudience] = useState('')
  const [tone, setTone] = useState(TONES[0])
  const [goal, setGoal] = useState(GOALS[0])
  const [platforms, setPlatforms] = useState<string[]>(['instagram', 'tiktok'])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ name: string; output: ContentOutput } | null>(null)
  const [history, setHistory] = useState<HistoryItem[]>([])
  const fileInput = useRef<HTMLInputElement>(null)
  const resultRef = useRef<HTMLDivElement>(null)

  const loadHistory = async () => {
    if (!supabase) return
    const { data } = await supabase
      .from('content_generations')
      .select('id, product_name, created_at, output')
      .order('created_at', { ascending: false })
      .limit(20)
    setHistory(((data ?? []) as HistoryItem[]).filter((h) => Array.isArray(h.output?.hooks)))
  }

  useEffect(() => {
    loadHistory()
  }, [])

  const addFiles = async (files: FileList | null) => {
    if (!files) return
    setError(null)
    try {
      const room = 4 - images.length
      const prepared = await Promise.all(Array.from(files).slice(0, room).map((f) => prepareImage(f)))
      setImages((prev) => [...prev, ...prepared].slice(0, 4))
    } catch (e) {
      setError(errorMessage(e, 'Could not read that image.'))
    }
    if (fileInput.current) fileInput.current.value = ''
  }

  const togglePlatform = (p: string) =>
    setPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const { output } = await api.post<{ output: ContentOutput }>('content', {
        productName,
        details,
        audience,
        tone,
        goal,
        platforms,
        images: images.map(({ mediaType, data }) => ({ mediaType, data })),
      })
      setResult({ name: productName, output })
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
        <div className="field">
          <span>Product photos or mockups (up to 4)</span>
          <div className="uploader">
            {images.map((img, i) => (
              <div key={i} className="uploader__thumb">
                <img src={img.previewUrl} alt={`Upload ${i + 1}`} />
                <button type="button" aria-label="Remove image" onClick={() => setImages(images.filter((_, j) => j !== i))}>×</button>
              </div>
            ))}
            {images.length < 4 && (
              <label
                className="uploader__add"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  addFiles(e.dataTransfer.files)
                }}
              >
                <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(e) => addFiles(e.target.files)} />
                <span className="uploader__plus">+</span>
                <span className="small">Add or drop photos</span>
              </label>
            )}
          </div>
        </div>
        <div className="grid-2">
          <label className="field">
            <span>Product name</span>
            <input required maxLength={120} value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="e.g. Midnight Garden Oversized Tee" />
          </label>
          <label className="field">
            <span>Who is it for?</span>
            <input maxLength={300} value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="e.g. Women 20–35 into vintage streetwear" />
          </label>
        </div>
        <label className="field">
          <span>Product details</span>
          <textarea rows={4} maxLength={3000} value={details} onChange={(e) => setDetails(e.target.value)}
            placeholder="Material, fit, price, what makes it different, any offer…" />
        </label>
        <div className="grid-2">
          <label className="field">
            <span>Tone of voice</span>
            <select value={tone} onChange={(e) => setTone(e.target.value)}>
              {TONES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Goal</span>
            <select value={goal} onChange={(e) => setGoal(e.target.value)}>
              {GOALS.map((g) => <option key={g}>{g}</option>)}
            </select>
          </label>
        </div>
        <fieldset className="field">
          <span>Platforms</span>
          <div className="chips">
            {PLATFORMS.map((p) => (
              <label key={p} className={`chip${platforms.includes(p) ? ' is-on' : ''}`}>
                <input type="checkbox" checked={platforms.includes(p)} onChange={() => togglePlatform(p)} />
                {p}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="row">
          <button className="btn btn--primary btn--lg" disabled={busy}>
            {busy ? 'Writing…' : 'Generate content pack'}
          </button>
          {busy && <Spinner label="Studying your product and writing. This usually takes 20–60 seconds." />}
        </div>
        {error && <p className="form-error">{error}</p>}
      </form>

      <div ref={resultRef}>{result && <ContentResult name={result.name} output={result.output} />}</div>

      {history.length > 0 && (
        <section className="section-block">
          <h2 className="section-title">Recent content packs</h2>
          <div className="list">
            {history.map((h) => (
              <button key={h.id} className="list__item" onClick={() => {
                setResult({ name: h.product_name, output: h.output })
                setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
              }}>
                <strong>{h.product_name}</strong>
                <span className="muted small">{new Date(h.created_at).toLocaleString()}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </>
  )
}

function ContentResult({ name, output }: { name: string; output: ContentOutput }) {
  const desc = output.product_description
  const descText = `${desc.headline}\n\n${desc.body}\n\n${desc.bullets.map((b) => `• ${b}`).join('\n')}`
  return (
    <div className="results">
      <div className="results__head">
        <h2>{name}</h2>
        <p className="muted">{output.product_summary}</p>
      </div>

      <section className="card">
        <div className="card__head">
          <h3>Hooks</h3>
          <CopyButton text={output.hooks.join('\n')} label="Copy all" />
        </div>
        <ol className="numbered">
          {output.hooks.map((h, i) => (
            <li key={i}><span>{h}</span><CopyButton text={h} /></li>
          ))}
        </ol>
      </section>

      <section className="card">
        <h3>Captions</h3>
        <div className="stack">
          {output.captions.map((c, i) => {
            const full = `${c.caption}\n\n${c.hashtags.map((t) => (t.startsWith('#') ? t : `#${t}`)).join(' ')}`
            return (
              <div key={i} className="sub-card">
                <div className="card__head">
                  <span className="tag">{c.platform}</span>
                  <CopyButton text={full} />
                </div>
                <p className="pre">{c.caption}</p>
                <p className="muted small">{c.hashtags.map((t) => (t.startsWith('#') ? t : `#${t}`)).join(' ')}</p>
              </div>
            )
          })}
        </div>
      </section>

      <section className="card">
        <div className="card__head">
          <h3>Product description</h3>
          <CopyButton text={descText} />
        </div>
        <h4>{desc.headline}</h4>
        <p className="pre">{desc.body}</p>
        <ul className="checklist">{desc.bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>
      </section>

      <section className="card">
        <h3>Ad concepts</h3>
        <div className="grid-2">
          {output.ad_concepts.map((a, i) => (
            <div key={i} className="sub-card">
              <div className="card__head">
                <h4>{a.name}</h4>
                <CopyButton text={`${a.name}\nAngle: ${a.angle}\nHook: ${a.hook}\nScript: ${a.script}\nVisual: ${a.visual}\nCTA: ${a.cta}`} />
              </div>
              <dl className="dl">
                <dt>Angle</dt><dd>{a.angle}</dd>
                <dt>Hook</dt><dd>{a.hook}</dd>
                <dt>Script</dt><dd className="pre">{a.script}</dd>
                <dt>Visual</dt><dd>{a.visual}</dd>
                <dt>CTA</dt><dd>{a.cta}</dd>
              </dl>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h3>Content ideas</h3>
        <div className="grid-2">
          {output.content_ideas.map((c, i) => (
            <div key={i} className="sub-card">
              <span className="tag">{c.format}</span>
              <h4>{c.title}</h4>
              <p className="muted">{c.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="card__head">
          <h3>7-day launch plan</h3>
          <CopyButton text={output.launch_plan.map((l) => `${l.day} · ${l.platform}: ${l.post}`).join('\n')} label="Copy plan" />
        </div>
        <table className="table">
          <thead><tr><th>When</th><th>Where</th><th>Post</th></tr></thead>
          <tbody>
            {output.launch_plan.map((l, i) => (
              <tr key={i}><td>{l.day}</td><td>{l.platform}</td><td>{l.post}</td></tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
