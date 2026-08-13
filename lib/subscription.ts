export const SUBSCRIPTION = {
  upiId: '9408962204@kotakbank',
  payeeName: 'InvoicePro',
  priceInr: 299,
  planMonths: 1,
} as const

export function upiPaymentUri(
  amount: number = SUBSCRIPTION.priceInr,
  note = 'InvoicePro Monthly Subscription',
): string {
  const params = new URLSearchParams({
    pa: SUBSCRIPTION.upiId,
    pn: SUBSCRIPTION.payeeName,
    am: String(amount),
    cu: 'INR',
    tn: note,
  })
  return `upi://pay?${params.toString()}`
}

export type SubscriptionStatus = 'none' | 'pending' | 'active' | 'rejected' | 'expired'

export interface Subscription {
  userId: string
  status: SubscriptionStatus
  utr: string | null
  amount: number | null
  planMonths: number
  planKey: string | null
  submittedAt: string | null
  activatedAt: string | null
  expiresAt: string | null
  updatedAt: string | null
}

export function isSubscriptionActive(sub: Pick<Subscription, 'status' | 'expiresAt'> | null): boolean {
  if (!sub || sub.status !== 'active' || !sub.expiresAt) return false
  return new Date(sub.expiresAt).getTime() > Date.now()
}
