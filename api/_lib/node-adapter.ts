import type { IncomingMessage, ServerResponse } from 'node:http'

type Dispatch = (req: Request, opts?: { publicOnly?: boolean }) => Promise<Response>

/** Converts a Node request into a web Request, runs the API, and streams the Response back. */
export async function runApi(
  loadDispatch: () => Promise<Dispatch>,
  req: IncomingMessage & { originalUrl?: string },
  res: ServerResponse,
  opts: { publicOnly?: boolean } = {},
) {
  try {
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(chunk as Buffer)
    const headers = new Headers()
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') headers.set(key, value)
      else if (Array.isArray(value)) headers.set(key, value.join(', '))
    }
    const request = new Request(`http://localhost${req.originalUrl ?? req.url}`, {
      method: req.method,
      headers,
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks),
    })
    const response = await (await loadDispatch())(request, opts)
    res.statusCode = response.status
    response.headers.forEach((value, key) => res.setHeader(key, value))
    if (!response.body) return void res.end()
    const reader = response.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      res.write(value)
    }
    res.end()
  } catch (err) {
    console.error(err)
    if (!res.headersSent) {
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json')
    }
    res.end(JSON.stringify({ error: 'Local server crashed; see the terminal.' }))
  }
}
