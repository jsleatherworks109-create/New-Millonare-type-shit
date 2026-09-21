// Single Vercel Function serving every /api/* endpoint (see vercel.json rewrites).
// Keeping one function stays well inside the Hobby plan's function limit.
import { dispatch } from './_lib/router.js'

export function GET(request: Request) {
  return dispatch(request)
}

export function POST(request: Request) {
  return dispatch(request)
}
