import * as cheerio from 'cheerio'
import { z } from 'zod'
import { generateStructured } from './ai.js'
import { db, newId, parseJson } from './db.js'
import { HttpError, json, readJson, str } from './http.js'
import { fetchPublicPage } from './safeFetch.js'

export type Category = 'conversion' | 'trust' | 'product' | 'mobile' | 'seo'

export interface Check {
  id: string
  category: Category
  label: string
  pass: boolean
  weight: number
  detail: string
  fix: string
}

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1 SelamontAnalyzer/1.0'

function has(text: string, re: RegExp) {
  return re.test(text)
}

/** Rule-based checks. These run on every plan and need no AI. */
export function runChecks(html: string, finalUrl: string, ms: number, bytes: number) {
  const $ = cheerio.load(html)
  const text = $('body').text().replace(/\s+/g, ' ').toLowerCase()
  const links = $('a')
    .map((_, a) => `${$(a).text()} ${$(a).attr('href') ?? ''}`.toLowerCase())
    .get()
    .join(' | ')
  const buttons = $('button, input[type=submit], a.btn, a.button, [role=button]')
    .map((_, b) => ($(b).text() || $(b).attr('value') || '').trim().toLowerCase())
    .get()
    .join(' | ')

  const title = $('title').first().text().trim()
  const metaDesc = $('meta[name="description"]').attr('content')?.trim() ?? ''
  const viewport = $('meta[name="viewport"]').attr('content') ?? ''
  const h1s = $('h1').length
  const images = $('img')
  const missingAlt = images.filter((_, img) => !($(img).attr('alt') ?? '').trim()).length
  const lazyImgs = images.filter((_, img) => $(img).attr('loading') === 'lazy').length
  const scripts = $('script[src]').length
  const ldJson = $('script[type="application/ld+json"]')
    .map((_, s) => $(s).contents().text())
    .get()
    .join(' ')
  const hasProductSchema = /"@type"\s*:\s*"?(Product|ProductGroup)/i.test(ldJson)
  const hasRatingSchema = /aggregateRating/i.test(ldJson)
  const ogImage = !!$('meta[property="og:image"]').attr('content')
  const emailInput = $('input[type=email], input[name*=email i]').length > 0
  const smallFixedWidth = /width\s*=\s*\d{3,}/.test(viewport)
  const tinyFont = /font-size\s*:\s*(9|10|11)px/i.test($('style').text())
  const https = finalUrl.startsWith('https://')

  const cta =
    has(`${buttons} ${links}`, /add to (cart|bag|basket)|buy (it )?now|get yours|pre-?order|checkout/) ||
    has(buttons, /\bshop\b|\bbuy\b/) ||
    has(links, /(^|\| )(shop|buy)( now| all| men| women| the| new|\s*\/)/)
  const price = /[$€£¥]\s?\d|\d+[.,]\d{2}\s?(usd|eur|gbp|€|\$)/i.test($('body').text())
  const reviews = hasRatingSchema || has(text, /\breviews?\b|testimonial|★|rated \d|\d(\.\d)? out of 5|trustpilot|judge\.me|yotpo|okendo|loox|stamped/)
  const shippingReturns = has(`${links} ${text}`, /shipping|delivery/) && has(`${links} ${text}`, /return|refund|exchange/)
  const contact = has(links, /contact|mailto:|tel:|support|help/)
  const paymentTrust = has(text, /secure checkout|shop pay|apple pay|google pay|paypal|klarna|afterpay|sezzle|affirm|money-back|guarantee/)
  const about = has(links, /about|our story/)
  const urgency = has(text, /limited|only \d+ left|low stock|sold out|ends (soon|tonight)|free shipping over/)

  const checks: Check[] = [
    { id: 'https', category: 'trust', label: 'Secure connection (HTTPS)', pass: https, weight: 10,
      detail: https ? 'The site loads over HTTPS.' : 'The site does not load over HTTPS.',
      fix: 'Turn on SSL in your store platform or hosting settings; browsers mark non-HTTPS pages as "Not secure".' },
    { id: 'cta', category: 'conversion', label: 'Clear buy button', pass: cta, weight: 10,
      detail: cta ? 'Found an add-to-cart / buy / shop-now call to action.' : 'No obvious "Add to cart", "Buy now" or "Shop now" button found on this page.',
      fix: 'Put one high-contrast primary button above the fold that tells shoppers exactly what to do next.' },
    { id: 'price', category: 'product', label: 'Prices visible', pass: price, weight: 6,
      detail: price ? 'Prices are shown on the page.' : 'No prices detected on the page.',
      fix: 'Show prices on product cards and pages. Hidden prices add friction and reduce clicks.' },
    { id: 'reviews', category: 'trust', label: 'Reviews and social proof', pass: reviews, weight: 9,
      detail: reviews ? 'Reviews, ratings or testimonials were found.' : 'No reviews, star ratings or testimonials detected.',
      fix: 'Add a reviews app and show star ratings near the price and buy button. Photo reviews convert best.' },
    { id: 'policies', category: 'trust', label: 'Shipping & returns info', pass: shippingReturns, weight: 7,
      detail: shippingReturns ? 'Shipping and returns information is linked.' : 'Shipping and/or returns information is hard to find.',
      fix: 'Link your shipping and returns policies in the footer and summarise them next to the buy button.' },
    { id: 'contact', category: 'trust', label: 'Easy to contact', pass: contact, weight: 5,
      detail: contact ? 'A contact or support link is present.' : 'No contact page, email or phone link found.',
      fix: 'Add a Contact link in the header or footer so shoppers know a real business is behind the store.' },
    { id: 'payments', category: 'conversion', label: 'Payment options & guarantees', pass: paymentTrust, weight: 5,
      detail: paymentTrust ? 'Payment options or guarantees are mentioned.' : 'No express payments, pay-later options or guarantees mentioned.',
      fix: 'Show accepted payment methods (Shop Pay, Apple Pay, PayPal, Klarna) and any money-back guarantee near checkout.' },
    { id: 'about', category: 'trust', label: 'Brand story', pass: about, weight: 3,
      detail: about ? 'An About / Our story page is linked.' : 'No About or Our story page linked.',
      fix: 'A short founder story builds trust, especially for small and print-on-demand brands.' },
    { id: 'email', category: 'conversion', label: 'Email capture', pass: emailInput, weight: 5,
      detail: emailInput ? 'There is a way to collect email addresses.' : 'No email signup form found.',
      fix: 'Add a newsletter or waitlist signup (e.g. 10% off first order) so visitors who don’t buy today can be reached later.' },
    { id: 'urgency', category: 'conversion', label: 'Reason to buy now', pass: urgency, weight: 3,
      detail: urgency ? 'Found offers, stock levels or free-shipping thresholds.' : 'No offers, stock levels or free-shipping thresholds mentioned.',
      fix: 'Give shoppers an honest reason to act now: a free-shipping threshold, limited run, or launch offer.' },
    { id: 'viewport', category: 'mobile', label: 'Mobile-friendly layout', pass: !!viewport && !smallFixedWidth, weight: 10,
      detail: viewport ? (smallFixedWidth ? 'The viewport is set to a fixed width.' : 'A responsive viewport tag is set.') : 'No viewport meta tag, so phones will show a zoomed-out desktop page.',
      fix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> and use a responsive theme.' },
    { id: 'fonts', category: 'mobile', label: 'Readable text size', pass: !tinyFont, weight: 3,
      detail: tinyFont ? 'Some text is styled at 11px or smaller.' : 'No tiny font sizes detected in page styles.',
      fix: 'Use at least 16px for body text on mobile; small text hurts readability and conversion.' },
    { id: 'speed', category: 'mobile', label: 'Fast server response', pass: ms < 1500, weight: 6,
      detail: `The page took ${(ms / 1000).toFixed(1)}s to download.`,
      fix: 'Slow first responses often come from heavy apps or redirects. Remove unused apps and use a fast theme.' },
    { id: 'weight', category: 'mobile', label: 'Lightweight page', pass: bytes < 600_000 && scripts <= 35, weight: 4,
      detail: `HTML is ${(bytes / 1024).toFixed(0)} KB with ${scripts} external scripts.`,
      fix: 'Every app adds scripts. Uninstall apps you don’t use and avoid stacking multiple popup or tracking tools.' },
    { id: 'lazy', category: 'mobile', label: 'Images load efficiently', pass: images.length < 8 || lazyImgs > 0, weight: 2,
      detail: `${lazyImgs} of ${images.length} images use lazy loading.`,
      fix: 'Lazy-load images below the fold so the first screen appears faster on phones.' },
    { id: 'title', category: 'seo', label: 'Page title', pass: title.length >= 10 && title.length <= 70, weight: 4,
      detail: title ? `"${title.slice(0, 90)}" (${title.length} characters)` : 'The page has no title.',
      fix: 'Write a 30–65 character title with your brand and what you sell.' },
    { id: 'meta', category: 'seo', label: 'Search description', pass: metaDesc.length >= 50 && metaDesc.length <= 170, weight: 3,
      detail: metaDesc ? `${metaDesc.length} characters.` : 'No meta description.',
      fix: 'Add a 120–160 character description. It is the ad copy shown under your link in Google.' },
    { id: 'h1', category: 'seo', label: 'One main heading', pass: h1s === 1, weight: 2,
      detail: `Found ${h1s} H1 heading${h1s === 1 ? '' : 's'}.`,
      fix: 'Use exactly one H1 that says what the page is about.' },
    { id: 'alt', category: 'seo', label: 'Image descriptions (alt text)', pass: images.length === 0 || missingAlt / images.length < 0.2, weight: 3,
      detail: `${missingAlt} of ${images.length} images have no alt text.`,
      fix: 'Describe product images in alt text; it helps Google Images and shoppers using screen readers.' },
    { id: 'schema', category: 'product', label: 'Product data for Google', pass: hasProductSchema, weight: 4,
      detail: hasProductSchema ? 'Product structured data found.' : 'No Product structured data on this page.',
      fix: 'Product schema lets Google show price, stock and ratings in search. Most store themes add it on product pages.' },
    { id: 'og', category: 'product', label: 'Share preview image', pass: ogImage, weight: 2,
      detail: ogImage ? 'An Open Graph image is set.' : 'No share image (og:image) set.',
      fix: 'Set an og:image so links shared on social and messaging apps show a product photo.' },
  ]

  const earned = checks.reduce((s, c) => s + (c.pass ? c.weight : 0), 0)
  const total = checks.reduce((s, c) => s + c.weight, 0)
  const categories = (['conversion', 'trust', 'product', 'mobile', 'seo'] as Category[]).map((cat) => {
    const list = checks.filter((c) => c.category === cat)
    const e = list.reduce((s, c) => s + (c.pass ? c.weight : 0), 0)
    const t = list.reduce((s, c) => s + c.weight, 0)
    return { category: cat, score: Math.round((e / t) * 100) }
  })

  const headings = $('h1, h2')
    .map((_, h) => $(h).text().trim())
    .get()
    .filter(Boolean)
    .slice(0, 20)
  const visibleText = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 6000)

  return {
    score: Math.round((earned / total) * 100),
    categories,
    checks,
    page: { title, metaDescription: metaDesc, headings, visibleText, imageCount: images.length, scriptCount: scripts },
  }
}

interface PageSpeed {
  performance: number | null
  lcpSeconds: number | null
  cls: number | null
  tbtMs: number | null
}

/** Google PageSpeed Insights (mobile). Free; an API key raises the rate limit. Returns null on failure. */
async function pageSpeed(url: string): Promise<PageSpeed | null> {
  const api = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed')
  api.searchParams.set('url', url)
  api.searchParams.set('strategy', 'mobile')
  api.searchParams.set('category', 'performance')
  if (process.env.PAGESPEED_API_KEY) api.searchParams.set('key', process.env.PAGESPEED_API_KEY)
  try {
    const res = await fetch(api, { signal: AbortSignal.timeout(50_000) })
    if (!res.ok) return null
    const data = await res.json()
    const lh = data.lighthouseResult
    const audit = (id: string) => lh?.audits?.[id]?.numericValue as number | undefined
    return {
      performance: lh?.categories?.performance?.score != null ? Math.round(lh.categories.performance.score * 100) : null,
      lcpSeconds: audit('largest-contentful-paint') != null ? +(audit('largest-contentful-paint')! / 1000).toFixed(1) : null,
      cls: audit('cumulative-layout-shift') != null ? +audit('cumulative-layout-shift')!.toFixed(2) : null,
      tbtMs: audit('total-blocking-time') != null ? Math.round(audit('total-blocking-time')!) : null,
    }
  } catch {
    return null
  }
}

const AdviceSchema = z.object({
  summary: z.string().describe('2-3 sentence plain-English verdict on the store.'),
  priorities: z
    .array(
      z.object({
        title: z.string(),
        category: z.enum(['conversion', 'trust', 'product', 'mobile', 'seo']),
        impact: z.enum(['high', 'medium', 'low']),
        why: z.string(),
        how: z.string().describe('Specific steps, referencing what is actually on the page.'),
      }),
    )
    .describe('4 prioritised fixes, highest impact first.'),
  quick_wins: z.array(z.string()).describe('4 changes that take under 30 minutes.'),
  copy_suggestions: z
    .array(z.object({ element: z.string(), current: z.string(), suggested: z.string() }))
    .describe('2 rewrites of headlines, buttons or descriptions seen on the page.'),
})
export type Advice = z.infer<typeof AdviceSchema>

interface StoredResult {
  url: string
  score: number
  checks: Check[]
  speed: unknown
  page?: ReturnType<typeof runChecks>['page']
  [key: string]: unknown
}

/** Fast part: fetch the store and run every rule-based check. No AI, no cost. */
export async function handleAnalyze(req: Request): Promise<Response> {
  const body = await readJson<{ url?: string }>(req, 5_000)
  const rawUrl = str(body.url, 500, 'Store URL', true)

  const page = await fetchPublicPage(rawUrl, MOBILE_UA)
  if (page.status >= 400) {
    throw new HttpError(422, `The site answered with an error (${page.status}). Password-protected or offline stores can’t be analyzed.`)
  }
  if (!/<html|<body|<!doctype/i.test(page.html.slice(0, 3000))) {
    throw new HttpError(422, 'That link didn’t return a web page.')
  }

  const [report, speed] = await Promise.all([
    Promise.resolve(runChecks(page.html, page.finalUrl, page.ms, page.bytes)),
    pageSpeed(page.finalUrl),
  ])

  const speedNote = speed
    ? null
    : process.env.PAGESPEED_API_KEY
      ? 'Google’s mobile speed test didn’t respond this time. Try again later.'
      : 'Mobile speed test skipped: add a free PAGESPEED_API_KEY to .env (see README).'

  const id = newId()
  const result = {
    id,
    url: page.finalUrl,
    analyzedAt: new Date().toISOString(),
    score: report.score,
    categories: report.categories,
    checks: report.checks,
    speed,
    speedNote,
    advice: null as Advice | null,
    responseMs: page.ms,
    page: report.page,
  }
  db().prepare('INSERT INTO store_analyses (id, url, score, result) VALUES (?, ?, ?, ?)').run(id, page.finalUrl, report.score, JSON.stringify(result))
  return json({ result })
}

/** Slow part (optional): AI-written recommendations for a scan that already ran. */
export async function handleAdvice(req: Request): Promise<Response> {
  const { id } = await readJson<{ id?: string }>(req, 1_000)
  const row = db().prepare('SELECT result FROM store_analyses WHERE id = ?').get(id ?? '') as { result: string } | undefined
  if (!row) throw new HttpError(404, 'Scan not found. Run the scan again.')
  const result = parseJson<StoredResult | null>(row.result, null)
  if (!result) throw new HttpError(500, 'Saved scan is unreadable.')

  const advice = await generateStructured({
    schema: AdviceSchema,
    maxTokens: 1100,
    system:
      'You are a senior e-commerce conversion consultant reviewing a small brand’s online store. Be specific to this store, practical and honest. Base every point on the evidence given; never invent numbers, traffic or sales figures.',
    prompt: JSON.stringify({
      url: result.url,
      score: result.score,
      failedChecks: result.checks.filter((c) => !c.pass).map((c) => `${c.label}: ${c.detail}`),
      passedChecks: result.checks.filter((c) => c.pass).map((c) => c.label),
      mobileSpeed: result.speed ?? 'not measured',
      title: result.page?.title,
      metaDescription: result.page?.metaDescription,
      headings: result.page?.headings?.slice(0, 12),
      visibleText: result.page?.visibleText?.slice(0, 2500),
    }),
  })

  const updated = { ...result, advice }
  db().prepare('UPDATE store_analyses SET result = ? WHERE id = ?').run(JSON.stringify(updated), id ?? '')
  return json({ result: updated })
}

export function handleAnalysisHistory(): Response {
  const rows = db()
    .prepare('SELECT id, url, score, result, created_at FROM store_analyses ORDER BY created_at DESC LIMIT 20')
    .all() as { id: string; url: string; score: number; result: string; created_at: string }[]
  return json({ items: rows.map((r) => ({ ...r, result: JSON.parse(r.result) })) })
}
