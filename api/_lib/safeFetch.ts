import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { HttpError } from './http.js'

/** Blocks addresses a public-website fetch should never reach (localhost, LAN, cloud metadata, etc.). */
function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number)
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19))
    )
  }
  const v6 = ip.toLowerCase()
  if (v6.startsWith('::ffff:')) return isPrivateAddress(v6.slice(7))
  return v6 === '::' || v6 === '::1' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe80')
}

async function assertPublicUrl(url: URL) {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new HttpError(400, 'Only http and https links are supported.')
  if (url.port && url.port !== '80' && url.port !== '443') throw new HttpError(400, 'That port is not allowed.')
  if (url.username || url.password) throw new HttpError(400, 'Links with passwords are not allowed.')
  const host = url.hostname.replace(/^\[|\]$/g, '')
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => [])
  if (addresses.length === 0) throw new HttpError(400, `Couldn't find a website at ${url.hostname}.`)
  if (addresses.some((a) => isPrivateAddress(a.address))) throw new HttpError(400, 'That address is not a public website.')
}

export interface FetchedPage {
  finalUrl: string
  status: number
  html: string
  bytes: number
  ms: number
  headers: Headers
}

const MAX_BYTES = 3_000_000

/** Fetches a public web page, following up to 5 redirects and re-checking every hop. */
export async function fetchPublicPage(rawUrl: string, userAgent: string): Promise<FetchedPage> {
  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`)
  } catch {
    throw new HttpError(400, 'That doesn’t look like a valid website address.')
  }

  const started = Date.now()
  for (let hop = 0; hop < 6; hop++) {
    await assertPublicUrl(url)
    let res: Response
    try {
      res = await fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(15_000),
        headers: { 'User-Agent': userAgent, Accept: 'text/html,application/xhtml+xml' },
      })
    } catch {
      throw new HttpError(502, `Couldn't reach ${url.hostname}. Check the address and that the site is online.`)
    }

    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      url = new URL(res.headers.get('location')!, url)
      continue
    }

    const reader = res.body?.getReader()
    const chunks: Uint8Array[] = []
    let bytes = 0
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        bytes += value.byteLength
        if (bytes > MAX_BYTES) {
          await reader.cancel()
          break
        }
        chunks.push(value)
      }
    }
    const html = new TextDecoder().decode(Buffer.concat(chunks))
    return { finalUrl: url.toString(), status: res.status, html, bytes, ms: Date.now() - started, headers: res.headers }
  }
  throw new HttpError(502, 'That site redirected too many times.')
}
