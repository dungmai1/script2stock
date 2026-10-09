import { PexelsClient } from './pexels-client'
import { PixabayClient } from './pixabay-client'
import type { StockSource } from './stock-source'

export type StockClient = typeof PexelsClient | typeof PixabayClient

export function getStockClient(source: StockSource): StockClient {
  return source === 'pixabay' ? PixabayClient : PexelsClient
}
