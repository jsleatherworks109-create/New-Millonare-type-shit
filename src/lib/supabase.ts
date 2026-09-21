import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

// null means DEMO MODE: no keys configured, so auth and billing are simulated locally.
export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null
