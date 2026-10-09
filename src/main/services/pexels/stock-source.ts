/** Stock media sources the agent can search and download from. */
export type StockSource = 'pexels' | 'pixabay'

export const DEFAULT_STOCK_SOURCE: StockSource = 'pexels'

export const STOCK_SOURCE_NAMES: Record<StockSource, string> = {
  pexels: 'Pexels',
  pixabay: 'Pixabay'
}

/** Jobs written before sources existed carry no value and were always Pexels. */
export function normalizeStockSource(value: unknown): StockSource {
  return value === 'pixabay' ? 'pixabay' : DEFAULT_STOCK_SOURCE
}

export function stockSecretKey(source: StockSource): 'pexelsKey' | 'pixabayKey' {
  return source === 'pixabay' ? 'pixabayKey' : 'pexelsKey'
}
