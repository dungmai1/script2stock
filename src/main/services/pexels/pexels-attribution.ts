import type { StockSource } from './stock-source.ts'

export interface PexelsAssetAttribution {
  assetId: string
  type: 'photo' | 'video'
  pexelsId: number
  pexelsUrl: string
  photographer: string
  photographerUrl?: string
  creditLine: string
}

export interface PexelsManifestAttribution {
  pexels: {
    url: string
    creditText: string
    logoUrl: string
  }
  usageNote: string
  assets: PexelsAssetAttribution[]
}

interface AttributionAssetInput {
  id: string
  type: 'photo' | 'video'
  pexelsId: number
  url: string
  photographer: string
  photographerUrl?: string
}

export function buildPexelsAssetUrl(type: 'photo' | 'video', pexelsId: number): string {
  if (type === 'photo') {
    return `https://www.pexels.com/photo/${pexelsId}/`
  }
  return `https://www.pexels.com/video/${pexelsId}/`
}

export function buildAssetCreditLine(
  type: 'photo' | 'video',
  photographer: string,
  pexelsId: number
): string {
  const label = type === 'photo' ? 'Photo' : 'Video'
  return `${label} by ${photographer} on Pexels (ID ${pexelsId})`
}

export interface PixabayAssetAttribution {
  assetId: string
  type: 'photo' | 'video'
  pixabayId: number
  pixabayUrl: string
  creator: string
  creatorUrl?: string
  creditLine: string
}

export interface PixabayManifestAttribution {
  pixabay: {
    url: string
    creditText: string
  }
  usageNote: string
  assets: PixabayAssetAttribution[]
}

export type StockManifestAttribution = PexelsManifestAttribution | PixabayManifestAttribution

export function buildPixabayAssetUrl(type: 'photo' | 'video', pixabayId: number): string {
  return type === 'photo'
    ? `https://pixabay.com/photos/id-${pixabayId}/`
    : `https://pixabay.com/videos/id-${pixabayId}/`
}

function buildPixabayManifestAttribution(
  assets: AttributionAssetInput[]
): PixabayManifestAttribution {
  const seenIds = new Set<string>()
  const attributionAssets: PixabayAssetAttribution[] = []

  for (const asset of assets) {
    if (!asset.pexelsId || !asset.photographer || seenIds.has(asset.id)) continue
    seenIds.add(asset.id)

    const label = asset.type === 'photo' ? 'Photo' : 'Video'
    attributionAssets.push({
      assetId: asset.id,
      type: asset.type,
      pixabayId: asset.pexelsId,
      pixabayUrl: buildPixabayAssetUrl(asset.type, asset.pexelsId),
      creator: asset.photographer,
      creatorUrl: asset.photographerUrl,
      creditLine: `${label} by ${asset.photographer} on Pixabay (ID ${asset.pexelsId})`
    })
  }

  return {
    pixabay: {
      url: 'https://pixabay.com',
      creditText: 'Photos and videos provided by Pixabay'
    },
    usageNote:
      'Per the Pixabay API terms, show that the media comes from Pixabay and credit creators when possible.',
    assets: attributionAssets
  }
}

export function buildManifestAttribution(
  assets: AttributionAssetInput[],
  source: StockSource = 'pexels'
): StockManifestAttribution {
  if (source === 'pixabay') return buildPixabayManifestAttribution(assets)

  const seenIds = new Set<string>()
  const attributionAssets: PexelsAssetAttribution[] = []

  for (let i = 0; i < assets.length; i++) {
    const asset = assets[i]
    if (!asset.pexelsId || !asset.photographer || seenIds.has(asset.id)) continue
    seenIds.add(asset.id)

    attributionAssets.push({
      assetId: asset.id,
      type: asset.type,
      pexelsId: asset.pexelsId,
      pexelsUrl: buildPexelsAssetUrl(asset.type, asset.pexelsId),
      photographer: asset.photographer,
      photographerUrl: asset.photographerUrl,
      creditLine: buildAssetCreditLine(asset.type, asset.photographer, asset.pexelsId)
    })
  }

  return {
    pexels: {
      url: 'https://www.pexels.com',
      creditText: 'Photos and videos provided by Pexels',
      logoUrl: 'https://images.pexels.com/lib/api/pexels.png'
    },
    usageNote:
      'Per Pexels API guidelines, credit photographers when possible and link back to Pexels.',
    assets: attributionAssets
  }
}
