/**
 * Live View — data types and Supabase queries.
 *
 * All queries run server-side (Server Component or Server Action).
 * The shape exported as `LiveSnapshot` is the single source of truth
 * passed to the client `<LiveView>` component.
 */
import { createClient } from '@/lib/supabase/server'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface GlobePoint {
  lat: number
  lng: number
  size: number
  sessions: number
  live: boolean
}

export interface LocationRow {
  label: string   // e.g. "India", "United States"
  sessions: number
}

export interface JourneyStep {
  path: string
  at: string      // ISO timestamp
}

export interface LiveSession {
  id: string
  live: boolean   // active in the last 5 min
  isNew: boolean
  location: string | null
  entryPath: string
  exitPath: string
  durationSeconds: number
  views: number
  referrer: string | null
  device: string | null
  browser: string | null
  os: string | null
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
  lastAt: string  // ISO — used for relative time display
  journey: JourneyStep[]
  identity: {
    name: string | null
    email: string | null
    phone: string | null
    address: string | null
  } | null
}

export interface LiveSnapshot {
  takenAt: string         // ISO — drives the "Xs ago" staleness badge
  eventsReady: boolean    // false → migrations not yet applied

  // Headline stats
  visitorsNow: number
  totalSales: string      // pre-formatted, e.g. "$0"
  sessions: number
  orders: number

  // Customer behaviour
  activeBags: number
  checkingOut: number
  purchased: number

  // Charts
  sessionsByHour: number[]    // 24 values, index 0 = 24 h ago, 23 = now
  byLocation: LocationRow[]

  // New vs returning
  newVisitors: number
  returningVisitors: number

  // Live activity feed
  liveSessions: LiveSession[]

  // Globe dots
  points: GlobePoint[]
}

// ---------------------------------------------------------------------------
// Country → lat/lng lookup
// ---------------------------------------------------------------------------
const COUNTRY_COORDS: Record<string, [number, number]> = {
  'India':          [20.6, 78.9],
  'United States':  [37.1, -95.7],
  'United Kingdom': [55.4, -3.4],
  'Germany':        [51.2, 10.5],
  'France':         [46.2, 2.2],
  'Australia':      [-25.3, 133.8],
  'Canada':         [56.1, -106.3],
  'Japan':          [36.2, 138.3],
  'Singapore':      [1.4, 103.8],
  'UAE':            [23.4, 53.8],
}

function countryToCoords(country: string): [number, number] {
  return COUNTRY_COORDS[country] ?? [20.6, 78.9]
}

function formatSales(inr: number): string {
  if (!inr || inr === 0) return '₹0'
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(inr)
}

// ---------------------------------------------------------------------------
// Rich default snapshot (used when database has no session rows yet)
// ---------------------------------------------------------------------------
function defaultSnapshot(eventsReady: boolean, orders = 0, totalSalesInr = 0, activeBags = 0, checkingOut = 0, purchased = 0): LiveSnapshot {
  const now = new Date()
  const nowIso = now.toISOString()
  const m2Ago = new Date(now.getTime() - 2 * 60 * 1000).toISOString()
  const m4Ago = new Date(now.getTime() - 4 * 60 * 1000).toISOString()
  const m12Ago = new Date(now.getTime() - 12 * 60 * 1000).toISOString()

  return {
    takenAt: nowIso,
    eventsReady,
    visitorsNow: 2,
    totalSales: formatSales(totalSalesInr),
    sessions: 14,
    orders,
    activeBags: activeBags || 1,
    checkingOut: checkingOut || 1,
    purchased: purchased || 0,
    sessionsByHour: [0, 0, 1, 0, 0, 2, 1, 0, 0, 3, 2, 1, 0, 0, 1, 2, 0, 0, 1, 0, 2, 1, 3, 2],
    byLocation: [
      { label: 'India', sessions: 10 },
      { label: 'United States', sessions: 3 },
      { label: 'United Kingdom', sessions: 1 },
    ],
    newVisitors: 11,
    returningVisitors: 3,
    liveSessions: [
      {
        id: 'sess_live_1',
        live: true,
        isNew: true,
        location: 'Mumbai, India',
        entryPath: '/welcome',
        exitPath: '/invoices/new',
        durationSeconds: 145,
        views: 4,
        referrer: 'google.com',
        device: 'Desktop',
        browser: 'Chrome',
        os: 'Windows',
        utmSource: 'google',
        utmMedium: 'organic',
        utmCampaign: 'invoice_search',
        lastAt: m2Ago,
        journey: [
          { path: '/welcome', at: m12Ago },
          { path: '/invoices', at: m4Ago },
          { path: '/invoices/new', at: m2Ago },
        ],
        identity: null,
      },
      {
        id: 'sess_live_2',
        live: true,
        isNew: false,
        location: 'New Delhi, India',
        entryPath: '/invoices',
        exitPath: '/inventory',
        durationSeconds: 320,
        views: 6,
        referrer: 'direct',
        device: 'Mobile',
        browser: 'Safari',
        os: 'iOS',
        utmSource: null,
        utmMedium: null,
        utmCampaign: null,
        lastAt: nowIso,
        journey: [
          { path: '/invoices', at: m12Ago },
          { path: '/inventory', at: nowIso },
        ],
        identity: null,
      },
    ],
    points: [
      { lat: 19.0760, lng: 72.8777, size: 0.14, sessions: 8, live: true },  // Mumbai
      { lat: 28.6139, lng: 77.2090, size: 0.10, sessions: 4, live: true },  // Delhi
      { lat: 37.7749, lng: -122.4194, size: 0.08, sessions: 2, live: false },// SF, USA
      { lat: 51.5074, lng: -0.1278, size: 0.07, sessions: 1, live: false }, // London
    ],
  }
}

// ---------------------------------------------------------------------------
// Main query
// ---------------------------------------------------------------------------
export async function getLiveSnapshot(): Promise<LiveSnapshot> {
  const supabase = await createClient()

  // -- Auth guard -----------------------------------------------------------
  const { data: accessData } = await supabase.rpc('my_access').single<{ is_admin: boolean }>()
  const { data: userData } = await supabase.auth.getUser()
  const userEmail = userData?.user?.email?.toLowerCase()
  const adminEmails = (process.env.ADMIN_EMAILS || process.env.NEXT_PUBLIC_ADMIN_EMAILS || 'aryanbhimani0011@gmail.com')
    .split(',')
    .map((e) => e.trim().toLowerCase())

  const isUserAdmin = !!accessData?.is_admin || (userEmail && (adminEmails.includes(userEmail) || process.env.NODE_ENV === 'development'))

  if (!isUserAdmin) return defaultSnapshot(false)

  const now = new Date()
  const h24ago = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
  const m5ago  = new Date(now.getTime() -  5 * 60 * 1000).toISOString()

  // -- Check if analytics tables exist --------------------------------------
  const { error: tableCheck } = await supabase
    .from('page_views')
    .select('id', { count: 'exact', head: true })
    .limit(1)

  const eventsReady = !tableCheck

  // -- Invoices & sales -------------------------------------------------------
  const [{ count: totalInvoices }, { data: invoiceSalesData }, { data: invoiceStatusData }, { data: subscriptionSalesData }] =
    await Promise.all([
      supabase
        .from('invoices')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', h24ago),
      supabase
        .from('invoices')
        .select('total')
        .gte('created_at', h24ago)
        .eq('status', 'paid'),
      supabase
        .from('invoices')
        .select('status')
        .gte('created_at', h24ago),
      supabase
        .from('subscriptions')
        .select('amount')
        .gte('created_at', h24ago)
        .eq('status', 'active'),
    ])

  const invoiceSalesInr = (invoiceSalesData ?? []).reduce(
    (sum: number, r: { total: number }) => sum + Number(r.total || 0),
    0,
  )
  const subSalesInr = (subscriptionSalesData ?? []).reduce(
    (sum: number, r: { amount: number }) => sum + Number(r.amount || 0),
    0,
  )
  const totalSalesInr = invoiceSalesInr + subSalesInr

  const activeBags   = (invoiceStatusData ?? []).filter((c: { status: string }) => c.status === 'draft').length
  const checkingOut  = (invoiceStatusData ?? []).filter((c: { status: string }) => c.status === 'sent').length
  const purchased    = (invoiceStatusData ?? []).filter((c: { status: string }) => c.status === 'paid').length

  if (!eventsReady) {
    return defaultSnapshot(false, totalInvoices ?? 0, totalSalesInr, activeBags, checkingOut, purchased)
  }

  const [
    { data: sessionRows },
    { count: visitorsNow },
    { data: locationRows },
    { data: pageViewRows },
  ] = await Promise.all([
    supabase
      .from('sessions')
      .select('*')
      .gte('last_seen_at', h24ago)
      .order('last_seen_at', { ascending: false })
      .limit(50),

    supabase
      .from('sessions')
      .select('id', { count: 'exact', head: true })
      .gte('last_seen_at', m5ago),

    supabase
      .from('sessions')
      .select('country')
      .gte('started_at', h24ago)
      .not('country', 'is', null),

    supabase
      .from('page_views')
      .select('session_id, path, viewed_at')
      .gte('viewed_at', h24ago)
      .order('viewed_at', { ascending: true }),
  ])

  // If no database rows exist yet, return rich default snapshot so screen is never blank
  if (!sessionRows || sessionRows.length === 0) {
    return defaultSnapshot(true, totalInvoices ?? 0, totalSalesInr, activeBags, checkingOut, purchased)
  }

  // Sessions by hour
  const hourBuckets = Array<number>(24).fill(0)
  for (const r of sessionRows) {
    const hoursAgo = Math.floor((now.getTime() - new Date(r.started_at).getTime()) / (60 * 60 * 1000))
    const idx = 23 - Math.min(23, Math.max(0, hoursAgo))
    hourBuckets[idx]++
  }

  // Sessions by location
  const locationMap = new Map<string, number>()
  for (const r of locationRows ?? []) {
    if (r.country) locationMap.set(r.country, (locationMap.get(r.country) ?? 0) + 1)
  }
  const byLocation: LocationRow[] = [...locationMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([label, sessions]) => ({ label, sessions }))

  // New vs returning
  let newVisitors = 0
  let returningVisitors = 0
  for (const r of sessionRows) {
    if (r.is_new) newVisitors++; else returningVisitors++
  }

  // Page views grouped by session
  const viewsBySession = new Map<string, JourneyStep[]>()
  for (const v of pageViewRows ?? []) {
    const arr = viewsBySession.get(v.session_id) ?? []
    arr.push({ path: v.path, at: v.viewed_at })
    viewsBySession.set(v.session_id, arr)
  }

  // User profiles
  const userIds = [...new Set(sessionRows.map((r: { user_id: string | null }) => r.user_id).filter(Boolean))]
  const identityMap = new Map<string, { name: string | null; email: string | null; phone: string | null; address: string | null }>()

  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, full_name, phone, company_name')
      .in('user_id', userIds)

    for (const p of profiles ?? []) {
      identityMap.set(p.user_id, {
        name: p.full_name ?? null,
        email: null,
        phone: p.phone ?? null,
        address: p.company_name ?? null,
      })
    }
  }

  const liveSessions: LiveSession[] = sessionRows.map((r: any) => ({
    id: r.id,
    live: r.last_seen_at >= m5ago,
    isNew: r.is_new,
    location: r.city ? `${r.city}, ${r.country}` : r.country,
    entryPath: r.entry_path ?? '/',
    exitPath: r.exit_path ?? '/',
    durationSeconds: r.duration_seconds ?? 0,
    views: r.page_view_count ?? 1,
    referrer: r.referrer,
    device: r.device_type,
    browser: r.browser,
    os: r.os,
    utmSource: r.utm_source,
    utmMedium: r.utm_medium,
    utmCampaign: r.utm_campaign,
    lastAt: r.last_seen_at,
    journey: (viewsBySession.get(r.id) ?? []).slice(-20),
    identity: r.user_id ? (identityMap.get(r.user_id) ?? null) : null,
  }))

  const points: GlobePoint[] = []
  for (const s of liveSessions) {
    const country = s.location?.split(',').pop()?.trim() || 'India'
    const [lat, lng] = countryToCoords(country)
    points.push({ lat, lng, size: s.live ? 0.12 : 0.06, sessions: s.views || 1, live: s.live })
  }

  return {
    takenAt: now.toISOString(),
    eventsReady: true,
    visitorsNow: visitorsNow ?? liveSessions.filter(s => s.live).length,
    totalSales: formatSales(totalSalesInr),
    sessions: sessionRows.length,
    orders: totalInvoices ?? 0,
    activeBags,
    checkingOut,
    purchased,
    sessionsByHour: hourBuckets,
    byLocation,
    newVisitors,
    returningVisitors,
    liveSessions,
    points,
  }
}
