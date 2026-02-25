import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * Supabase client — REALTIME ONLY.
 * All database, storage, and auth operations go through the backend proxy
 * (see apiClient_beach.js). This client exists solely for Realtime channel
 * subscriptions (postgres_changes) which require a direct WebSocket connection.
 */
export const supabase = (url && key) ? createClient(url, key, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  },
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  }
}) : null


