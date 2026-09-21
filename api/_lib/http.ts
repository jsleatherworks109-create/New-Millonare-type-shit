export class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

export async function readJson<T>(req: Request, maxBytes = 4_000_000): Promise<T> {
  const text = await req.text()
  if (text.length > maxBytes) throw new HttpError(413, 'Request is too large.')
  try {
    return JSON.parse(text || '{}') as T
  } catch {
    throw new HttpError(400, 'Request body must be JSON.')
  }
}

export function str(value: unknown, max: number, field: string, required = false): string {
  const s = typeof value === 'string' ? value.trim() : ''
  if (required && !s) throw new HttpError(400, `${field} is required.`)
  if (s.length > max) throw new HttpError(400, `${field} must be ${max} characters or fewer.`)
  return s
}
