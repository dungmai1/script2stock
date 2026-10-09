import {
  STOCK_SOURCE_LABELS,
  stockSourceFromUrl,
  type StockSource
} from '@renderer/lib/stock-source'
import type { FlatAsset, GroupedProject, StatusFilter, TypeFilter } from './types'

export const ATTRIBUTION_BANNER_KEY = 'stockfinder:attribution-banner-dismissed'

export function assetStockSource(asset: FlatAsset): StockSource {
  return stockSourceFromUrl(asset.downloadUrl || asset.url)
}

export function assetPageUrl(asset: FlatAsset): string {
  if (assetStockSource(asset) === 'pixabay') {
    return asset.type === 'photo'
      ? `https://pixabay.com/photos/id-${asset.pexelsId}/`
      : `https://pixabay.com/videos/id-${asset.pexelsId}/`
  }
  return asset.type === 'photo'
    ? `https://www.pexels.com/photo/${asset.pexelsId}/`
    : `https://www.pexels.com/video/${asset.pexelsId}/`
}

export function buildCreditLine(asset: FlatAsset): string {
  const label = asset.type === 'photo' ? 'Photo' : 'Video'
  return `${label} by ${asset.photographer} on ${STOCK_SOURCE_LABELS[assetStockSource(asset)]}`
}

export function assetFilename(asset: FlatAsset): string {
  return asset.filePath
    ? (asset.filePath.split(/[\\/]/).pop() ?? '')
    : `${asset.type}_${asset.pexelsId}`
}

export function formatDuration(duration: number | undefined): string {
  if (!duration) return ''
  return duration < 10 ? `00:0${duration}` : `00:${duration}`
}

export function matchesFilters(
  asset: FlatAsset,
  searchQuery: string,
  typeFilter: TypeFilter,
  statusFilter: StatusFilter
): boolean {
  const q = searchQuery.toLowerCase()
  const matchesSearch =
    (asset.photographer || '').toLowerCase().includes(q) ||
    (asset.query || '').toLowerCase().includes(q) ||
    (asset.beatText || '').toLowerCase().includes(q)
  if (!matchesSearch) return false

  if (typeFilter !== 'all' && asset.type !== typeFilter) return false
  if (statusFilter === 'completed') return asset.status === 'completed'
  if (statusFilter === 'failed') return asset.status === 'failed'
  return true
}

export function filterProjects(
  projects: GroupedProject[],
  searchQuery: string,
  typeFilter: TypeFilter,
  statusFilter: StatusFilter
): GroupedProject[] {
  return projects
    .map((project) => ({
      ...project,
      assets: project.assets.filter((a) => matchesFilters(a, searchQuery, typeFilter, statusFilter))
    }))
    .filter((project) => project.assets.length > 0)
}
