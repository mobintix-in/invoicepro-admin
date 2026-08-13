'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Layers3, MessageSquareText, Newspaper, UsersRound } from 'lucide-react'

const tabs = [
  { name: 'Users', href: '/', icon: UsersRound },
  { name: 'Blog', href: '/blog', icon: Newspaper },
  { name: 'Packages', href: '/packages', icon: Layers3 },
  { name: 'Messages', href: '/messages', icon: MessageSquareText },
]

export default function AdminTabs({ shell = false }: { shell?: boolean }) {
  const pathname = usePathname()

  if (!shell) return null

  function links(mobile = false) {
    return tabs.map((tab) => {
      const active = tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href)
      const Icon = tab.icon

      return (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={active ? 'page' : undefined}
          className={
            mobile
              ? `flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                }`
              : `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`
          }
        >
          <Icon
            aria-hidden="true"
            className={`h-[18px] w-[18px] ${active ? 'text-indigo-600' : 'text-gray-400 group-hover:text-gray-600'}`}
            strokeWidth={1.9}
          />
          {tab.name}
        </Link>
      )
    })
  }

  return (
    <>
      <aside className="fixed bottom-0 left-0 top-16 z-30 hidden w-64 flex-col border-r border-gray-200 bg-white lg:flex">
        <div className="flex-1 p-4">
          <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400">
            Management
          </p>
          <nav aria-label="Admin navigation" className="space-y-1">
            {links()}
          </nav>
        </div>
        <div className="border-t border-gray-100 p-4">
          <div className="rounded-xl bg-gray-50 px-3 py-3">
            <p className="text-xs font-semibold text-gray-700">Admin workspace</p>
            <p className="mt-0.5 text-[11px] leading-4 text-gray-400">
              Manage your InvoicePro application.
            </p>
          </div>
        </div>
      </aside>

      <nav
        aria-label="Admin navigation"
        className="sticky top-16 z-30 flex gap-1 overflow-x-auto border-b border-gray-200 bg-white px-3 py-2 lg:hidden"
      >
        {links(true)}
      </nav>
    </>
  )
}
