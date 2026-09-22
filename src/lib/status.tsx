import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, ApiError } from './api'

export interface AiStatus {
  provider: 'claude' | 'ollama'
  ready: boolean
  textModel: string | null
  visionModel: string | null
  problem: string | null
}

interface AppStatus {
  ai: AiStatus | null
  publicUrl: string | null
  needsPasscode: boolean
  refresh: () => Promise<void>
}

const StatusContext = createContext<AppStatus | null>(null)

export function useAppStatus(): AppStatus {
  const ctx = useContext(StatusContext)
  if (!ctx) throw new Error('useAppStatus must be inside <StatusProvider>')
  return ctx
}

export function StatusProvider({ children }: { children: ReactNode }) {
  const [ai, setAi] = useState<AiStatus | null>(null)
  const [publicUrl, setPublicUrl] = useState<string | null>(null)
  const [needsPasscode, setNeedsPasscode] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const [health, settings] = await Promise.all([
        api.get<{ ai: AiStatus }>('health'),
        api.get<{ publicUrl: string | null }>('settings'),
      ])
      setAi(health.ai)
      setPublicUrl(settings.publicUrl)
      setNeedsPasscode(false)
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setNeedsPasscode(true)
    }
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 30_000) // picks up Ollama starting or the public link opening
    return () => clearInterval(id)
  }, [refresh])

  return <StatusContext.Provider value={{ ai, publicUrl, needsPasscode, refresh }}>{children}</StatusContext.Provider>
}

/** "Local AI" copy used on every AI button, so the wait time is never a surprise. */
export function aiWaitHint(ai: AiStatus | null, minutes: string): string {
  return ai?.provider === 'claude' ? 'Usually under a minute.' : `Local AI on your PC: about ${minutes}. You can switch pages; come back later.`
}
