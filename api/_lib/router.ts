import { aiStatus } from './ai.js'
import { handleAdvice, handleAnalysisHistory, handleAnalyze } from './analyzer.js'
import { handleContent, handleContentHistory, handleDropCopy } from './content.js'
import * as data from './data.js'
import { HttpError, json } from './http.js'

type Handler = (req: Request) => Response | Promise<Response>

/** Routes shoppers can reach through the public launch-page link. Nothing else is exposed there. */
const PUBLIC: Record<string, Handler> = {
  'GET public/drop': (req) => data.publicDrop(req, false),
  'POST public/waitlist': data.joinWaitlist,
  'POST public/event': data.trackEvent,
}

/** Everything else: only from the app running on this PC (or your local network). */
const PRIVATE: Record<string, Handler> = {
  'GET health': async () => json({ ok: true, ai: await aiStatus() }),
  'GET settings': data.settings,
  'GET preview/drop': (req) => data.publicDrop(req, true),

  'POST content': handleContent,
  'GET content/history': handleContentHistory,
  'POST drop-copy': handleDropCopy,

  'POST analyze': handleAnalyze,
  'POST analyze/advice': handleAdvice,
  'GET analyze/history': handleAnalysisHistory,

  'GET drops': data.listDrops,
  'POST drops/create': data.createDrop,
  'POST drops/update': data.updateDrop,
  'POST drops/delete': data.deleteDrop,
  'GET drops/waitlist': data.dropWaitlist,
  'GET analytics': data.analytics,

  'GET creators': data.listCreatorData,
  'POST creators/save': data.saveCreator,
  'POST campaigns/save': data.saveCampaign,
  'POST deals/save': data.saveDeal,
  'POST records/delete': data.deleteRecord,
}

export async function dispatch(req: Request, opts: { publicOnly?: boolean } = {}): Promise<Response> {
  const route = new URL(req.url).pathname.replace(/^\/api\/?/, '').replace(/\/+$/, '')
  const key = `${req.method} ${route}`
  const handler = PUBLIC[key] ?? (opts.publicOnly ? undefined : PRIVATE[key])
  if (!handler) return json({ error: 'Not found' }, 404)

  const passcode = process.env.APP_PASSCODE
  if (!opts.publicOnly && !PUBLIC[key] && passcode && req.headers.get('x-passcode') !== passcode) {
    return json({ error: 'Passcode required' }, 401)
  }

  try {
    return await handler(req)
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status)
    console.error(`/api/${route} failed`, err)
    return json({ error: 'Something went wrong. Check the terminal for details.' }, 500)
  }
}
