import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

/** Serves /api/* from the same dev server so the whole app runs with one command. */
function localApi(): Plugin {
  return {
    name: 'selamont-local-api',
    configureServer(server) {
      server.middlewares.use('/api', async (req, res) => {
        const { runApi } = await server.ssrLoadModule('/api/_lib/node-adapter.ts')
        await runApi(async () => (await server.ssrLoadModule('/api/_lib/router.ts')).dispatch, req, res)
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  // Make .env values available to the server code as process.env.
  for (const [key, value] of Object.entries(loadEnv(mode, process.cwd(), ''))) {
    process.env[key] ??= value
  }
  return {
    plugins: [react(), localApi()],
    server: { port: 5173 },
  }
})
