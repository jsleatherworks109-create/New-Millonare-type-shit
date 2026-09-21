import type Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { admin, enforceDailyLimit, getCaller, requirePlan } from './auth.js'
import { generateStructured } from './claude.js'
import { HttpError, json, readJson, str } from './http.js'

const PLATFORMS = ['instagram', 'tiktok', 'facebook', 'pinterest', 'youtube', 'email'] as const

export const ContentSchema = z.object({
  product_summary: z.string().describe('One or two sentences on what the product is and who it is for.'),
  hooks: z.array(z.string()).describe('10 scroll-stopping opening lines for short-form video or posts.'),
  captions: z
    .array(
      z.object({
        platform: z.string(),
        caption: z.string(),
        hashtags: z.array(z.string()),
      }),
    )
    .describe('Two captions for each requested platform.'),
  product_description: z.object({
    headline: z.string(),
    body: z.string().describe('2-3 short paragraphs for a product page.'),
    bullets: z.array(z.string()).describe('4-6 benefit-led bullet points.'),
  }),
  ad_concepts: z
    .array(
      z.object({
        name: z.string(),
        angle: z.string(),
        hook: z.string(),
        script: z.string().describe('Short script or storyboard for a 15-30 second ad.'),
        visual: z.string(),
        cta: z.string(),
      }),
    )
    .describe('3-4 distinct paid ad concepts.'),
  content_ideas: z
    .array(z.object({ format: z.string(), title: z.string(), description: z.string() }))
    .describe('6-8 organic content ideas (UGC, behind the scenes, tutorials, etc.).'),
  launch_plan: z
    .array(z.object({ day: z.string(), platform: z.string(), post: z.string() }))
    .describe('A 7-day launch sequence, one or two posts per day.'),
})
export type ContentOutput = z.infer<typeof ContentSchema>

interface ContentRequest {
  productName?: string
  details?: string
  audience?: string
  tone?: string
  goal?: string
  platforms?: string[]
  images?: { mediaType: string; data: string }[]
}

const SYSTEM = `You are the Content Engine inside Selamont, a platform for independent e-commerce brands, creators and print-on-demand sellers.
You write marketing content that sounds like a sharp, human brand, not like AI: concrete, specific to the actual product, no filler, no clichés like "elevate" or "game-changer", no fake statistics, no invented reviews or claims the brand has not given you.
When product photos or mockups are provided, study them closely and use what you actually see (colours, materials, print, setting, style) in the copy.
If a detail is unknown, write around it rather than inventing it.`

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

export async function handleContent(req: Request): Promise<Response> {
  const caller = await getCaller(req)
  requirePlan(caller, 'growth', 'The Content Engine')
  await enforceDailyLimit(caller, 'content_generations', { free: 0, growth: 40, scale: 150 })

  const body = await readJson<ContentRequest>(req)
  const productName = str(body.productName, 120, 'Product name', true)
  const details = str(body.details, 3000, 'Product details')
  const audience = str(body.audience, 300, 'Audience')
  const tone = str(body.tone, 60, 'Tone') || 'confident and friendly'
  const goal = str(body.goal, 60, 'Goal') || 'product launch'
  const platforms = (body.platforms ?? []).filter((p): p is (typeof PLATFORMS)[number] =>
    (PLATFORMS as readonly string[]).includes(p),
  )
  const images = (body.images ?? []).slice(0, 4)
  if (!details && images.length === 0) {
    throw new HttpError(400, 'Add a product photo or a short description so there is something to write about.')
  }
  for (const img of images) {
    if (!IMAGE_TYPES.has(img.mediaType) || typeof img.data !== 'string') throw new HttpError(400, 'Unsupported image.')
  }

  const content: Anthropic.Beta.BetaContentBlockParam[] = [
    ...images.map(
      (img): Anthropic.Beta.BetaContentBlockParam => ({
        type: 'image',
        source: { type: 'base64', media_type: img.mediaType as 'image/jpeg', data: img.data },
      }),
    ),
    {
      type: 'text',
      text: [
        `Product: ${productName}`,
        details && `Details from the brand: ${details}`,
        audience && `Target audience: ${audience}`,
        `Tone of voice: ${tone}`,
        `Goal: ${goal}`,
        `Platforms: ${(platforms.length ? platforms : ['instagram', 'tiktok']).join(', ')}`,
        images.length ? `${images.length} product image(s) attached above.` : 'No images provided.',
        '',
        'Create the full content pack.',
      ]
        .filter(Boolean)
        .join('\n'),
    },
  ]

  const output = await generateStructured({ schema: ContentSchema, system: SYSTEM, content })

  let id: string | null = null
  if (admin && caller.user) {
    const { data, error } = await admin
      .from('content_generations')
      .insert({
        user_id: caller.user.id,
        product_name: productName,
        input: { details, audience, tone, goal, platforms, imageCount: images.length },
        output,
      })
      .select('id')
      .single()
    if (error) console.error('Could not save generation', error)
    id = data?.id ?? null
  }

  return json({ id, output })
}

/* ---------------- Drop announcement copy ---------------- */

const DropCopySchema = z.object({
  email_subject: z.string(),
  email_preview: z.string(),
  email_body: z.string(),
  instagram_caption: z.string(),
  tiktok_script: z.string(),
  sms: z.string().describe('Under 160 characters.'),
  countdown_posts: z.array(z.object({ when: z.string(), post: z.string() })).describe('Posts for 7 days, 3 days, 1 day, 1 hour before and at launch.'),
})

export async function handleDropCopy(req: Request): Promise<Response> {
  const caller = await getCaller(req)
  requirePlan(caller, 'growth', 'Launch announcements')
  await enforceDailyLimit(caller, 'content_generations', { free: 0, growth: 40, scale: 150 })

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
    effort: 'low',
    content: [
      {
        type: 'text',
        text: [
          `Write launch announcements for a limited product drop.`,
          `Drop: ${title}`,
          description && `About it: ${description}`,
          price && `Price: ${price}`,
          launchAt && `Launches: ${launchAt}`,
          quantity ? `Only ${quantity} available.` : '',
          url && `Waitlist / launch page link: ${url}`,
          'Build urgency honestly. Do not invent scarcity beyond what is stated.',
        ]
          .filter(Boolean)
          .join('\n'),
      },
    ],
  })

  if (admin && caller.user) {
    await admin.from('content_generations').insert({
      user_id: caller.user.id,
      product_name: `Drop: ${title}`,
      input: { kind: 'drop-copy', title },
      output,
    })
  }
  return json({ output })
}
