'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'

export default function AdminNavbar() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    if (!isSupabaseConfigured()) return
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null))

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function handleSignOut() {
    if (isSupabaseConfigured()) {
      await createClient().auth.signOut({ scope: 'local' })
    }
    router.push('/login')
    router.refresh()
  }

  return (
    <header className="sticky top-0 z-40 h-16 border-b border-gray-200 bg-white">
      <div className="flex h-full items-center">
        <div className="flex h-full shrink-0 items-center px-4 sm:px-6 lg:w-64 lg:border-r lg:border-gray-200">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600 font-bold text-white shadow-sm">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
            </span>
            <div className="min-w-0 leading-none">
              <span className="block whitespace-nowrap text-base font-bold text-gray-900">
                InvoicePro
              </span>
              <span className="mt-1 block whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.12em] text-indigo-600">
                Admin Console
              </span>
            </div>
          </Link>
        </div>

        {user && (
          <div className="ml-auto flex min-w-0 items-center gap-3 px-4 sm:gap-4 sm:px-6 lg:px-8">
            <span className="hidden truncate text-xs font-medium text-gray-500 sm:inline-block">
              {user.email}
            </span>
            <button
              onClick={handleSignOut}
              className="shrink-0 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
