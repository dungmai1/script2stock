import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  PixabayPhotoSearchResponseSchema,
  PixabayVideoSearchResponseSchema,
  buildPixabayByIdUrl,
  buildPixabayPhotoSearchUrl,
  buildPixabayVideoSearchUrl,
  compactTags,
  mapPixabayPhoto,
  mapPixabayVideo,
  selectPixabayVideos
} from '../src/main/services/pexels/pixabay-mapping.ts'
import { validateDownloadUrl } from '../src/main/services/pexels/download-url-validation.ts'
import {
  buildManifestAttribution,
  buildPixabayAssetUrl
} from '../src/main/services/pexels/pexels-attribution.ts'
import { normalizeStockSource, stockSecretKey } from '../src/main/services/pexels/stock-source.ts'
import { buildStockScoutSystemPrompt } from '../src/main/services/agent/search-mode.ts'

const photoHit = {
  id: 195893,
  pageURL: 'https://pixabay.com/photos/blossom-bloom-flower-195893/',
  type: 'photo',
  tags: 'blossom, bloom, flower',
  previewURL: 'https://cdn.pixabay.com/photo/2013/10/15/09/12/flower-195893_150.jpg',
  webformatURL: 'https://pixabay.com/get/35bbf209e13e39d2_640.jpg',
  largeImageURL: 'https://pixabay.com/get/ed6a99fd0a76647_1280.jpg',
  imageWidth: 4000,
  imageHeight: 2250,
  user_id: 48777,
  user: 'Josch13'
}

const videoHit = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 125,
  pageURL: 'https://pixabay.com/videos/id-125/',
  type: 'film',
  tags: 'flowers, yellow, blossom',
  duration: 12,
  videos: {
    large: { url: '', width: 0, height: 0, size: 0, thumbnail: '' },
    medium: {
      url: 'https://cdn.pixabay.com/video/2015/08/08/125-135736646_medium.mp4',
      width: 1920,
      height: 1080,
      size: 6615235,
      thumbnail: 'https://cdn.pixabay.com/video/2015/08/08/125-135736646_medium.jpg'
    },
    small: {
      url: 'https://cdn.pixabay.com/video/2015/08/08/125-135736646_small.mp4',
      width: 1280,
      height: 720,
      size: 3562083,
      thumbnail: 'https://cdn.pixabay.com/video/2015/08/08/125-135736646_small.jpg'
    },
    tiny: {
      url: 'https://cdn.pixabay.com/video/2015/08/08/125-135736646_tiny.mp4',
      width: 640,
      height: 360,
      size: 1030736,
      thumbnail: 'https://cdn.pixabay.com/video/2015/08/08/125-135736646_tiny.jpg'
    }
  },
  user_id: 1281706,
  user: 'Coverr-Free-Footage',
  ...overrides
})

const portraitVideoHit = videoHit({
  id: 999,
  videos: {
    medium: {
      url: 'https://cdn.pixabay.com/video/2024/01/01/999_medium.mp4',
      width: 1080,
      height: 1920,
      size: 1,
      thumbnail: 'https://cdn.pixabay.com/video/2024/01/01/999_medium.jpg'
    }
  }
})

describe('Pixabay request URLs', () => {
  const options = { apiKey: 'test-key', safeSearch: true }

  it('builds a photo search URL with mapped orientation, color and safesearch', () => {
    const url = new URL(
      buildPixabayPhotoSearchUrl(
        { query: 'city skyline', orientation: 'portrait', color: 'Blue', page: 2, per_page: 15 },
        options
      )
    )
    assert.equal(url.origin + url.pathname, 'https://pixabay.com/api/')
    assert.equal(url.searchParams.get('key'), 'test-key')
    assert.equal(url.searchParams.get('q'), 'city skyline')
    assert.equal(url.searchParams.get('image_type'), 'photo')
    assert.equal(url.searchParams.get('orientation'), 'vertical')
    assert.equal(url.searchParams.get('colors'), 'blue')
    assert.equal(url.searchParams.get('safesearch'), 'true')
    assert.equal(url.searchParams.get('page'), '2')
    assert.equal(url.searchParams.get('per_page'), '15')
  })

  it('drops unsupported colors and square orientation, and clamps per_page to 3-200', () => {
    const url = new URL(
      buildPixabayPhotoSearchUrl(
        { query: 'desk', orientation: 'square', color: '#ff0000', per_page: 1 },
        { apiKey: 'k', safeSearch: false }
      )
    )
    assert.equal(url.searchParams.has('orientation'), false)
    assert.equal(url.searchParams.has('colors'), false)
    assert.equal(url.searchParams.has('safesearch'), false)
    assert.equal(url.searchParams.get('per_page'), '3')

    const big = new URL(buildPixabayPhotoSearchUrl({ query: 'desk', per_page: 500 }, options))
    assert.equal(big.searchParams.get('per_page'), '200')
  })

  it('over-fetches videos when an orientation must be filtered locally', () => {
    const plain = new URL(buildPixabayVideoSearchUrl({ query: 'waves', per_page: 10 }, options))
    assert.equal(plain.origin + plain.pathname, 'https://pixabay.com/api/videos/')
    // Doubled so real footage still fills the page once AI-generated clips move to the back.
    assert.equal(plain.searchParams.get('per_page'), '20')
    assert.equal(plain.searchParams.get('video_type'), 'film')
    assert.equal(plain.searchParams.has('orientation'), false)

    const portrait = new URL(
      buildPixabayVideoSearchUrl({ query: 'waves', orientation: 'portrait', per_page: 10 }, options)
    )
    assert.equal(portrait.searchParams.get('per_page'), '40')
    assert.equal(portrait.searchParams.has('orientation'), false)
  })

  it('builds get-by-id URLs for both endpoints', () => {
    assert.equal(
      buildPixabayByIdUrl('photo', 195893, 'k'),
      'https://pixabay.com/api/?key=k&id=195893'
    )
    assert.equal(
      buildPixabayByIdUrl('video', 125, 'k'),
      'https://pixabay.com/api/videos/?key=k&id=125'
    )
  })
})

describe('Pixabay response mapping', () => {
  it('maps a photo hit onto the Pexels photo shape with the downloadable size', () => {
    const parsed = PixabayPhotoSearchResponseSchema.parse({
      total: 1,
      totalHits: 1,
      hits: [photoHit]
    })
    const photo = mapPixabayPhoto(parsed.hits[0])

    assert.equal(photo.id, 195893)
    assert.equal(photo.url, photoHit.pageURL)
    assert.equal(photo.alt, 'blossom, bloom, flower')
    assert.equal(photo.photographer, 'Josch13')
    assert.equal(photo.photographer_url, 'https://pixabay.com/users/Josch13-48777/')
    // A single variant keeps the long signed URLs out of the model context.
    assert.deepEqual(photo.src, { original: photoHit.largeImageURL })
    // largeImageURL is capped at 1280px on the longest side.
    assert.equal(photo.width, 1280)
    assert.equal(photo.height, 720)
  })

  it('does not upscale photos smaller than the large rendition', () => {
    const photo = mapPixabayPhoto({ ...photoHit, imageWidth: 800, imageHeight: 600 })
    assert.equal(photo.width, 800)
    assert.equal(photo.height, 600)
  })

  it('maps a video hit to its single 1080p file, skipping empty renditions', () => {
    const parsed = PixabayVideoSearchResponseSchema.parse({
      total: 1,
      totalHits: 1,
      hits: [videoHit()]
    })
    const video = mapPixabayVideo(parsed.hits[0])

    assert.equal(video.id, 125)
    assert.equal(video.width, 1920)
    assert.equal(video.height, 1080)
    assert.equal(video.duration, 12)
    assert.equal(video.tags, 'flowers, yellow, blossom')
    assert.equal(video.user?.name, 'Coverr-Free-Footage')
    assert.equal(video.image, 'https://cdn.pixabay.com/video/2015/08/08/125-135736646_medium.jpg')
    assert.deepEqual(
      video.video_files.map((f) => [f.quality, f.width, f.height]),
      [['hd', 1920, 1080]]
    )
    assert.ok(video.video_files.every((f) => f.link.startsWith('https://cdn.pixabay.com/video/')))
  })

  it('prefers the 1080p rendition over 4K and reports its size', () => {
    const video = mapPixabayVideo(
      PixabayVideoSearchResponseSchema.parse({
        totalHits: 1,
        hits: [
          videoHit({
            videos: {
              large: {
                url: 'https://cdn.pixabay.com/video/x_large.mp4',
                width: 3840,
                height: 2160
              },
              medium: {
                url: 'https://cdn.pixabay.com/video/x_medium.mp4',
                width: 2560,
                height: 1440
              },
              small: {
                url: 'https://cdn.pixabay.com/video/x_small.mp4',
                width: 1920,
                height: 1080
              },
              tiny: { url: 'https://cdn.pixabay.com/video/x_tiny.mp4', width: 1280, height: 720 }
            }
          })
        ]
      }).hits[0]
    )
    assert.equal(video.video_files.length, 1)
    assert.equal(video.video_files[0].link, 'https://cdn.pixabay.com/video/x_small.mp4')
    assert.equal(video.width, 1920)
    assert.equal(video.height, 1080)
  })

  it('dedupes and caps tags', () => {
    assert.equal(compactTags('table, Table, brown table, end, end, end'), 'table, brown table, end')
    assert.equal(
      compactTags(Array.from({ length: 30 }, (_, i) => `t${i}`).join(', '))?.split(', ').length,
      12
    )
    assert.equal(compactTags(''), undefined)
    assert.equal(compactTags(null), undefined)
  })

  it('falls back to a 4K file labelled uhd when nothing smaller exists', () => {
    const video = mapPixabayVideo(
      PixabayVideoSearchResponseSchema.parse({
        totalHits: 1,
        hits: [
          videoHit({
            videos: {
              large: {
                url: 'https://cdn.pixabay.com/video/x_large.mp4',
                width: 3840,
                height: 2160
              }
            }
          })
        ]
      }).hits[0]
    )
    assert.equal(video.video_files[0].quality, 'uhd')
  })

  it('filters videos by orientation locally and trims to per_page', () => {
    const hits = PixabayVideoSearchResponseSchema.parse({
      totalHits: 3,
      hits: [videoHit(), portraitVideoHit, videoHit({ id: 126 })]
    }).hits

    assert.deepEqual(
      selectPixabayVideos(hits, { orientation: 'portrait', per_page: 10 }).map((v) => v.id),
      [999]
    )
    assert.deepEqual(
      selectPixabayVideos(hits, { orientation: 'landscape', per_page: 10 }).map((v) => v.id),
      [125, 126]
    )
    assert.equal(selectPixabayVideos(hits, { per_page: 3 }).length, 3)
    assert.equal(selectPixabayVideos(hits, { orientation: 'square' }).length, 0)
  })

  it('moves AI-generated clips behind real footage and keeps the order otherwise', () => {
    const hits = PixabayVideoSearchResponseSchema.parse({
      totalHits: 4,
      hits: [
        videoHit({ id: 1, tags: 'ai generated, living room, cozy' }),
        videoHit({ id: 2, tags: 'living room, sofa' }),
        videoHit({ id: 3, tags: 'interior, AI-Generated' }),
        videoHit({ id: 4, tags: 'fountain, rain, aisle' })
      ]
    }).hits

    assert.deepEqual(
      selectPixabayVideos(hits, { per_page: 10 }).map((v) => v.id),
      [2, 4, 1, 3]
    )
    assert.deepEqual(
      selectPixabayVideos(hits, { per_page: 3 }).map((v) => v.id),
      [2, 4, 1]
    )
  })

  it('offers the smallest preview frame for visual review', () => {
    const video = mapPixabayVideo(
      PixabayVideoSearchResponseSchema.parse({ totalHits: 1, hits: [videoHit()] }).hits[0]
    )
    assert.match(video.image ?? '', /_medium\.jpg$/)
    assert.match(video.preview_small ?? '', /_tiny\.jpg$/)
  })

  it('drops videos that have no downloadable rendition', () => {
    const hits = PixabayVideoSearchResponseSchema.parse({
      totalHits: 1,
      hits: [videoHit({ videos: { large: { url: '', width: 0, height: 0 } } })]
    }).hits
    assert.equal(selectPixabayVideos(hits, {}).length, 0)
  })
})

describe('Pixabay download URLs, attribution and source helpers', () => {
  it('accepts Pixabay image and video hosts but not look-alikes', () => {
    assert.doesNotThrow(() => validateDownloadUrl(photoHit.largeImageURL))
    assert.doesNotThrow(() =>
      validateDownloadUrl('https://cdn.pixabay.com/video/2015/08/08/125-135736646_medium.mp4')
    )
    assert.throws(
      () => validateDownloadUrl('https://pixabay.com.evil.example/a.jpg'),
      /not an allowed/
    )
    assert.throws(() => validateDownloadUrl('https://notpixabay.com/a.jpg'), /not an allowed/)
    assert.throws(() => validateDownloadUrl('http://cdn.pixabay.com/a.mp4'), /HTTPS required/)
  })

  it('builds Pixabay attribution with page URLs derived from the asset ID', () => {
    assert.equal(buildPixabayAssetUrl('photo', 195893), 'https://pixabay.com/photos/id-195893/')
    assert.equal(buildPixabayAssetUrl('video', 125), 'https://pixabay.com/videos/id-125/')

    const attr = buildManifestAttribution(
      [
        {
          id: 'video_125',
          type: 'video',
          pexelsId: 125,
          url: 'https://cdn.pixabay.com/video/2015/08/08/125-135736646_medium.mp4',
          photographer: 'Coverr-Free-Footage',
          photographerUrl: 'https://pixabay.com/users/Coverr-Free-Footage-1281706/'
        }
      ],
      'pixabay'
    )
    assert.ok('pixabay' in attr)
    assert.equal('pexels' in attr, false)
    assert.equal(attr.pixabay.url, 'https://pixabay.com')
    assert.equal(attr.assets[0].pixabayUrl, 'https://pixabay.com/videos/id-125/')
    assert.equal(attr.assets[0].creditLine, 'Video by Coverr-Free-Footage on Pixabay (ID 125)')
  })

  it('treats missing or unknown sources as Pexels', () => {
    assert.equal(normalizeStockSource(undefined), 'pexels')
    assert.equal(normalizeStockSource('something'), 'pexels')
    assert.equal(normalizeStockSource('pixabay'), 'pixabay')
    assert.equal(stockSecretKey('pexels'), 'pexelsKey')
    assert.equal(stockSecretKey('pixabay'), 'pixabayKey')
  })
})

describe('Stock source in the agent system prompt', () => {
  const base = {
    searchMode: 'focused' as const,
    platform: 'YouTube',
    style: 'Cinematic',
    mix: 'videos + photos',
    maxAssetsPerBeat: 2,
    maxTotalDownloads: 10,
    skipExplicit: true,
    avoidPeople: false
  }

  it('leaves the Pexels prompt unchanged when no source is given', () => {
    assert.equal(
      buildStockScoutSystemPrompt(base),
      buildStockScoutSystemPrompt({ ...base, stockSource: 'pexels' })
    )
    assert.ok(!buildStockScoutSystemPrompt(base).includes('Pixabay'))
  })

  it('lists only the video search tool for a videos-only mix', () => {
    const prompt = buildStockScoutSystemPrompt({ ...base, mix: 'videos only' })
    assert.ok(
      prompt.includes(
        'Available tools: search_pexels_videos, select_assets_for_download, download_selected_assets.'
      )
    )
    assert.ok(
      buildStockScoutSystemPrompt(base).includes(
        'Available tools: search_pexels_photos, search_pexels_videos, select_assets_for_download, download_selected_assets.'
      )
    )
  })

  it('describes Pixabay results and keeps the tool names for Pixabay jobs', () => {
    const prompt = buildStockScoutSystemPrompt({ ...base, stockSource: 'pixabay' })
    assert.ok(prompt.includes('Stock source for this job: Pixabay'))
    assert.ok(prompt.includes('otherwise from the tags'))
    assert.ok(prompt.includes('Use 2-3 words'))
    assert.ok(prompt.includes('Search a beat at most three times'))
    assert.ok(prompt.includes('Select clips with visualMatch 2 or 3'))
    assert.ok(prompt.includes('search_pexels_photos'))
    assert.ok(!prompt.includes('Pexels'))
  })
})
