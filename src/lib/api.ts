export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const PASS_KEY = 'selamont-passcode'

export function getPasscode(): string {
  try {
    return localStorage.getItem(PASS_KEY) ?? ''
  } catch {
    return ''
  }
}

export function setPasscode(value: string) {
  try {
    localStorage.setItem(PASS_KEY, value)
  } catch {
    // Storage blocked; the passcode just won't be remembered.
  }
}

function headers(): Record<string, string> {
  const pass = getPasscode()
  return { 'Content-Type': 'application/json', ...(pass ? { 'X-Passcode': pass } : {}) }
}

async function send(method: 'GET' | 'POST', path: string, body?: unknown): Promise<Response> {
  try {
    return await fetch(`/api/${path}`, { method, headers: headers(), body: body === undefined ? undefined : JSON.stringify(body) })
  } catch {
    throw new ApiError(0, 'Can’t reach the Selamont app. Is it still running on your PC?')
  }
}

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const res = await send(method, path, body)
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Request failed (${res.status}).`)
  return data as T
}

/** Reads a newline-delimited JSON stream, calling onEvent for each event as it arrives. */
async function stream(path: string, body: unknown, onEvent: (event: Record<string, unknown>) => void): Promise<void> {
  const res = await send('POST', path, body)
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => null)
    throw new ApiError(res.status, data?.error ?? `Request failed (${res.status}).`)
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let nl: number
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      if (line) onEvent(JSON.parse(line))
    }
  }
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown) => request<T>('POST', path, body),
  stream,
}
