import { createClient } from '@/lib/supabase/client'
import { BLOG_COLUMNS, estimateReadingMinutes, type BlogPostRow } from '@/lib/blog'

export interface AdminBlogPost {
  id: string
  slug: string
  title: string
  excerpt: string
  category: string
  content: string
  readingMinutes: number
  published: boolean
  createdAt: string
  updatedAt: string
}

export interface BlogPostInput {
  id?: string
  slug: string
  title: string
  excerpt: string
  category: string
  content: string
  published: boolean
}

function toAdminPost(row: BlogPostRow): AdminBlogPost {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    category: row.category,
    content: row.content,
    readingMinutes: row.reading_minutes,
    published: row.published,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function listAllPostsAdmin(): Promise<AdminBlogPost[]> {
  const { data, error } = await createClient()
    .from('blog_posts')
    .select(BLOG_COLUMNS)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data as BlogPostRow[]).map(toAdminPost)
}

export async function savePost(input: BlogPostInput): Promise<void> {
  const { data: userData } = await createClient().auth.getUser()
  const uid = userData.user?.id
  if (!uid) throw new Error('Not authenticated')

  const record = {
    slug: input.slug.trim(),
    title: input.title.trim(),
    excerpt: input.excerpt.trim(),
    category: input.category.trim() || 'General',
    content: input.content.trim(),
    reading_minutes: estimateReadingMinutes(input.content),
    published: input.published,
    author_id: uid,
    updated_at: new Date().toISOString(),
  }

  const supabase = createClient()
  if (input.id) {
    const { error } = await supabase.from('blog_posts').update(record).eq('id', input.id)
    if (error) throw error
  } else {
    const { error } = await supabase.from('blog_posts').insert(record)
    if (error) throw error
  }
}

export async function deletePost(id: string): Promise<void> {
  const { error } = await createClient().from('blog_posts').delete().eq('id', id)
  if (error) throw error
}
