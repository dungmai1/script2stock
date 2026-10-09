import { z } from 'zod'
import type {
  PexelsPhoto,
  PexelsPhotoSearchInput,
  PexelsVideo,
  PexelsVideoSearchInput
} from './pexels-types.ts'

/**
 * Pixabay responses are mapped onto the Pexels shapes the agent already consumes,
 * so the rest of the pipeline (candidates, selection, download) stays source-agnostic.
 */

export const PIXABAY_PHOTO_SEARCH_URL = 'https://pixabay.com/api/'
export const PIXABAY_VIDEO_SEARCH_URL = 'https://pixabay.com/api/videos/'

const PIXABAY_MIN_PER_PAGE = 3
const PIXABAY_MAX_PER_PAGE = 200
/** largeImageURL is scaled so its longest side is at most this many pixels. */
const PIXABAY_LARGE_IMAGE_MAX_SIDE = 1280
/** The video API cannot filter by orientation, so over-fetch and filter locally. */
const ORIENTATION_OVERFETCH_FACTOR = 4
/** AI-generated clips are moved to the back, so fetch extra to keep real footage in the page. */
const AI_FILTER_OVERFETCH_FACTOR = 2

const PIXABAY_COLORS = new Set([
  'grayscale',
  'transparent',
  'red',
  'orange',
  'yellow',
  'green',
  'turquoise',
  'blue',
  'lilac',
  'pink',
  'white',
  'gray',
  'black',
  'brown'
])

export const PixabayPhotoHitSchema = z
  .object({
    id: z.number(),
    pageURL: z.string(),
    tags: z.string().nullable().optional(),
    previewURL: z.string().nullable().optional(),
    webformatURL: z.string().nullable().optional(),
    largeImageURL: z.string(),
    imageWidth: z.number(),
    imageHeight: z.number(),
    user_id: z.number().nullable().optional(),
    user: z.string().nullable().optional()
  })
  .passthrough()

export type PixabayPhotoHit = z.infer<typeof PixabayPhotoHitSchema>

export const PixabayPhotoSearchResponseSchema = z
  .object({
    total: z.number().optional(),
    totalHits: z.number(),
    hits: z.array(PixabayPhotoHitSchema)
  })
  .passthrough()

const PixabayVideoRenditionSchema = z
  .object({
    url: z.string().nullable().optional(),
    width: z.number().nullable().optional(),
    height: z.number().nullable().optional(),
    size: z.number().nullable().optional(),
    thumbnail: z.string().nullable().optional()
  })
  .passthrough()

export const PixabayVideoHitSchema = z
  .object({
    id: z.number(),
    pageURL: z.string(),
    tags: z.string().nullable().optional(),
    duration: z.number().optional(),
    videos: z
      .object({
        large: PixabayVideoRenditionSchema.optional(),
        medium: PixabayVideoRenditionSchema.optional(),
        small: PixabayVideoRenditionSchema.optional(),
        tiny: PixabayVideoRenditionSchema.optional()
      })
      .passthrough(),
    user_id: z.number().nullable().optional(),
    user: z.string().nullable().optional()
  })
  .passthrough()

export type PixabayVideoHit = z.infer<typeof PixabayVideoHitSchema>

export const PixabayVideoSearchResponseSchema = z
  .object({
    total: z.number().optional(),
    totalHits: z.number(),
    hits: z.array(PixabayVideoHitSchema)
  })
  .passthrough()

const MAX_TAGS = 12
/** Short side of the largest rendition offered for download (1080p). */
const PREFERRED_VIDEO_SHORT_SIDE = 1080

/** Pixabay tag lists are long and repetitive; the model only needs the distinct leading ones. */
export function compactTags(tags: string | null | undefined): string | undefined {
  if (!tags) return undefined
  const seen = new Set<string>()
  const unique: string[] = []
  for (const raw of tags.split(',')) {
    const tag = raw.trim()
    const key = tag.toLowerCase()
    if (!tag || seen.has(key)) continue
    seen.add(key)
    unique.push(tag)
    if (unique.length === MAX_TAGS) break
  }
  return unique.length > 0 ? unique.join(', ') : undefined
}

function clampPerPage(perPage: number | undefined, fallback: number): number {
  return Math.min(PIXABAY_MAX_PER_PAGE, Math.max(PIXABAY_MIN_PER_PAGE, perPage ?? fallback))
}

function pixabayUserUrl(user?: string | null, userId?: number | null): string | undefined {
  if (!user || !userId) return undefined
  return `https://pixabay.com/users/${encodeURIComponent(user)}-${userId}/`
}

export interface PixabaySearchOptions {
  apiKey: string
  safeSearch: boolean
}

export function buildPixabayPhotoSearchUrl(
  input: PexelsPhotoSearchInput,
  options: PixabaySearchOptions
): string {
  const url = new URL(PIXABAY_PHOTO_SEARCH_URL)
  url.searchParams.set('key', options.apiKey)
  url.searchParams.set('q', input.query)
  url.searchParams.set('image_type', 'photo')
  if (input.orientation === 'landscape') url.searchParams.set('orientation', 'horizontal')
  if (input.orientation === 'portrait') url.searchParams.set('orientation', 'vertical')
  const color = input.color?.trim().toLowerCase()
  if (color && PIXABAY_COLORS.has(color)) url.searchParams.set('colors', color)
  if (options.safeSearch) url.searchParams.set('safesearch', 'true')
  if (input.page) url.searchParams.set('page', String(input.page))
  url.searchParams.set('per_page', String(clampPerPage(input.per_page, 15)))
  return url.toString()
}

export function buildPixabayVideoSearchUrl(
  input: PexelsVideoSearchInput,
  options: PixabaySearchOptions
): string {
  const url = new URL(PIXABAY_VIDEO_SEARCH_URL)
  url.searchParams.set('key', options.apiKey)
  url.searchParams.set('q', input.query)
  // Camera footage only: the default "all" mixes in cartoons and motion graphics.
  url.searchParams.set('video_type', 'film')
  if (options.safeSearch) url.searchParams.set('safesearch', 'true')
  if (input.page) url.searchParams.set('page', String(input.page))
  const perPage = clampPerPage(input.per_page, 10)
  const overfetch = input.orientation ? ORIENTATION_OVERFETCH_FACTOR : AI_FILTER_OVERFETCH_FACTOR
  url.searchParams.set('per_page', String(clampPerPage(perPage * overfetch, 10)))
  return url.toString()
}

export function buildPixabayByIdUrl(type: 'photo' | 'video', id: number, apiKey: string): string {
  const url = new URL(type === 'photo' ? PIXABAY_PHOTO_SEARCH_URL : PIXABAY_VIDEO_SEARCH_URL)
  url.searchParams.set('key', apiKey)
  url.searchParams.set('id', String(id))
  return url.toString()
}

export function mapPixabayPhoto(hit: PixabayPhotoHit): PexelsPhoto {
  // Report the size of the file that is actually downloadable, not the original upload.
  const scale = Math.min(
    1,
    PIXABAY_LARGE_IMAGE_MAX_SIDE / Math.max(hit.imageWidth, hit.imageHeight, 1)
  )
  return {
    id: hit.id,
    width: Math.round(hit.imageWidth * scale),
    height: Math.round(hit.imageHeight * scale),
    url: hit.pageURL,
    photographer: hit.user || undefined,
    photographer_url: pixabayUserUrl(hit.user, hit.user_id),
    // One variant only: every extra signed URL costs ~160 characters of model context.
    src: { original: hit.largeImageURL },
    alt: compactTags(hit.tags)
  }
}

function videoQuality(height: number): 'uhd' | 'hd' | 'sd' {
  if (height >= 2160) return 'uhd'
  if (height >= 720) return 'hd'
  return 'sd'
}

export function mapPixabayVideo(hit: PixabayVideoHit): PexelsVideo {
  const renditions = [hit.videos.large, hit.videos.medium, hit.videos.small, hit.videos.tiny]
  const files = renditions.flatMap((rendition) => {
    if (!rendition?.url || !rendition.width || !rendition.height) return []
    return [
      {
        quality: videoQuality(rendition.height),
        file_type: 'video/mp4',
        width: rendition.width,
        height: rendition.height,
        link: rendition.url
      }
    ]
  })
  // Offer a single file: the largest rendition up to 1080p, else the smallest available.
  // 4K files are huge and a lone variant keeps results small and unambiguous.
  const best =
    files.find((file) => Math.min(file.width, file.height) <= PREFERRED_VIDEO_SHORT_SIDE) ??
    files[files.length - 1]
  const thumbnail = renditions.find((rendition) => rendition?.thumbnail)?.thumbnail
  const smallThumbnail = renditions.findLast((rendition) => rendition?.thumbnail)?.thumbnail

  return {
    id: hit.id,
    width: best?.width ?? 0,
    height: best?.height ?? 0,
    url: hit.pageURL,
    image: thumbnail || undefined,
    preview_small: smallThumbnail || undefined,
    duration: hit.duration,
    tags: compactTags(hit.tags),
    user: {
      id: hit.user_id ?? undefined,
      name: hit.user || undefined,
      url: pixabayUserUrl(hit.user, hit.user_id)
    },
    video_files: best ? [best] : []
  }
}

export function matchesOrientation(
  video: Pick<PexelsVideo, 'width' | 'height'>,
  orientation: PexelsVideoSearchInput['orientation']
): boolean {
  if (!orientation) return true
  if (orientation === 'landscape') return video.width > video.height
  if (orientation === 'portrait') return video.height > video.width
  return video.width === video.height
}

/** Uploaders mark generated clips with an "ai generated" tag. */
export function isAiGenerated(hit: Pick<PixabayVideoHit, 'tags'>): boolean {
  return /\bai[\s-]?generated\b/i.test(hit.tags || '')
}

/**
 * Drops videos with no downloadable file, applies the local orientation filter, moves
 * AI-generated clips behind real footage (keeping Pixabay's order otherwise), trims to size.
 */
export function selectPixabayVideos(
  hits: PixabayVideoHit[],
  input: Pick<PexelsVideoSearchInput, 'orientation' | 'per_page'>
): PexelsVideo[] {
  const ordered = [...hits.filter((hit) => !isAiGenerated(hit)), ...hits.filter(isAiGenerated)]
  return ordered
    .map(mapPixabayVideo)
    .filter((video) => video.video_files.length > 0)
    .filter((video) => matchesOrientation(video, input.orientation))
    .slice(0, clampPerPage(input.per_page, 10))
}
