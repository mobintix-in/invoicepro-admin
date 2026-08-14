'use server'

import { getLiveSnapshot } from '@/lib/live'
import type { LiveSnapshot } from '@/lib/live'

/**
 * Server Action called by the client every POLL_MS milliseconds.
 * Runs the same query as the initial server render, so the admin
 * always sees fresh data without a full page reload.
 */
export async function refreshLiveSnapshot(): Promise<LiveSnapshot> {
  return getLiveSnapshot()
}
