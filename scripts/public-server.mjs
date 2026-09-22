// Public launch-page server.
// Serves ONLY the launch pages (/d/your-drop) and the three shopper endpoints (view drop, join waitlist,
// record a visit). Your tools, data and settings are never reachable from this server.
// With cloudflared installed it also opens a free public https link and saves it so the app can show it.
import { spawn } from 'node:child_process'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'
import { createServer as createVite, loadEnv } from 'vite'

const PORT = Number(process.env.PUBLIC_PORT ?? 5174)
const DIST = resolve('dist')
if (!existsSync(join(DIST, 'index.html'))) {
  console.error('No build found. Run: npm run build')
  process.exit(1)
}

// Vite in middleware mode is used only to load the TypeScript server code; it serves no files.
for (const [key, value] of Object.entries(loadEnv('production', process.cwd(), ''))) process.env[key] ??= value
const vite = await createVite({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' })
const { runApi } = await vite.ssrLoadModule('/api/_lib/node-adapter.ts')
const { setSetting } = await vite.ssrLoadModule('/api/_lib/db.ts')
const loadDispatch = async () => (await vite.ssrLoadModule('/api/_lib/router.ts')).dispatch

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
}

function sendFile(res, file) {
  res.writeHead(200, {
    'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
    'Cache-Control': file.includes(`${join('dist', 'assets')}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  })
  createReadStream(file).pipe(res)
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x')
  if (url.pathname.startsWith('/api/')) return runApi(loadDispatch, req, res, { publicOnly: true })

  // Static build assets only.
  const file = normalize(join(DIST, decodeURIComponent(url.pathname)))
  if (file.startsWith(DIST) && url.pathname !== '/' && existsSync(file) && statSync(file).isFile()) return sendFile(res, file)

  // Launch pages are the only app screens on the public link.
  if (/^\/d\/[a-z0-9-]+\/?$/.test(url.pathname)) return sendFile(res, join(DIST, 'index.html'))

  res.writeHead(404, { 'Content-Type': 'text/plain' })
  res.end('Not found')
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Public launch pages running on http://localhost:${PORT}/d/<your-drop>`)
  startTunnel()
})

function startTunnel() {
  if (process.env.NO_TUNNEL) return
  const tunnel = spawn('cloudflared', ['tunnel', '--no-autoupdate', '--url', `http://localhost:${PORT}`], { stdio: ['ignore', 'pipe', 'pipe'] })
  tunnel.on('error', () => {
    console.log('cloudflared not found, so launch pages are only on this PC. Install it to share a public link.')
  })
  const onData = (buf) => {
    const match = buf.toString().match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)
    if (match) {
      setSetting('public_url', match[0])
      console.log(`\n  PUBLIC LINK: ${match[0]}/d/<your-drop>\n  (Keep this window open. The link changes each time you restart.)\n`)
    }
  }
  tunnel.stdout.on('data', onData)
  tunnel.stderr.on('data', onData)
  const stop = () => {
    setSetting('public_url', null)
    tunnel.kill()
    process.exit(0)
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
}
