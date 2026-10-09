import type { PublicSettings } from '@renderer/lib/store'

export type StockSource = NonNullable<PublicSettings['stockProvider']>
export type StockKeyField = 'pexelsKey' | 'pixabayKey'

export const STOCK_SOURCE_OPTIONS: { value: StockSource; label: string }[] = [
  { value: 'pexels', label: 'Pexels' },
  { value: 'pixabay', label: 'Pixabay' }
]

export const STOCK_SOURCE_LABELS: Record<StockSource, string> = {
  pexels: 'Pexels',
  pixabay: 'Pixabay'
}

export const STOCK_SOURCE_SITE_URLS: Record<StockSource, string> = {
  pexels: 'https://www.pexels.com',
  pixabay: 'https://pixabay.com'
}

export const STOCK_SOURCE_API_KEY_URLS: Record<StockSource, string> = {
  pexels: 'https://www.pexels.com/api/',
  pixabay: 'https://pixabay.com/api/docs/'
}

export function getStockSource(settings: PublicSettings | null): StockSource {
  return settings?.stockProvider === 'pixabay' ? 'pixabay' : 'pexels'
}

export function stockKeyField(source: StockSource): StockKeyField {
  return `${source}Key`
}

/** Assets do not record their source, but their download URL host identifies it. */
export function stockSourceFromUrl(url: string | undefined): StockSource {
  try {
    const host = new URL(url || '').hostname.toLowerCase()
    return host === 'pixabay.com' || host.endsWith('.pixabay.com') ? 'pixabay' : 'pexels'
  } catch {
    return 'pexels'
  }
}
