import { createClient } from '@/lib/supabase/client'
import { SUBSCRIPTION, type Subscription, type SubscriptionStatus } from '@/lib/subscription'

type SubRow = {
  user_id: string
  status: string
  utr: string | null
  amount: number | null
  plan_months: number
  plan_key?: string | null
  submitted_at: string | null
  activated_at: string | null
  expires_at: string | null
  updated_at: string | null
}

function fromRow(row: SubRow): Subscription {
  return {
    userId: row.user_id,
    status: row.status as SubscriptionStatus,
    utr: row.utr,
    amount: row.amount === null ? null : Number(row.amount),
    planMonths: row.plan_months,
    planKey: row.plan_key ?? null,
    submittedAt: row.submitted_at,
    activatedAt: row.activated_at,
    expiresAt: row.expires_at,
    updatedAt: row.updated_at,
  }
}

/** Access flags for the current user, computed server-side via the my_access() RPC. */
export async function getMyAccess(): Promise<{ isAdmin: boolean; isActive: boolean }> {
  const { data, error } = await createClient().rpc('my_access').single<{ is_admin: boolean; is_active: boolean }>()
  if (error) throw error
  if (!data) throw new Error('Access status is unavailable')
  return { isAdmin: !!data.is_admin, isActive: !!data.is_active }
}

/** The current user's subscription row, or null if they've never submitted one. */
export async function getMySubscription(): Promise<Subscription | null> {
  const { data: userData, error: authError } = await createClient().auth.getUser()
  if (authError) throw authError
  const uid = userData.user?.id
  if (!uid) return null
  const { data, error } = await createClient()
    .from('subscriptions')
    .select('*')
    .eq('user_id', uid)
    .maybeSingle()
  if (error) throw error
  return data ? fromRow(data as SubRow) : null
}

// ── Profile ──────────────────────────────────────────────────────────────────

export interface ProfileInput {
  fullName: string
  phone: string
  companyName: string
  address: string
  gstin: string
  stateName: string
  stateCode: string
  pan: string
  bankAccountName: string
  bankName: string
  accountNumber: string
  ifscCode: string
  bankBranch: string
  jurisdiction: string
  defaultInvoiceNotes: string
}

export interface Profile extends ProfileInput {
  id: string
  email: string
  createdAt: string | null
}

type ProfileRow = {
  id: string
  full_name: string
  phone: string
  company_name: string
  email: string
  created_at: string | null
  address: string
  gstin: string
  state_name: string
  state_code: string
  pan: string
  bank_account_name: string
  bank_name: string
  account_number: string
  ifsc_code: string
  bank_branch: string
  jurisdiction: string
  default_invoice_notes: string
}

const PROFILE_COLUMNS =
  'id, full_name, phone, company_name, email, created_at, address, gstin, state_name, state_code, pan, bank_account_name, bank_name, account_number, ifsc_code, bank_branch, jurisdiction, default_invoice_notes'

export async function getMyProfile(): Promise<Profile | null> {
  const supabase = createClient()
  const { data: userData } = await supabase.auth.getUser()
  const user = userData.user
  if (!user) return null

  const { data: profileData, error } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('id', user.id)
    .maybeSingle()
  let data = profileData

  if ((error || !data) && user) {
    const fullName =
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      ''
    const phone = user.user_metadata?.phone || ''
    const companyName = user.user_metadata?.company_name || ''

    const { data: createdData, error: createError } = await supabase
      .from('profiles')
      .upsert(
        {
          id: user.id,
          email: user.email ?? '',
          full_name: fullName,
          phone: phone,
          company_name: companyName,
        },
        { onConflict: 'id' }
      )
      .select(PROFILE_COLUMNS)
      .maybeSingle()

    if (createError) throw createError
    data = createdData
  }

  if (error && !data) throw error
  if (!data) return null
  const row = data as ProfileRow
  return {
    id: row.id,
    fullName: row.full_name,
    phone: row.phone,
    companyName: row.company_name,
    email: row.email,
    createdAt: row.created_at,
    address: row.address ?? '',
    gstin: row.gstin ?? '',
    stateName: row.state_name ?? '',
    stateCode: row.state_code ?? '',
    pan: row.pan ?? '',
    bankAccountName: row.bank_account_name ?? '',
    bankName: row.bank_name ?? '',
    accountNumber: row.account_number ?? '',
    ifscCode: row.ifsc_code ?? '',
    bankBranch: row.bank_branch ?? '',
    jurisdiction: row.jurisdiction ?? '',
    defaultInvoiceNotes: row.default_invoice_notes ?? '',
  }
}

// ── Admin ───────────────────────────────────────────────────────────────────

export interface PendingSubscription extends Subscription {
  profile: { fullName: string; companyName: string; email: string; phone: string } | null
}

export async function listPendingSubscriptions(): Promise<PendingSubscription[]> {
  const { data, error } = await createClient()
    .from('subscriptions')
    .select('*, profiles(full_name, company_name, email, phone)')
    .eq('status', 'pending')
    .order('submitted_at', { ascending: true })
  if (error) throw error
  if (!data) return []
  return (data as (SubRow & { profiles: { full_name: string; company_name: string; email: string; phone: string } | null })[]).map(row => ({
    ...fromRow(row),
    profile: row.profiles
      ? {
          fullName: row.profiles.full_name,
          companyName: row.profiles.company_name,
          email: row.profiles.email,
          phone: row.profiles.phone,
        }
      : null,
  }))
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

export async function approveSubscription(userId: string, planMonths = SUBSCRIPTION.planMonths): Promise<void> {
  const now = new Date()
  const expires = addMonthsClamped(now, planMonths)
  const { error } = await createClient()
    .from('subscriptions')
    .update({
      status: 'active',
      activated_at: now.toISOString(),
      expires_at: expires.toISOString(),
      plan_months: planMonths,
      updated_at: now.toISOString(),
    })
    .eq('user_id', userId)
  if (error) throw error
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
  createdAt: string | null
  status: SubscriptionStatus | 'none'
  utr: string | null
  amount: number | null
  planKey: string | null
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

/** Every registered user with their (optional) subscription — admins only, via RLS. */
export async function listAllUsers(): Promise<UserRow[]> {
  const { data, error } = await createClient()
    .from('profiles')
    .select('id, full_name, company_name, email, phone, created_at, subscriptions(status, utr, amount, plan_key, submitted_at, expires_at)')
    .order('created_at', { ascending: false })
  if (error) throw error
  if (!data) return []
  return (data as ProfileWithSub[]).map((row) => {
    const sub = Array.isArray(row.subscriptions) ? row.subscriptions[0] : row.subscriptions
    return {
      userId: row.id,
      fullName: row.full_name,
      companyName: row.company_name,
      email: row.email,
      phone: row.phone,
      createdAt: row.created_at,
      status: (sub?.status as SubscriptionStatus | undefined) ?? 'none',
      utr: sub?.utr ?? null,
      amount: sub?.amount != null ? Number(sub.amount) : null,
      planKey: sub?.plan_key ?? null,
      submittedAt: sub?.submitted_at ?? null,
      expiresAt: sub?.expires_at ?? null,
    }
  })
}

/** Grant/renew an active subscription for a user (works even if they have no row yet). */
export async function grantSubscription(
  userId: string,
  planMonths = SUBSCRIPTION.planMonths,
  planKey = 'starter',
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
