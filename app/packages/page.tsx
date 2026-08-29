'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { isSupabaseConfigured } from '@/lib/supabase/client'
import { getMyAccess } from '@/lib/account'
import { formatLimit, formatDuration, formatBillingCycle, toPackageKey, type Package } from '@/lib/packages'
import {
  listAllPackagesAdmin,
  savePackage,
  deletePackage,
  type PackageInput,
} from '@/lib/packages-admin'

type FormState = {
  id?: string
  key: string
  name: string
  priceInr: string
  durationMonths: string
  tagline: string
  featuresText: string
  invoiceLimitText: string
  cta: string
  sortOrder: string
  highlighted: boolean
  active: boolean
}

const EMPTY_FORM: FormState = {
  id: undefined,
  key: '',
  name: '',
  priceInr: '0',
  durationMonths: '1',
  tagline: '',
  featuresText: '',
  invoiceLimitText: '',
  cta: 'Get started',
  sortOrder: '0',
  highlighted: false,
  active: true,
}

function toInput(f: FormState): PackageInput {
  const limit = f.invoiceLimitText.trim()
  return {
    id: f.id,
    key: f.key,
    name: f.name,
    priceInr: parseInt(f.priceInr, 10) || 0,
    durationMonths: Math.max(1, parseInt(f.durationMonths, 10) || 1),
    tagline: f.tagline,
    features: f.featuresText.split('\n').map((s) => s.trim()).filter(Boolean),
    invoiceLimit: limit === '' ? null : Math.max(0, parseInt(limit, 10) || 0),
    cta: f.cta,
    sortOrder: parseInt(f.sortOrder, 10) || 0,
    highlighted: f.highlighted,
    active: f.active,
  }
}

export default function AdminPackagesPage() {
  const router = useRouter()
  const [checking, setChecking] = useState(isSupabaseConfigured())
  const [isAdmin, setIsAdmin] = useState(false)
  const [packages, setPackages] = useState<Package[]>([])

  const [form, setForm] = useState<FormState | null>(null)
  const [keyEdited, setKeyEdited] = useState(false)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setPackages(await listAllPackagesAdmin())
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured()) return
    getMyAccess().then(async ({ isAdmin }) => {
      if (!isAdmin) {
        router.replace('/login')
        return
      }
      setIsAdmin(true)
      try {
        await load()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load packages')
      }
      setChecking(false)
    }).catch(() => router.replace('/login'))
  }, [router, load])

  function startNew() {
    setError(null)
    setKeyEdited(false)
    setForm({ ...EMPTY_FORM, durationMonths: '1', sortOrder: String(packages.length + 1) })
  }

  function startEdit(p: Package) {
    setError(null)
    setKeyEdited(true)
    setForm({
      id: p.id,
      key: p.key,
      name: p.name,
      priceInr: String(p.priceInr),
      durationMonths: String(p.durationMonths || 1),
      tagline: p.tagline,
      featuresText: p.features.join('\n'),
      invoiceLimitText: p.invoiceLimit === null ? '' : String(p.invoiceLimit),
      cta: p.cta,
      sortOrder: String(p.sortOrder),
      highlighted: p.highlighted,
      active: p.active,
    })
  }

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f))
  }

  function onNameChange(value: string) {
    setForm((f) => {
      if (!f) return f
      const next = { ...f, name: value }
      if (!keyEdited) next.key = toPackageKey(value)
      return next
    })
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!form) return
    if (!form.name.trim()) return setError('A name is required.')
    if (!form.key.trim()) return setError('A key is required.')
    setError(null)
    setSaving(true)
    try {
      await savePackage(toInput(form))
      await load()
      setForm(null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not save the package'
      setError(/duplicate|unique/i.test(msg) ? 'That key is already used by another package.' : msg)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(p: Package) {
    if (!confirm(`Delete the “${p.name}” package? This cannot be undone.`)) return
    setBusyId(p.id)
    try {
      await deletePackage(p.id)
      await load()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Delete failed')
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

  const inputClass =
    'mt-1.5 block w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20'

  if (form) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">
            {form.id ? 'Edit package' : 'New package'}
          </h1>
          <button
            onClick={() => setForm(null)}
            className="text-sm font-medium text-gray-500 transition hover:text-gray-800"
          >
            Cancel
          </button>
        </div>

        <form
          onSubmit={handleSave}
          className="space-y-5 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8"
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                Name
              </label>
              <input
                id="name"
                type="text"
                value={form.name}
                onChange={(e) => onNameChange(e.target.value)}
                placeholder="Business"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="key" className="block text-sm font-medium text-gray-700">
                Key
              </label>
              <input
                id="key"
                type="text"
                value={form.key}
                onChange={(e) => {
                  setKeyEdited(true)
                  update('key', toPackageKey(e.target.value))
                }}
                placeholder="business"
                className={`${inputClass} font-mono`}
              />
              <p className="mt-1 text-xs text-gray-400">Stable id used on subscriptions — avoid changing it later.</p>
            </div>
          </div>

          <div>
            <label htmlFor="tagline" className="block text-sm font-medium text-gray-700">
              Tagline
            </label>
            <input
              id="tagline"
              type="text"
              value={form.tagline}
              onChange={(e) => update('tagline', e.target.value)}
              placeholder="For growing teams that bill clients every day."
              className={inputClass}
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label htmlFor="price" className="block text-sm font-medium text-gray-700">
                Price (₹)
              </label>
              <input
                id="price"
                type="number"
                min="0"
                value={form.priceInr}
                onChange={(e) => update('priceInr', e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="duration" className="block text-sm font-medium text-gray-700">
                Duration (Months)
              </label>
              <input
                id="duration"
                type="number"
                min="1"
                value={form.durationMonths}
                onChange={(e) => update('durationMonths', e.target.value)}
                className={inputClass}
              />
              <div className="mt-1.5 flex gap-1">
                {[
                  { label: '1M', months: '1' },
                  { label: '6M', months: '6' },
                  { label: '1Y', months: '12' },
                ].map((preset) => (
                  <button
                    key={preset.months}
                    type="button"
                    onClick={() => update('durationMonths', preset.months)}
                    className={`rounded px-2 py-0.5 text-[11px] font-medium transition ${
                      form.durationMonths === preset.months
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label htmlFor="limit" className="block text-sm font-medium text-gray-700">
                Invoice limit
              </label>
              <input
                id="limit"
                type="number"
                min="0"
                value={form.invoiceLimitText}
                onChange={(e) => update('invoiceLimitText', e.target.value)}
                placeholder="Unlimited"
                className={inputClass}
              />
              <p className="mt-1 text-xs text-gray-400">Blank = unlimited / month.</p>
            </div>
            <div>
              <label htmlFor="order" className="block text-sm font-medium text-gray-700">
                Sort order
              </label>
              <input
                id="order"
                type="number"
                value={form.sortOrder}
                onChange={(e) => update('sortOrder', e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label htmlFor="features" className="block text-sm font-medium text-gray-700">
              Features
            </label>
            <textarea
              id="features"
              rows={6}
              value={form.featuresText}
              onChange={(e) => update('featuresText', e.target.value)}
              placeholder={'Unlimited invoices\nGST-ready templates\nPriority support'}
              className={`${inputClass} resize-y leading-relaxed`}
            />
            <p className="mt-1 text-xs text-gray-400">One feature per line.</p>
          </div>

          <div>
            <label htmlFor="cta" className="block text-sm font-medium text-gray-700">
              Button label
            </label>
            <input
              id="cta"
              type="text"
              value={form.cta}
              onChange={(e) => update('cta', e.target.value)}
              placeholder="Choose Business"
              className={inputClass}
            />
          </div>

          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2.5">
              <input
                type="checkbox"
                checked={form.highlighted}
                onChange={(e) => update('highlighted', e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm font-medium text-gray-700">
                Highlighted <span className="font-normal text-gray-400">(“Most popular”)</span>
              </span>
            </label>
            <label className="flex items-center gap-2.5">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => update('active', e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm font-medium text-gray-700">
                Active <span className="font-normal text-gray-400">(shown on the site)</span>
              </span>
            </label>
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-600">{error}</p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60"
            >
              {saving ? 'Saving…' : form.id ? 'Save changes' : 'Create package'}
            </button>
            <button
              type="button"
              onClick={() => setForm(null)}
              className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Packages</h1>
          <p className="mt-1 text-sm text-gray-500">
            {packages.length} plan{packages.length === 1 ? '' : 's'} ·{' '}
            {packages.filter((p) => p.active).length} active
          </p>
        </div>
        <button
          onClick={startNew}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New package
        </button>
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-600">{error}</p>
      )}

      {packages.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white py-16 text-center text-sm text-gray-500">
          No packages yet. Create your first plan.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3">Package</th>
                <th className="px-4 py-3">Duration</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Invoice limit</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {packages.map((p) => (
                <tr key={p.id} className="align-top">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">{p.name || '(unnamed)'}</span>
                      {p.highlighted && (
                        <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                          Popular
                        </span>
                      )}
                    </div>
                    <div className="font-mono text-xs text-gray-400">{p.key}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                      {formatDuration(p.durationMonths)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-700 font-medium">
                    ₹{p.priceInr.toLocaleString('en-IN')}
                    <span className="text-xs font-normal text-gray-400">
                      {' '}{formatBillingCycle(p.durationMonths)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{formatLimit(p.invoiceLimit)}</td>
                  <td className="px-4 py-3">
                    {p.active ? (
                      <span className="inline-flex rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-500">
                        Hidden
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => startEdit(p)}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(p)}
                        disabled={busyId === p.id}
                        className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                      >
                        Delete
                      </button>
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
