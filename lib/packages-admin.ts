import { createClient } from '@/lib/supabase/client'
import { PACKAGE_COLUMNS, rowToPackage, type Package, type PackageRow } from '@/lib/packages'

export interface PackageInput {
  id?: string
  key: string
  name: string
  priceInr: number
  tagline: string
  features: string[]
  invoiceLimit: number | null
  cta: string
  highlighted: boolean
  sortOrder: number
  active: boolean
}

export async function listAllPackagesAdmin(): Promise<Package[]> {
  const { data, error } = await createClient()
    .from('packages')
    .select(PACKAGE_COLUMNS)
    .order('sort_order', { ascending: true })
  if (error) throw error
  return (data as PackageRow[]).map(rowToPackage)
}

export async function savePackage(input: PackageInput): Promise<void> {
  const record = {
    key: input.key.trim(),
    name: input.name.trim(),
    price_inr: Math.max(0, Math.round(input.priceInr)),
    tagline: input.tagline.trim(),
    features: input.features.map((f) => f.trim()).filter(Boolean),
    invoice_limit: input.invoiceLimit,
    cta: input.cta.trim() || 'Get started',
    highlighted: input.highlighted,
    sort_order: input.sortOrder,
    active: input.active,
    updated_at: new Date().toISOString(),
  }

  const supabase = createClient()
  if (input.id) {
    const { error } = await supabase.from('packages').update(record).eq('id', input.id)
    if (error) throw error
  } else {
    const { error } = await supabase.from('packages').insert(record)
    if (error) throw error
  }
}

export async function deletePackage(id: string): Promise<void> {
  const { error } = await createClient().from('packages').delete().eq('id', id)
  if (error) throw error
}
