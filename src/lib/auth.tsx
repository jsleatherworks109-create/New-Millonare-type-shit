import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { api } from './api'
import { supabase } from './supabase'
import type { Plan } from './plans'

export interface AppUser {
  id: string
  email: string
  name?: string
  avatarUrl?: string
}

interface AuthContextValue {
  mode: 'live' | 'demo'
  loading: boolean
  user: AppUser | null
  /** Effective plan. Admins always get the top plan. */
  plan: Plan
  isAdmin: boolean
  signInWithGoogle: () => Promise<void>
  signInWithEmail: (email: string, password: string) => Promise<void>
  /** Resolves to a message to show the user (e.g. "check your inbox"). */
  signUpWithEmail: (email: string, password: string) => Promise<string | null>
  resetPassword: (email: string) => Promise<void>
  signOut: () => Promise<void>
  startCheckout: (plan: Exclude<Plan, 'free'>) => Promise<void>
  openBillingPortal: () => Promise<void>
  refreshPlan: () => Promise<Plan>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

export function AuthProvider({ children }: { children: ReactNode }) {
  return supabase ? <LiveAuthProvider>{children}</LiveAuthProvider> : <DemoAuthProvider>{children}</DemoAuthProvider>
}

/* ------------------------------------------------------------------ */
/* Live mode: Supabase auth; Stripe billing through /api               */
/* ------------------------------------------------------------------ */

function LiveAuthProvider({ children }: { children: ReactNode }) {
  const sb = supabase!
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<AppUser | null>(null)
  const [plan, setPlan] = useState<Plan>('free')
  const [isAdmin, setIsAdmin] = useState(false)

  const loadPlan = useCallback(
    async (userId: string): Promise<Plan> => {
      const { data } = await sb.from('profiles').select('plan, is_admin').eq('id', userId).maybeSingle()
      const admin = !!data?.is_admin
      const p: Plan = admin ? 'scale' : ((data?.plan as Plan | undefined) ?? 'free')
      setIsAdmin(admin)
      setPlan(p)
      return p
    },
    [sb],
  )

  useEffect(() => {
    let active = true
    const apply = async (session: Session | null) => {
      if (!active) return
      if (!session) {
        setUser(null)
        setPlan('free')
        setIsAdmin(false)
      } else {
        const u = session.user
        setUser({
          id: u.id,
          email: u.email ?? '',
          name: u.user_metadata?.full_name ?? u.user_metadata?.name,
          avatarUrl: u.user_metadata?.avatar_url,
        })
        await loadPlan(u.id)
      }
      if (active) setLoading(false)
    }
    sb.auth.getSession().then(({ data }) => apply(data.session))
    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      // Defer so we never call Supabase from inside its own auth callback.
      setTimeout(() => apply(session), 0)
    })
    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [sb, loadPlan])

  const value: AuthContextValue = {
    mode: 'live',
    loading,
    user,
    plan,
    isAdmin,
    async signInWithGoogle() {
      const { error } = await sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/app` },
      })
      if (error) throw error
    },
    async signInWithEmail(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email, password })
      if (error) throw error
    },
    async signUpWithEmail(email, password) {
      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/app` },
      })
      if (error) throw error
      return data.session ? null : 'Check your inbox to confirm your email, then sign in.'
    },
    async resetPassword(email) {
      const { error } = await sb.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/login`,
      })
      if (error) throw error
    },
    async signOut() {
      await sb.auth.signOut()
    },
    async startCheckout(target) {
      const { url } = await api.post<{ url: string }>('checkout', { plan: target })
      window.location.assign(url)
    },
    async openBillingPortal() {
      const { url } = await api.post<{ url: string }>('portal', {})
      window.location.assign(url)
    },
    async refreshPlan() {
      return user ? loadPlan(user.id) : 'free'
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/* ------------------------------------------------------------------ */
/* Demo mode: no keys configured. Everything lives in this browser.    */
/* ------------------------------------------------------------------ */

const DEMO_KEY = 'selamont-demo'
/** In demo mode this email signs in as an admin. Real admin rights come from the database (see README). */
const DEMO_ADMIN_EMAIL = 'adminpod@admin.com'

interface DemoState {
  user: AppUser | null
  plan: Plan
}

function readDemo(): DemoState {
  try {
    const raw = localStorage.getItem(DEMO_KEY)
    if (raw) return JSON.parse(raw) as DemoState
  } catch {
    // Storage blocked or corrupt: start signed out.
  }
  return { user: null, plan: 'free' }
}

function writeDemo(state: DemoState) {
  try {
    localStorage.setItem(DEMO_KEY, JSON.stringify(state))
  } catch {
    // Storage blocked: demo state just won't survive a reload.
  }
}

function DemoAuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DemoState>(readDemo)
  const isAdmin = state.user?.email.toLowerCase() === DEMO_ADMIN_EMAIL

  const update = (next: DemoState) => {
    setState(next)
    writeDemo(next)
  }

  const signIn = (email: string, name?: string) =>
    update({ user: { id: `demo-${email}`, email, name }, plan: state.user?.email === email ? state.plan : 'free' })

  const value: AuthContextValue = {
    mode: 'demo',
    loading: false,
    user: state.user,
    plan: isAdmin ? 'scale' : state.plan,
    isAdmin,
    async signInWithGoogle() {
      signIn('demo.founder@gmail.com', 'Demo Founder')
    },
    async signInWithEmail(email, password) {
      if (password.length < 8) throw new Error('Password must be at least 8 characters.')
      signIn(email)
    },
    async signUpWithEmail(email, password) {
      if (password.length < 8) throw new Error('Password must be at least 8 characters.')
      signIn(email)
      return null
    },
    async resetPassword() {},
    async signOut() {
      update({ user: null, plan: 'free' })
    },
    async startCheckout(target) {
      // Stand-in for Stripe Checkout: go straight to the success page.
      update({ ...state, plan: target })
      window.location.assign('/app/billing?checkout=success')
    },
    async openBillingPortal() {
      update({ ...state, plan: 'free' })
    },
    async refreshPlan() {
      return state.plan
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
