import { createClient } from '@/lib/supabase/client'

export interface ContactMessage {
  id: string
  name: string
  email: string
  message: string
  handled: boolean
  createdAt: string
}

type ContactRow = {
  id: string
  name: string
  email: string
  message: string
  handled: boolean
  created_at: string
}

export async function listContactMessages(): Promise<ContactMessage[]> {
  const { data, error } = await createClient()
    .from('contact_messages')
    .select('id, name, email, message, handled, created_at')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data as ContactRow[]).map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    message: r.message,
    handled: r.handled,
    createdAt: r.created_at,
  }))
}

export async function setMessageHandled(id: string, handled: boolean): Promise<void> {
  const { error } = await createClient()
    .from('contact_messages')
    .update({ handled })
    .eq('id', id)
  if (error) throw error
}

export async function deleteContactMessage(id: string): Promise<void> {
  const { error } = await createClient().from('contact_messages').delete().eq('id', id)
  if (error) throw error
}
