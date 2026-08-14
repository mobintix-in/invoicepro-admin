import { getLiveSnapshot } from '@/lib/live'
import LiveView from '@/components/LiveView'

// Always a fresh snapshot on load; the client polls every 10 s after that.
export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Live View – Admin',
  description: 'Real-time visitor activity on the storefront.',
}

export default async function LiveViewPage() {
  const snapshot = await getLiveSnapshot()
  return <LiveView initial={snapshot} />
}
