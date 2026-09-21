import react from '@vitejs/plugin-react'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite'

/**
 * Serves /api/* in `npm run dev` using the exact same code Vercel runs,
 * so the engines work locally without the Vercel CLI.
 */
function localApi(): Plugin {
  return {
    name: 'selamont-local-api',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/api', async (req: IncomingMessage & { originalUrl?: string }, res: ServerResponse) => {
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
          const { dispatch } = await server.ssrLoadModule('/api/_lib/router.ts')
          const response: Response = await dispatch(request)
          res.statusCode = response.status
          response.headers.forEach((value, key) => res.setHeader(key, value))
          res.end(Buffer.from(await response.arrayBuffer()))
        } catch (err) {
          console.error(err)
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Local API crashed; see the terminal.' }))
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  // Make .env values (including server secrets) available to the local API as process.env.
  for (const [key, value] of Object.entries(loadEnv(mode, process.cwd(), ''))) {
    process.env[key] ??= value
  }
  return { plugins: [react(), localApi()] }
})
