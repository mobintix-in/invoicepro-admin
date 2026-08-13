'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { isSupabaseConfigured } from '@/lib/supabase/client'
import {
  getMyAccess,
  listAllUsers,
  grantSubscription,
  rejectSubscription,
  revokeSubscription,
  type UserRow,
} from '@/lib/account'

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(iso))
}

const STATUS_STYLES: Record<UserRow['status'], string> = {
  active: 'bg-green-100 text-green-700',
  pending: 'bg-amber-100 text-amber-700',
  rejected: 'bg-red-100 text-red-700',
  expired: 'bg-gray-200 text-gray-600',
  none: 'bg-gray-100 text-gray-500',
}

const STATUS_LABELS: Record<UserRow['status'], string> = {
  active: 'Active',
  pending: 'Pending',
  rejected: 'Rejected',
  expired: 'Expired',
  none: 'No plan',
}

function StatusPill({ status }: { status: UserRow['status'] }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  )
}

function actionErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String(error.message)
    if (message.includes('permission denied') || message.includes('42501')) {
      return 'Activation is blocked by database permissions. Apply the latest Supabase migration.'
    }
    return message
  }
  return 'Subscription action failed. Please try again.'
}

export default function AdminUsersPage() {
  const router = useRouter()
  const [checking, setChecking] = useState(isSupabaseConfigured())
  const [isAdmin, setIsAdmin] = useState(false)
  const [users, setUsers] = useState<UserRow[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setUsers(await listAllUsers())
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured()) return
    getMyAccess()
      .then(async ({ isAdmin }) => {
        if (!isAdmin) {
          router.replace('/login')
          return
        }
        setIsAdmin(true)
        await load()
      })
      .catch((error) => {
        setActionError(actionErrorMessage(error))
        router.replace('/login')
      })
      .finally(() => setChecking(false))
  }, [router, load])

  async function act(userId: string, action: 'grant' | 'reject' | 'revoke') {
    setBusyId(userId)
    setActionError(null)
    try {
      if (action === 'grant') await grantSubscription(userId)
      else if (action === 'reject') await rejectSubscription(userId)
      else await revokeSubscription(userId)
      await load()
    } catch (error) {
      setActionError(actionErrorMessage(error))
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

  const pendingCount = users.filter((u) => u.status === 'pending').length
  const activeCount = users.filter((u) => u.status === 'active').length
  const q = query.trim().toLowerCase()
  const filtered = q
    ? users.filter((u) =>
        [u.fullName, u.companyName, u.email, u.phone, u.utr ?? '']
          .some((v) => v.toLowerCase().includes(q)),
      )
    : users

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="mt-1 text-sm text-gray-500">
            {users.length} total · {activeCount} active · {pendingCount} pending review
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, company, email…"
            className="w-56 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
          />
          <button
            onClick={() => {
              setActionError(null)
              load().catch((error) => setActionError(actionErrorMessage(error)))
            }}
            className="rounded-lg border border-gray-300 px-3.5 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            Refresh
          </button>
        </div>
      </div>

      {actionError && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white py-16 text-center text-sm text-gray-500">
          {users.length === 0 ? 'No users yet.' : 'No users match your search.'}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">UTR / Ref</th>
                <th className="px-4 py-3">Expires</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((u) => (
                <tr key={u.userId} className="align-top">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{u.fullName || '—'}</div>
                    <div className="text-xs text-gray-500">{u.companyName || '—'}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-gray-700">{u.email || '—'}</div>
                    <div className="text-xs text-gray-500">{u.phone || '—'}</div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={u.status} />
                    {u.status === 'pending' && u.amount != null && (
                      <div className="mt-1 text-xs text-gray-500">₹{u.amount}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {u.planKey ? (
                      <span className="inline-flex rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold capitalize text-indigo-700">
                        {u.planKey}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {u.utr ? (
                      <>
                        <div className="font-mono text-xs text-gray-800">{u.utr}</div>
                        {u.status === 'pending' && u.submittedAt && (
                          <div className="mt-1 text-[11px] text-gray-400">
                            Received {formatDate(u.submittedAt)}
                          </div>
                        )}
                        {u.status !== 'pending' && (
                          <div className="mt-1 text-[11px] text-gray-400">Previous payment</div>
                        )}
                      </>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{formatDate(u.expiresAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      {u.status === 'pending' ? (
                        <>
                          <button
                            onClick={() => act(u.userId, 'grant')}
                            disabled={busyId === u.userId}
                            className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-green-700 disabled:opacity-50"
                          >
                            {busyId === u.userId ? 'Approving…' : 'Approve'}
                          </button>
                          <button
                            onClick={() => act(u.userId, 'reject')}
                            disabled={busyId === u.userId}
                            className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </>
                      ) : u.status === 'active' ? (
                        <button
                          onClick={() => act(u.userId, 'revoke')}
                          disabled={busyId === u.userId}
                          className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
                        >
                          {busyId === u.userId ? 'Revoking…' : 'Revoke'}
                        </button>
                      ) : (
                        <button
                          onClick={() => act(u.userId, 'grant')}
                          disabled={busyId === u.userId}
                          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
                        >
                          {busyId === u.userId ? 'Activating…' : 'Activate'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
