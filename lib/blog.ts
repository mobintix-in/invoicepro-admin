export type BlogPost = {
  id: string
  slug: string
  title: string
  excerpt: string
  category: string
  date: string
  readingMinutes: number
  content: string[]
  published: boolean
}

export type BlogPostRow = {
  id: string
  slug: string
  title: string
  excerpt: string
  category: string
  content: string
  reading_minutes: number
  published: boolean
  created_at: string
  updated_at: string
}

export const BLOG_COLUMNS =
  'id, slug, title, excerpt, category, content, reading_minutes, published, created_at, updated_at'

export function bodyToParagraphs(body: string): string[] {
  return body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
}

export function estimateReadingMinutes(body: string): number {
  const words = body.trim().split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(words / 200))
}

export function rowToPost(row: BlogPostRow): BlogPost {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    category: row.category,
    date: row.created_at,
    readingMinutes: row.reading_minutes,
    content: bodyToParagraphs(row.content),
    published: row.published,
  }
}

export function formatBlogDate(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(iso))
}

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}
