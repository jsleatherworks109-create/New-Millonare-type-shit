import { z } from 'zod'
import { describeImages, generateStructured, provider } from './ai.js'
import { db, newId } from './db.js'
import { HttpError, json, readJson, str } from './http.js'

const PLATFORMS = ['instagram', 'tiktok', 'facebook', 'pinterest', 'youtube', 'email'] as const

const SYSTEM = `You are the Content Engine for an independent e-commerce brand.
Write marketing content that sounds like a sharp, human brand: concrete, specific to the actual product, no filler, no clichés like "elevate" or "game-changer", no fake statistics, no invented reviews or claims.
Only state facts that appear in the brand's details or the photo description. Never add materials, care instructions, sizing, shipping, guarantees or awards that weren't given. If a detail is unknown, leave it out.`

/** Each section is its own small AI call so results appear one by one (important on slow local AI). */
const SECTIONS = {
  hooks: {
    label: 'hooks',
    maxTokens: 450,
    schema: z.object({ hooks: z.array(z.string()).describe('8 scroll-stopping opening lines for short videos or posts') }),
    ask: 'Write 8 different scroll-stopping hooks (opening lines) for short-form videos and posts.',
  },
  captions: {
    label: 'captions',
    maxTokens: 900,
    schema: z.object({
      captions: z.array(z.object({ platform: z.string(), caption: z.string(), hashtags: z.array(z.string()) })),
    }),
    ask: 'Write one ready-to-post caption for each platform listed, with 3-6 relevant hashtags each.',
  },
  description: {
    label: 'product description',
    maxTokens: 500,
    schema: z.object({
      product_description: z.object({
        headline: z.string(),
        body: z.string().describe('2 short paragraphs for the product page'),
        bullets: z.array(z.string()).describe('4-5 benefit-led bullet points'),
      }),
    }),
    ask: 'Write the product page copy: a headline, two short paragraphs, and 4-5 benefit bullets.',
  },
  ads: {
    label: 'ad concepts',
    maxTokens: 800,
    schema: z.object({
      ad_concepts: z.array(
        z.object({ name: z.string(), angle: z.string(), hook: z.string(), script: z.string(), visual: z.string(), cta: z.string() }),
      ),
    }),
    ask: 'Write 2 distinct paid ad concepts. For each: a name, the angle, the hook, a short 15-30 second script, the visual, and the call to action.',
  },
  ideas: {
    label: 'content ideas',
    maxTokens: 550,
    schema: z.object({ content_ideas: z.array(z.object({ format: z.string(), title: z.string(), description: z.string() })) }),
    ask: 'Suggest 5 organic content ideas (e.g. behind the scenes, styling, UGC-style, tutorial). One sentence each.',
  },
  plan: {
    label: 'launch plan',
    maxTokens: 700,
    schema: z.object({ launch_plan: z.array(z.object({ day: z.string(), platform: z.string(), post: z.string() })) }),
    ask: 'Write a 7-day launch plan: one post per day (Day 1 to Day 7), with the platform and a one-sentence description of the post.',
  },
} as const

type SectionKey = keyof typeof SECTIONS

interface ContentRequest {
  productName?: string
  details?: string
  audience?: string
  tone?: string
  goal?: string
  platforms?: string[]
  sections?: string[]
  images?: { mediaType: string; data: string }[]
}

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

/** Streams newline-delimited JSON events so the page can show each section as soon as it's written. */
export async function handleContent(req: Request): Promise<Response> {
  const body = await readJson<ContentRequest>(req)
  const productName = str(body.productName, 120, 'Product name', true)
  const details = str(body.details, 3000, 'Product details')
  const audience = str(body.audience, 300, 'Audience')
  const tone = str(body.tone, 60, 'Tone') || 'confident and friendly'
  const goal = str(body.goal, 60, 'Goal') || 'product launch'
  const platforms = (body.platforms ?? []).filter((p) => (PLATFORMS as readonly string[]).includes(p))
  const sections = (body.sections ?? Object.keys(SECTIONS)).filter((s): s is SectionKey => s in SECTIONS)
  const images = (body.images ?? []).slice(0, 4)
  if (!details && images.length === 0) throw new HttpError(400, 'Add a product photo or a short description first.')
  if (sections.length === 0) throw new HttpError(400, 'Pick at least one thing to write.')
  for (const img of images) if (!IMAGE_TYPES.has(img.mediaType)) throw new HttpError(400, 'Unsupported image type.')

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: object) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
      const output: Record<string, unknown> = {}
      let lastProgress = 0
      const progress = (section: string) => (tokens: number) => {
        const now = Date.now()
        if (now - lastProgress > 700) {
          lastProgress = now
          send({ type: 'progress', section, tokens })
        }
      }

      try {
        let photoNotes = ''
        if (images.length && provider() === 'ollama') {
          send({ type: 'status', section: 'photos', message: 'Looking at your photos…' })
          photoNotes = (await describeImages(images.map((i) => i.data), progress('photos'))).trim()
          output.photo_notes = photoNotes
          send({ type: 'section', key: 'photo_notes', data: { photo_notes: photoNotes } })
        }

        const brief = [
          `Product: ${productName}`,
          details && `Details from the brand: ${details}`,
          photoNotes && `What the product photos show: ${photoNotes}`,
          audience && `Target audience: ${audience}`,
          `Tone of voice: ${tone}`,
          `Goal: ${goal}`,
          `Platforms: ${(platforms.length ? platforms : ['instagram', 'tiktok']).join(', ')}`,
        ]
          .filter(Boolean)
          .join('\n')

        for (const key of sections) {
          const s = SECTIONS[key]
          send({ type: 'status', section: key, message: `Writing ${s.label}…` })
          try {
            const data = await generateStructured({
              schema: s.schema,
              system: SYSTEM,
              prompt: `${brief}\n\nTask: ${s.ask}`,
              images: provider() === 'claude' ? images : undefined,
              maxTokens: s.maxTokens,
              onToken: progress(key),
            })
            Object.assign(output, data)
            send({ type: 'section', key, data })
          } catch (err) {
            send({ type: 'error', section: key, message: err instanceof HttpError ? err.message : `Couldn’t write ${s.label}.` })
            if (err instanceof HttpError && err.status === 503) break // AI not available: stop trying.
          }
        }

        const id = newId()
        if (Object.keys(output).some((k) => k !== 'photo_notes')) {
          db()
            .prepare('INSERT INTO content_generations (id, product_name, input, output) VALUES (?, ?, ?, ?)')
            .run(id, productName, JSON.stringify({ details, audience, tone, goal, platforms, imageCount: images.length }), JSON.stringify(output))
        }
        send({ type: 'done', id })
      } catch (err) {
        send({ type: 'error', section: 'all', message: err instanceof HttpError ? err.message : 'Something went wrong.' })
        console.error(err)
      }
      controller.close()
    },
  })
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' } })
}

export function handleContentHistory(): Response {
  const rows = db()
    .prepare('SELECT id, product_name, output, created_at FROM content_generations ORDER BY created_at DESC LIMIT 30')
    .all() as { id: string; product_name: string; output: string; created_at: string }[]
  return json({ items: rows.map((r) => ({ ...r, output: JSON.parse(r.output) })) })
}

/* ---------------- Drop announcement copy ---------------- */

const DropCopySchema = z.object({
  email_subject: z.string(),
  email_body: z.string().describe('Short launch email, under 120 words'),
  instagram_caption: z.string(),
  tiktok_script: z.string().describe('Under 60 words'),
  sms: z.string().describe('Under 160 characters'),
  countdown_posts: z.array(z.object({ when: z.string(), post: z.string() })).describe('4 posts: 3 days before, 1 day before, 1 hour before, launch'),
})

export async function handleDropCopy(req: Request): Promise<Response> {
  const body = await readJson<Record<string, unknown>>(req, 20_000)
  const title = str(body.title, 120, 'Drop name', true)
  const description = str(body.description, 4000, 'Description')
  const price = str(body.price, 40, 'Price')
  const launchAt = str(body.launchAt, 60, 'Launch time')
  const quantity = typeof body.quantity === 'number' ? body.quantity : null
  const url = str(body.url, 300, 'Link')

  const output = await generateStructured({
    schema: DropCopySchema,
    system: SYSTEM,
    maxTokens: 1000,
    prompt: [
      'Write launch announcements for a limited product drop.',
      `Drop: ${title}`,
      description && `About it: ${description}`,
      price && `Price: ${price}`,
      launchAt && `Launches: ${launchAt}`,
      quantity ? `Only ${quantity} available.` : '',
      url && `Launch page link: ${url}`,
      'Build urgency honestly. Do not invent scarcity beyond what is stated.',
    ]
      .filter(Boolean)
      .join('\n'),
  })
  return json({ output })
}
