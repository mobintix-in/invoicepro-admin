'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { isSupabaseConfigured } from '@/lib/supabase/client'
import { getMyAccess } from '@/lib/account'
import {
  listContactMessages,
  setMessageHandled,
  deleteContactMessage,
  type ContactMessage,
} from '@/lib/contact'

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(iso),
  )
}

export default function AdminMessagesPage() {
  const router = useRouter()
  const [checking, setChecking] = useState(isSupabaseConfigured())
  const [isAdmin, setIsAdmin] = useState(false)
  const [messages, setMessages] = useState<ContactMessage[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setMessages(await listContactMessages())
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured()) return
    getMyAccess().then(async ({ isAdmin }) => {
      if (!isAdmin) {
        router.replace('/login')
        return
      }
      setIsAdmin(true)
      try {
        await load()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load messages')
      }
      setChecking(false)
    }).catch(() => router.replace('/login'))
  }, [router, load])

  async function toggleHandled(m: ContactMessage) {
    setBusyId(m.id)
    try {
      await setMessageHandled(m.id, !m.handled)
      await load()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setBusyId(null)
    }
  }

  async function remove(m: ContactMessage) {
    if (!confirm(`Delete the message from ${m.name || m.email || 'this visitor'}?`)) return
    setBusyId(m.id)
    try {
      await deleteContactMessage(m.id)
      await load()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setBusyId(null)
    }
  }

  if (checking) {
    return (
      <main className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
      </main>
    )
  }

  if (!isAdmin) return null

  const newCount = messages.filter((m) => !m.handled).length

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Messages</h1>
          <p className="mt-1 text-sm text-gray-500">
            {messages.length} total · {newCount} new
          </p>
        </div>
        <button
          onClick={load}
          className="rounded-lg border border-gray-300 px-3.5 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
        >
          Refresh
        </button>
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-600">{error}</p>
      )}

      {messages.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white py-16 text-center text-sm text-gray-500">
          No messages yet. Submissions from the “Talk to us” form will appear here.
        </div>
      ) : (
        <div className="space-y-3">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`rounded-2xl border bg-white p-5 shadow-sm ${
                m.handled ? 'border-gray-200' : 'border-indigo-200'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900">{m.name || '(no name)'}</span>
                    {!m.handled && (
                      <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                        New
                      </span>
                    )}
                  </div>
                  {m.email && (
                    <a
                      href={`mailto:${m.email}`}
                      className="text-sm text-indigo-600 hover:text-indigo-700"
                    >
                      {m.email}
                    </a>
                  )}
                </div>
                <span className="shrink-0 text-xs text-gray-400">{formatDateTime(m.createdAt)}</span>
              </div>

              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
                {m.message}
              </p>

              <div className="mt-4 flex justify-end gap-2">
                <button
                  onClick={() => toggleHandled(m)}
                  disabled={busyId === m.id}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
                >
                  {m.handled ? 'Mark as new' : 'Mark as handled'}
                </button>
                <button
                  onClick={() => remove(m)}
                  disabled={busyId === m.id}
                  className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
