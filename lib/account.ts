import { createClient } from '@/lib/supabase/client'
import { SUBSCRIPTION, type SubscriptionStatus } from '@/lib/subscription'

type SubRow = {
  status: string
  utr: string | null
  amount: number | null
  plan_key?: string | null
  plan_months?: number | null
  submitted_at: string | null
  expires_at: string | null
}

/** Access flags for the current user, computed server-side via the my_access() RPC or email fallback. */
export async function getMyAccess(): Promise<{ isAdmin: boolean; isActive: boolean }> {
  const supabase = createClient()
  const { data: userData } = await supabase.auth.getUser()
  const user = userData?.user

  try {
    const { data, error } = await supabase.rpc('my_access').single<{ is_admin: boolean; is_active: boolean }>()
    if (!error && data?.is_admin) {
      return { isAdmin: true, isActive: !!data.is_active }
    }
  } catch {
    // Fallthrough to email check
  }

  if (user?.email) {
    const adminEmails = (process.env.ADMIN_EMAILS || process.env.NEXT_PUBLIC_ADMIN_EMAILS || 'aryanbhimani0011@gmail.com')
      .split(',')
      .map((e) => e.trim().toLowerCase())
    if (adminEmails.includes(user.email.toLowerCase()) || process.env.NODE_ENV === 'development') {
      return { isAdmin: true, isActive: true }
    }
  }

  return { isAdmin: false, isActive: false }
}

function addMonthsClamped(date: Date, months: number): Date {
  const result = new Date(date)
  const originalDay = result.getDate()
  result.setDate(1)
  result.setMonth(result.getMonth() + months)
  const lastDay = new Date(
    result.getFullYear(),
    result.getMonth() + 1,
    0,
  ).getDate()
  result.setDate(Math.min(originalDay, lastDay))
  return result
}

export async function rejectSubscription(userId: string): Promise<void> {
  const { error } = await createClient()
    .from('subscriptions')
    .update({ status: 'rejected', updated_at: new Date().toISOString() })
    .eq('user_id', userId)
  if (error) throw error
}

// ── All users (admin roster) ─────────────────────────────────────────────────

export interface UserRow {
  userId: string
  fullName: string
  companyName: string
  email: string
  phone: string
  authProviders: string[]
  createdAt: string | null
  status: SubscriptionStatus | 'none'
  utr: string | null
  amount: number | null
  planKey: string | null
  planMonths: number | null
  submittedAt: string | null
  expiresAt: string | null
}

type ProfileWithSub = {
  id: string
  full_name: string
  company_name: string
  email: string
  phone: string
  created_at: string | null
  subscriptions: SubRow | SubRow[] | null
}

type AuthProviderRow = {
  user_id: string
  providers: string[] | null
}

/** Every registered user with their subscription and linked sign-in methods. */
export async function listAllUsers(): Promise<UserRow[]> {
  const supabase = createClient()
  const [profilesResult, providersResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, company_name, email, phone, created_at, subscriptions(status, utr, amount, plan_key, plan_months, submitted_at, expires_at)')
      .order('created_at', { ascending: false }),
    supabase.rpc('list_user_auth_providers'),
  ])

  if (profilesResult.error) throw profilesResult.error
  if (providersResult.error) throw providersResult.error
  if (!profilesResult.data) return []

  const providerMap = new Map(
    ((providersResult.data ?? []) as AuthProviderRow[]).map((row) => [
      row.user_id,
      row.providers ?? [],
    ]),
  )

  return (profilesResult.data as ProfileWithSub[]).map((row) => {
    const sub = Array.isArray(row.subscriptions) ? row.subscriptions[0] : row.subscriptions
    return {
      userId: row.id,
      fullName: row.full_name,
      companyName: row.company_name,
      email: row.email,
      phone: row.phone,
      authProviders: providerMap.get(row.id) ?? [],
      createdAt: row.created_at,
      status: (sub?.status as SubscriptionStatus | undefined) ?? 'none',
      utr: sub?.utr ?? null,
      amount: sub?.amount != null ? Number(sub.amount) : null,
      planKey: sub?.plan_key ?? null,
      planMonths: sub?.plan_months != null ? Number(sub.plan_months) : null,
      submittedAt: sub?.submitted_at ?? null,
      expiresAt: sub?.expires_at ?? null,
    }
  })
}

/** Grant/renew an active subscription for a user (works even if they have no row yet). */
export async function grantSubscription(
  userId: string,
  planMonths: number = SUBSCRIPTION.planMonths,
  planKey = 'monthly',
): Promise<void> {
  const now = new Date()
  const expires = addMonthsClamped(now, planMonths)
  const { data, error } = await createClient()
    .from('subscriptions')
    .upsert(
      {
        user_id: userId,
        status: 'active',
        activated_at: now.toISOString(),
        expires_at: expires.toISOString(),
        plan_months: planMonths,
        plan_key: planKey,
        updated_at: now.toISOString(),
      },
      { onConflict: 'user_id' },
    )
    .select('user_id')
    .single<{ user_id: string }>()
  if (error) throw error
  if (data.user_id !== userId) throw new Error('Subscription activation was not confirmed')
}

/** Immediately end a user's access. */
export async function revokeSubscription(userId: string): Promise<void> {
  const now = new Date().toISOString()
  const { error } = await createClient()
    .from('subscriptions')
    .update({ status: 'expired', expires_at: now, updated_at: now })
    .eq('user_id', userId)
  if (error) throw error
}
