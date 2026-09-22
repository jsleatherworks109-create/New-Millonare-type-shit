export interface Drop {
  id: string
  slug: string
  title: string
  description: string | null
  image_url: string | null
  price: string | null
  store_url: string | null
  launch_at: string
  quantity: number | null
  status: 'draft' | 'live' | 'ended'
  created_at: string
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
}


/** Anonymous id for counting unique visitors on public launch pages. No personal data. */
export function visitorId(): string {
  const key = 'selamont-vid'
  try {
    let id = localStorage.getItem(key)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(key, id)
    }
    return id
  } catch {
    return 'anon'
  }
}

/** "2026-10-01T18:00" (local, for <input type=datetime-local>) <-> ISO */
export function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function safeHttpUrl(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null
  } catch {
    return null
  }
}
