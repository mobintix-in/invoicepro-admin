export const SUBSCRIPTION = {
  planMonths: 1,
} as const

export type SubscriptionStatus = 'none' | 'pending' | 'active' | 'rejected' | 'expired'
