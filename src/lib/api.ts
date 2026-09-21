import { supabase } from './supabase'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function authHeader(): Promise<Record<string, string>> {
  if (!supabase) return {}
  const { data } = await supabase.auth.getSession()
  return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}
}

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api/${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, 'Could not reach the server. Check your connection.')
  }
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const fallback =
      res.status === 404
        ? 'This feature needs the Selamont server. On GitHub Pages only the website works; host on Vercel for the engines.'
        : `Request failed (${res.status}).`
    throw new ApiError(res.status, data?.error ?? fallback)
  }
  return data as T
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown) => request<T>('POST', path, body),
}
