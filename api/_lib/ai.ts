import { z } from 'zod'
import { claudeConfigured, claudeStructured } from './claude.js'
import { HttpError } from './http.js'

/**
 * AI provider switch.
 * - Default: free local models through Ollama (runs on this PC's processor).
 * - If ANTHROPIC_API_KEY is set: Claude (faster, higher quality, paid per use).
 */
const OLLAMA_URL = (process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434').replace(/\/$/, '')
export const TEXT_MODEL = process.env.OLLAMA_TEXT_MODEL ?? 'qwen3:4b-instruct'
export const VISION_MODEL = process.env.OLLAMA_VISION_MODEL ?? 'qwen2.5vl:7b'
// Unload models shortly after use so they don't hold RAM other programs need.
const KEEP_ALIVE = process.env.OLLAMA_KEEP_ALIVE ?? '2m'

export type Provider = 'claude' | 'ollama'

export function provider(): Provider {
  return claudeConfigured() ? 'claude' : 'ollama'
}

export interface AiStatus {
  provider: Provider
  ready: boolean
  textModel: string | null
  visionModel: string | null
  problem: string | null
}

export async function aiStatus(): Promise<AiStatus> {
  if (provider() === 'claude') {
    return { provider: 'claude', ready: true, textModel: 'claude-opus-5', visionModel: 'claude-opus-5', problem: null }
  }
  try {
    // Generous timeout: Ollama answers slowly while it's loading a model.
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(15_000) })
    const data = (await res.json()) as { models?: { name: string }[] }
    const names = new Set((data.models ?? []).map((m) => m.name))
    const hasText = names.has(TEXT_MODEL)
    const hasVision = names.has(VISION_MODEL)
    return {
      provider: 'ollama',
      ready: hasText,
      textModel: hasText ? TEXT_MODEL : null,
      visionModel: hasVision ? VISION_MODEL : null,
      problem: hasText ? null : `Ollama is running but the model "${TEXT_MODEL}" is missing. Run: ollama pull ${TEXT_MODEL}`,
    }
  } catch {
    return { provider: 'ollama', ready: false, textModel: null, visionModel: null, problem: 'Ollama is not running. Start the Ollama app, then try again.' }
  }
}

interface OllamaChunk {
  message?: { content?: string }
  done?: boolean
  error?: string
}

async function ollamaChat(opts: {
  model: string
  system?: string
  prompt: string
  images?: string[]
  format?: object
  maxTokens: number
  keepAlive?: string | number
  onToken?: (count: number) => void
}): Promise<string> {
  let res: Response
  try {
    res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: opts.model,
        stream: true,
        keep_alive: opts.keepAlive ?? KEEP_ALIVE,
        format: opts.format,
        options: { temperature: 0.7, num_predict: opts.maxTokens, num_ctx: 6144 },
        messages: [
          ...(opts.system ? [{ role: 'system', content: opts.system }] : []),
          { role: 'user', content: opts.prompt, ...(opts.images?.length ? { images: opts.images } : {}) },
        ],
      }),
    })
  } catch {
    throw new HttpError(503, 'Can’t reach Ollama. Make sure the Ollama app is running on this PC.')
  }
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '')
    if (res.status === 404 || /not found/i.test(text)) {
      throw new HttpError(503, `The AI model "${opts.model}" isn’t installed. Run: ollama pull ${opts.model}`)
    }
    throw new HttpError(502, `Local AI error: ${text.slice(0, 200) || res.status}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let out = ''
  let tokens = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let nl: number
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      if (!line) continue
      const chunk = JSON.parse(line) as OllamaChunk
      if (chunk.error) throw new HttpError(502, `Local AI error: ${chunk.error}`)
      if (chunk.message?.content) {
        out += chunk.message.content
        tokens++
        opts.onToken?.(tokens)
      }
    }
  }
  return out
}

/** Short written description of product photos, so the faster text model can write about them. */
export async function describeImages(images: string[], onToken?: (n: number) => void): Promise<string> {
  return ollamaChat({
    model: VISION_MODEL,
    prompt:
      'You are helping a copywriter. Describe the product in these photos in under 80 words: what the item is, colours, materials, any print or graphic, style, and the setting. Facts only, no marketing language.',
    images,
    maxTokens: 180,
    keepAlive: 0, // free its ~6 GB of RAM immediately; the text model runs next
    onToken,
  })
}

/**
 * One AI call that must return JSON matching `schema`.
 * Claude receives the images directly; local models get the text description instead.
 */
export async function generateStructured<S extends z.ZodType>(opts: {
  schema: S
  system: string
  prompt: string
  images?: { mediaType: string; data: string }[]
  maxTokens: number
  onToken?: (count: number) => void
}): Promise<z.infer<S>> {
  if (provider() === 'claude') {
    return claudeStructured({ schema: opts.schema, system: opts.system, prompt: opts.prompt, images: opts.images })
  }

  const jsonSchema = z.toJSONSchema(opts.schema) as Record<string, unknown>
  delete jsonSchema.$schema

  let lastError = 'unknown'
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await ollamaChat({
      model: TEXT_MODEL,
      system: `${opts.system}\nRespond only with JSON that matches the requested schema.`,
      prompt: opts.prompt,
      format: jsonSchema,
      maxTokens: opts.maxTokens,
      onToken: opts.onToken,
    })
    try {
      const parsed = opts.schema.safeParse(JSON.parse(text))
      if (parsed.success) return parsed.data
      lastError = parsed.error.message
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e)
    }
  }
  console.error('Local AI returned invalid JSON:', lastError)
  throw new HttpError(502, 'The local AI returned something unreadable. Please try again.')
}
