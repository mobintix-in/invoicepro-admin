import { createBrowserClient } from '@supabase/ssr'
import { ADMIN_AUTH_COOKIE } from '@/lib/supabase/config'

export function isSupabaseConfigured() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  return (
    url &&
    key &&
    url.startsWith('http') &&
    !url.includes('your-supabase') &&
    !key.includes('your-supabase')
  )
}

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        name: ADMIN_AUTH_COOKIE,
      },
    },
  )
}
