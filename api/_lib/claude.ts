import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import type { z } from 'zod'
import { HttpError } from './http.js'

// Optional upgrade path: set ANTHROPIC_API_KEY in .env and the app uses Claude instead of local AI.
const MODEL = 'claude-opus-5'

let client: Anthropic | null = null

export function claudeConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY
}

export async function claudeStructured<S extends z.ZodType>(opts: {
  schema: S
  system: string
  prompt: string
  images?: { mediaType: string; data: string }[]
}): Promise<z.infer<S>> {
  client ??= new Anthropic()
  const content: Anthropic.Beta.BetaContentBlockParam[] = [
    ...(opts.images ?? []).map(
      (img): Anthropic.Beta.BetaContentBlockParam => ({
        type: 'image',
        source: { type: 'base64', media_type: img.mediaType as 'image/jpeg', data: img.data },
      }),
    ),
    { type: 'text', text: opts.prompt },
  ]
  try {
    const response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: opts.system,
      messages: [{ role: 'user', content }],
      output_config: { effort: 'medium', format: betaZodOutputFormat(opts.schema) },
    })
    if (response.stop_reason === 'refusal') throw new HttpError(422, 'The AI declined this request. Try rewording it.')
    if (response.stop_reason === 'max_tokens') throw new HttpError(502, 'The AI response was cut off. Please try again.')
    if (!response.parsed_output) throw new HttpError(502, 'The AI returned an unexpected format. Please try again.')
    return response.parsed_output
  } catch (err) {
    if (err instanceof HttpError) throw err
    if (err instanceof Anthropic.AuthenticationError) throw new HttpError(503, 'The ANTHROPIC_API_KEY in .env is invalid.')
    if (err instanceof Anthropic.RateLimitError) throw new HttpError(429, 'Claude is busy right now. Try again in a minute.')
    if (err instanceof Anthropic.APIError) {
      console.error('Claude API error', err.status, err.message)
      throw new HttpError(502, 'The Claude service had a problem. Please try again.')
    }
    throw err
  }
}
