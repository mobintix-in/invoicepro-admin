'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { isSupabaseConfigured } from '@/lib/supabase/client'
import { getMyAccess } from '@/lib/account'
import { formatBlogDate, slugify } from '@/lib/blog'
import {
  listAllPostsAdmin,
  savePost,
  deletePost,
  type AdminBlogPost,
  type BlogPostInput,
} from '@/lib/blog-admin'

type FormState = BlogPostInput

const EMPTY_FORM: FormState = {
  id: undefined,
  slug: '',
  title: '',
  excerpt: '',
  category: '',
  content: '',
  published: true,
}

export default function AdminBlogPage() {
  const router = useRouter()
  const [checking, setChecking] = useState(isSupabaseConfigured())
  const [isAdmin, setIsAdmin] = useState(false)
  const [posts, setPosts] = useState<AdminBlogPost[]>([])

  const [form, setForm] = useState<FormState | null>(null)
  const [slugEdited, setSlugEdited] = useState(false)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setPosts(await listAllPostsAdmin())
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
        setError(err instanceof Error ? err.message : 'Failed to load posts')
      }
      setChecking(false)
    }).catch(() => router.replace('/login'))
  }, [router, load])

  function startNew() {
    setError(null)
    setSlugEdited(false)
    setForm({ ...EMPTY_FORM })
  }

  function startEdit(p: AdminBlogPost) {
    setError(null)
    setSlugEdited(true)
    setForm({
      id: p.id,
      slug: p.slug,
      title: p.title,
      excerpt: p.excerpt,
      category: p.category,
      content: p.content,
      published: p.published,
    })
  }

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f))
  }

  function onTitleChange(value: string) {
    setForm((f) => {
      if (!f) return f
      const next = { ...f, title: value }
      if (!slugEdited) next.slug = slugify(value)
      return next
    })
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!form) return
    if (!form.title.trim()) return setError('A title is required.')
    if (!form.slug.trim()) return setError('A slug is required.')
    setError(null)
    setSaving(true)
    try {
      await savePost(form)
      await load()
      setForm(null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not save the post'
      setError(/duplicate|unique/i.test(msg) ? 'That slug is already used by another post.' : msg)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(p: AdminBlogPost) {
    if (!confirm(`Delete “${p.title}”? This cannot be undone.`)) return
    setBusyId(p.id)
    try {
      await deletePost(p.id)
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
            {form.id ? 'Edit post' : 'New post'}
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
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700">
              Title
            </label>
            <input
              id="title"
              type="text"
              value={form.title}
              onChange={(e) => onTitleChange(e.target.value)}
              placeholder="How to bill clients faster"
              className={inputClass}
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="slug" className="block text-sm font-medium text-gray-700">
                Slug
              </label>
              <input
                id="slug"
                type="text"
                value={form.slug}
                onChange={(e) => {
                  setSlugEdited(true)
                  update('slug', slugify(e.target.value))
                }}
                placeholder="how-to-bill-clients-faster"
                className={`${inputClass} font-mono`}
              />
              <p className="mt-1 text-xs text-gray-400">/blog/{form.slug || 'your-slug'}</p>
            </div>
            <div>
              <label htmlFor="category" className="block text-sm font-medium text-gray-700">
                Category
              </label>
              <input
                id="category"
                type="text"
                value={form.category}
                onChange={(e) => update('category', e.target.value)}
                placeholder="Cash flow"
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label htmlFor="excerpt" className="block text-sm font-medium text-gray-700">
              Excerpt
            </label>
            <textarea
              id="excerpt"
              rows={2}
              value={form.excerpt}
              onChange={(e) => update('excerpt', e.target.value)}
              placeholder="A one or two sentence summary shown on cards and previews."
              className={`${inputClass} resize-none`}
            />
          </div>

          <div>
            <label htmlFor="content" className="block text-sm font-medium text-gray-700">
              Content
            </label>
            <textarea
              id="content"
              rows={14}
              value={form.content}
              onChange={(e) => update('content', e.target.value)}
              placeholder={'Write your article here.\n\nSeparate paragraphs with a blank line.'}
              className={`${inputClass} resize-y leading-relaxed`}
            />
            <p className="mt-1 text-xs text-gray-400">
              Separate paragraphs with a blank line. Reading time is estimated automatically.
            </p>
          </div>

          <label className="flex items-center gap-2.5">
            <input
              type="checkbox"
              checked={form.published}
              onChange={(e) => update('published', e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm font-medium text-gray-700">
              Published{' '}
              <span className="font-normal text-gray-400">
                (visible on the public blog)
              </span>
            </span>
          </label>

          {error && (
            <p className="rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-600">{error}</p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60"
            >
              {saving ? 'Saving…' : form.id ? 'Save changes' : 'Publish post'}
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
          <h1 className="text-2xl font-bold text-gray-900">Blog</h1>
          <p className="mt-1 text-sm text-gray-500">
            {posts.length} post{posts.length === 1 ? '' : 's'} ·{' '}
            {posts.filter((p) => p.published).length} published
          </p>
        </div>
        <button
          onClick={startNew}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New post
        </button>
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-600">{error}</p>
      )}

      {posts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white py-16 text-center text-sm text-gray-500">
          No posts yet. Create your first article.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {posts.map((p) => (
                <tr key={p.id} className="align-top">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{p.title || '(untitled)'}</div>
                    <div className="font-mono text-xs text-gray-400">/blog/{p.slug}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{p.category}</td>
                  <td className="px-4 py-3">
                    {p.published ? (
                      <span className="inline-flex rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">
                        Published
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-500">
                        Draft
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{formatBlogDate(p.createdAt)}</td>
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
