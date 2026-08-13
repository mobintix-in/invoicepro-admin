'use client'

import { usePathname } from 'next/navigation'
import AdminNavbar from '@/components/AdminNavbar'
import AdminTabs from '@/components/AdminTabs'

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isAuthPage = pathname === '/login' || pathname.startsWith('/auth/')

  if (isAuthPage) {
    return (
      <>
        <AdminNavbar />
        {children}
      </>
    )
  }

  return (
    <>
      <AdminNavbar />
      <AdminTabs shell />
      <div className="min-w-0 lg:pl-64">{children}</div>
    </>
  )
}
