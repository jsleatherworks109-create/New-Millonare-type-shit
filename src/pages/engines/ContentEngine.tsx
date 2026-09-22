import { useEffect, useRef, useState, type FormEvent } from 'react'
import { CopyButton, Spinner, errorMessage } from '../../components/ui'
import { api } from '../../lib/api'
import { prepareImage, type PreparedImage } from '../../lib/images'
import { aiWaitHint, useAppStatus } from '../../lib/status'

interface ContentOutput {
  photo_notes?: string
  hooks?: string[]
  captions?: { platform: string; caption: string; hashtags: string[] }[]
  product_description?: { headline: string; body: string; bullets: string[] }
  ad_concepts?: { name: string; angle: string; hook: string; script: string; visual: string; cta: string }[]
  content_ideas?: { format: string; title: string; description: string }[]
  launch_plan?: { day: string; platform: string; post: string }[]
}

interface HistoryItem {
  id: string
  product_name: string
  created_at: string
  output: ContentOutput
}

const SECTIONS = [
  { key: 'hooks', label: 'Hooks' },
  { key: 'captions', label: 'Captions' },
  { key: 'description', label: 'Product description' },
  { key: 'ads', label: 'Ad concepts' },
  { key: 'ideas', label: 'Content ideas' },
  { key: 'plan', label: '7-day launch plan' },
]
const PLATFORMS = ['instagram', 'tiktok', 'facebook', 'pinterest', 'youtube', 'email']
const TONES = ['Confident and friendly', 'Playful and bold', 'Minimal and premium', 'Warm and personal', 'Edgy streetwear', 'Calm and wellness']
const GOALS = ['Product launch', 'Limited drop', 'Evergreen sales', 'Sale or promotion', 'Build brand awareness']

export function ContentEngine() {
  const { ai } = useAppStatus()
  const local = ai?.provider !== 'claude'
  const [images, setImages] = useState<PreparedImage[]>([])
  const [productName, setProductName] = useState('')
  const [details, setDetails] = useState('')
  const [audience, setAudience] = useState('')
  const [tone, setTone] = useState(TONES[0])
  const [goal, setGoal] = useState(GOALS[0])
  const [platforms, setPlatforms] = useState<string[]>(['instagram', 'tiktok'])
  const [sections, setSections] = useState<string[]>(['hooks', 'captions', 'description'])
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ message: string; tokens: number } | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [result, setResult] = useState<{ name: string; output: ContentOutput } | null>(null)
  const [history, setHistory] = useState<HistoryItem[]>([])
  const fileInput = useRef<HTMLInputElement>(null)
  const resultRef = useRef<HTMLDivElement>(null)

  const loadHistory = () => api.get<{ items: HistoryItem[] }>('content/history').then((d) => setHistory(d.items)).catch(() => {})
  useEffect(() => {
    loadHistory()
  }, [])

  const addFiles = async (files: FileList | null) => {
    if (!files) return
    try {
      // Local vision AI is slow per pixel, so photos are sent small; Claude gets more detail.
      const prepared = await Promise.all(Array.from(files).slice(0, 4 - images.length).map((f) => prepareImage(f, local ? 384 : 1280)))
      setImages((prev) => [...prev, ...prepared].slice(0, 4))
    } catch (e) {
      setErrors([errorMessage(e, 'Could not read that image.')])
    }
    if (fileInput.current) fileInput.current.value = ''
  }

  const toggle = (list: string[], set: (v: string[]) => void, value: string) =>
    set(list.includes(value) ? list.filter((x) => x !== value) : [...list, value])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErrors([])
    setResult({ name: productName, output: {} })
    setStatus({ message: 'Starting…', tokens: 0 })
    setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    try {
      await api.stream(
        'content',
        { productName, details, audience, tone, goal, platforms, sections, images: images.map(({ mediaType, data }) => ({ mediaType, data })) },
        (ev) => {
          if (ev.type === 'status') setStatus({ message: String(ev.message), tokens: 0 })
          else if (ev.type === 'progress') setStatus((s) => (s ? { ...s, tokens: Number(ev.tokens) } : s))
          else if (ev.type === 'section') setResult((r) => (r ? { ...r, output: { ...r.output, ...(ev.data as ContentOutput) } } : r))
          else if (ev.type === 'error') setErrors((prev) => [...prev, String(ev.message)])
        },
      )
      loadHistory()
    } catch (err) {
      setErrors((prev) => [...prev, errorMessage(err)])
    } finally {
      setBusy(false)
      setStatus(null)
    }
  }

  return (
    <>
      <form className="card form" onSubmit={submit}>
        <div className="field">
          <span>Product photos or mockups (up to 4){local && ai?.ready && !ai.visionModel ? ': photo model not installed, describe it below instead' : ''}</span>
          <div className="uploader">
            {images.map((img, i) => (
              <div key={i} className="uploader__thumb">
                <img src={img.previewUrl} alt={`Upload ${i + 1}`} />
                <button type="button" aria-label="Remove image" onClick={() => setImages(images.filter((_, j) => j !== i))}>×</button>
              </div>
            ))}
            {images.length < 4 && (
              <label className="uploader__add" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files) }}>
                <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(e) => addFiles(e.target.files)} />
                <span className="uploader__plus">+</span>
                <span className="small">Add or drop photos</span>
              </label>
            )}
          </div>
          {local && images.length > 1 && <span className="muted small">Tip: one photo is much faster on local AI.</span>}
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
          <textarea rows={3} maxLength={3000} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Material, fit, price, what makes it different, any offer…" />
        </label>
        <div className="grid-2">
          <label className="field">
            <span>Tone of voice</span>
            <select value={tone} onChange={(e) => setTone(e.target.value)}>{TONES.map((t) => <option key={t}>{t}</option>)}</select>
          </label>
          <label className="field">
            <span>Goal</span>
            <select value={goal} onChange={(e) => setGoal(e.target.value)}>{GOALS.map((g) => <option key={g}>{g}</option>)}</select>
          </label>
        </div>
        <fieldset className="field">
          <span>What to write</span>
          <div className="chips">
            {SECTIONS.map((s) => (
              <label key={s.key} className={`chip${sections.includes(s.key) ? ' is-on' : ''}`}>
                <input type="checkbox" checked={sections.includes(s.key)} onChange={() => toggle(sections, setSections, s.key)} />
                {s.label}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="field">
          <span>Platforms</span>
          <div className="chips">
            {PLATFORMS.map((p) => (
              <label key={p} className={`chip${platforms.includes(p) ? ' is-on' : ''}`}>
                <input type="checkbox" checked={platforms.includes(p)} onChange={() => toggle(platforms, setPlatforms, p)} />
                {p}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="row">
          <button className="btn btn--primary btn--lg" disabled={busy || sections.length === 0 || ai?.ready === false}>
            {busy ? 'Writing…' : 'Generate content'}
          </button>
          <span className="muted small">{aiWaitHint(ai, `1–2 minutes per section${images.length ? ' plus 1–3 minutes per photo' : ''}`)}</span>
        </div>
        {ai && !ai.ready && <p className="form-error">{ai.problem}</p>}
      </form>

      <div ref={resultRef}>
        {status && <div className="card"><Spinner label={`${status.message}${status.tokens ? ` (${status.tokens} words so far)` : ''}`} /></div>}
        {errors.map((e, i) => <p key={i} className="form-error">{e}</p>)}
        {result && <ContentResult name={result.name} output={result.output} />}
      </div>

      {history.length > 0 && (
        <section className="section-block">
          <h2 className="section-title">Saved content</h2>
          <div className="list">
            {history.map((h) => (
              <button key={h.id} className="list__item" onClick={() => {
                setResult({ name: h.product_name, output: h.output })
                setErrors([])
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

const tag = (t: string) => (t.startsWith('#') ? t : `#${t.replace(/\s+/g, '')}`)

function ContentResult({ name, output }: { name: string; output: ContentOutput }) {
  const desc = output.product_description
  return (
    <div className="results">
      <div className="results__head"><h2>{name}</h2></div>

      {output.photo_notes && (
        <section className="card">
          <h3>What the AI saw in your photos</h3>
          <p className="muted">{output.photo_notes}</p>
        </section>
      )}

      {output.hooks && (
        <section className="card">
          <div className="card__head"><h3>Hooks</h3><CopyButton text={output.hooks.join('\n')} label="Copy all" /></div>
          <ol className="numbered">{output.hooks.map((h, i) => <li key={i}><span>{h}</span><CopyButton text={h} /></li>)}</ol>
        </section>
      )}

      {output.captions && (
        <section className="card">
          <h3>Captions</h3>
          <div className="stack">
            {output.captions.map((c, i) => (
              <div key={i} className="sub-card">
                <div className="card__head"><span className="tag">{c.platform}</span><CopyButton text={`${c.caption}\n\n${c.hashtags.map(tag).join(' ')}`} /></div>
                <p className="pre">{c.caption}</p>
                <p className="muted small">{c.hashtags.map(tag).join(' ')}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {desc && (
        <section className="card">
          <div className="card__head"><h3>Product description</h3><CopyButton text={`${desc.headline}\n\n${desc.body}\n\n${desc.bullets.map((b) => `• ${b}`).join('\n')}`} /></div>
          <h4>{desc.headline}</h4>
          <p className="pre">{desc.body}</p>
          <ul className="checklist">{desc.bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>
        </section>
      )}

      {output.ad_concepts && (
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
      )}

      {output.content_ideas && (
        <section className="card">
          <h3>Content ideas</h3>
          <div className="grid-2">
            {output.content_ideas.map((c, i) => (
              <div key={i} className="sub-card"><span className="tag">{c.format}</span><h4>{c.title}</h4><p className="muted">{c.description}</p></div>
            ))}
          </div>
        </section>
      )}

      {output.launch_plan && (
        <section className="card">
          <div className="card__head">
            <h3>7-day launch plan</h3>
            <CopyButton text={output.launch_plan.map((l) => `${l.day} · ${l.platform}: ${l.post}`).join('\n')} label="Copy plan" />
          </div>
          <table className="table">
            <thead><tr><th>When</th><th>Where</th><th>Post</th></tr></thead>
            <tbody>{output.launch_plan.map((l, i) => <tr key={i}><td>{l.day}</td><td>{l.platform}</td><td>{l.post}</td></tr>)}</tbody>
          </table>
        </section>
      )}
    </div>
  )
}
