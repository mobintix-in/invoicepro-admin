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

export async function submitContactMessage(input: {
  name: string
  email: string
  message: string
}): Promise<void> {
  const { error } = await createClient().rpc('submit_contact_message', {
    p_name: input.name.trim().slice(0, 200),
    p_email: input.email.trim().slice(0, 200),
    p_message: input.message.trim().slice(0, 5000),
  })
  if (error) {
    if (error.message.includes('CONTACT_RATE_LIMITED')) {
      throw new Error('Too many messages. Please wait a few minutes and try again.')
    }
    throw error
  }
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
