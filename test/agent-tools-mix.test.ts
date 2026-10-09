import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  agentToolsForMix,
  mergeCandidateVariants,
  searchToolsPhraseForMix
} from '../src/main/services/agent/tool-schemas.ts'

describe('agent tools by asset mix', () => {
  const names = (mix: Parameters<typeof agentToolsForMix>[0]): string[] =>
    agentToolsForMix(mix).map((tool) => tool.name)

  it('hides the photo search tool for a videos-only mix', () => {
    assert.deepEqual(names('videos only'), [
      'search_pexels_videos',
      'select_assets_for_download',
      'download_selected_assets'
    ])
    assert.equal(searchToolsPhraseForMix('videos only'), 'search_pexels_videos')
  })

  it('hides the video search tool for a photos-only mix', () => {
    assert.deepEqual(names('photos only'), [
      'search_pexels_photos',
      'select_assets_for_download',
      'download_selected_assets'
    ])
    assert.equal(searchToolsPhraseForMix('photos only'), 'search_pexels_photos')
  })

  it('offers both search tools for a mixed pack', () => {
    assert.equal(names('videos + photos').length, 4)
    assert.equal(
      searchToolsPhraseForMix('videos + photos'),
      'search_pexels_photos or search_pexels_videos'
    )
  })
})

describe('mergeCandidateVariants', () => {
  it('keeps URLs from earlier searches so an older signed URL stays selectable', () => {
    const first = [{ url: 'https://pixabay.com/get/aaa_1280.jpg' }]
    const second = [{ url: 'https://pixabay.com/get/bbb_1280.jpg' }]
    assert.deepEqual(
      mergeCandidateVariants(first, second).map((v) => v.url),
      ['https://pixabay.com/get/bbb_1280.jpg', 'https://pixabay.com/get/aaa_1280.jpg']
    )
  })

  it('does not duplicate URLs that repeat across searches', () => {
    const same = [{ url: 'https://cdn.pixabay.com/video/1_small.mp4' }]
    assert.equal(mergeCandidateVariants(same, same).length, 1)
  })

  it('caps how many variants are remembered, newest first', () => {
    const older = Array.from({ length: 60 }, (_, i) => ({
      url: `https://pixabay.com/get/old_${i}.jpg`
    }))
    const merged = mergeCandidateVariants(older, [{ url: 'https://pixabay.com/get/new.jpg' }])
    assert.equal(merged.length, 40)
    assert.equal(merged[0].url, 'https://pixabay.com/get/new.jpg')
  })
})
