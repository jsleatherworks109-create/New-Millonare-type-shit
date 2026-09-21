import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import type { z } from 'zod'
import { HttpError } from './http.js'

const MODEL = 'claude-opus-5'

let client: Anthropic | null = null
function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new HttpError(503, 'AI is not set up yet: add ANTHROPIC_API_KEY to the server environment.')
  }
  client ??= new Anthropic()
  return client
}

export function aiConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY
}

/**
 * One Claude call that must return JSON matching `schema`.
 * Uses server-side refusal fallbacks so a declined request is retried on the recommended model.
 */
export async function generateStructured<S extends z.ZodType>(opts: {
  schema: S
  system: string
  content: Anthropic.Beta.BetaContentBlockParam[]
  effort?: 'low' | 'medium' | 'high'
}): Promise<z.infer<S>> {
  try {
    const response = await getClient().beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: opts.system,
      messages: [{ role: 'user', content: opts.content }],
      output_config: { effort: opts.effort ?? 'medium', format: betaZodOutputFormat(opts.schema) },
    })

    if (response.stop_reason === 'refusal') {
      throw new HttpError(422, 'The AI declined this request. Try rewording the product details.')
    }
    if (response.stop_reason === 'max_tokens') {
      throw new HttpError(502, 'The AI response was cut off. Please try again with less input.')
    }
    if (!response.parsed_output) throw new HttpError(502, 'The AI returned an unexpected format. Please try again.')
    return response.parsed_output
  } catch (err) {
    if (err instanceof HttpError) throw err
    if (err instanceof Anthropic.AuthenticationError) {
      throw new HttpError(503, 'The AI key on the server is invalid.')
    }
    if (err instanceof Anthropic.RateLimitError) {
      throw new HttpError(429, 'The AI is busy right now. Please try again in a minute.')
    }
    if (err instanceof Anthropic.APIError) {
      console.error('Claude API error', err.status, err.message)
      throw new HttpError(502, 'The AI service had a problem. Please try again.')
    }
    throw err
  }
}
