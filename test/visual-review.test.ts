import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildVisualReviewUserContent,
  fetchFrameDataUrl,
  parseFrameReviews,
  sortByVisualMatch
} from '../src/main/services/agent/visual-review.ts'

test('parseFrameReviews maps 1-based frames to indexes and normalizes values', () => {
  const reviews = parseFrameReviews(
    JSON.stringify({
      reviews: [
        { frame: 1, description: 'Flowers and a butterfly', style: 'real footage', match: 0 },
        { frame: '2', description: 'Vase on a shelf', style: 'AI generated', match: 7 },
        { frame: 3, description: 'Cartoon desk', style: 'Animation', match: 1.6 }
      ]
    }),
    3
  )
  assert.deepEqual(reviews.get(0), {
    description: 'Flowers and a butterfly',
    style: 'real footage',
    match: 0
  })
  assert.equal(reviews.get(1)?.style, 'cgi or ai generated')
  assert.equal(reviews.get(1)?.match, 3)
  assert.equal(reviews.get(2)?.style, 'animation')
  assert.equal(reviews.get(2)?.match, 2)
})

test('parseFrameReviews ignores out-of-range and repeated frames', () => {
  const reviews = parseFrameReviews(
    JSON.stringify({
      reviews: [
        { frame: 0, description: 'x', style: 'real footage', match: 3 },
        { frame: 2, description: 'first', style: 'real footage', match: 3 },
        { frame: 2, description: 'second', style: 'real footage', match: 0 },
        { frame: 5, description: 'x', style: 'real footage', match: 3 }
      ]
    }),
    2
  )
  assert.deepEqual([...reviews.keys()], [1])
  assert.equal(reviews.get(1)?.description, 'first')
})

test('parseFrameReviews rejects malformed arguments', () => {
  assert.throws(() => parseFrameReviews('not json', 2))
  assert.throws(() => parseFrameReviews(JSON.stringify({ reviews: 'none' }), 2))
})

test('sortByVisualMatch puts strong matches first and keeps order within a score', () => {
  const sorted = sortByVisualMatch([
    { id: 'a', visualMatch: 0 },
    { id: 'b' },
    { id: 'c', visualMatch: 3 },
    { id: 'd', visualMatch: 2 },
    { id: 'e', visualMatch: 3 },
    { id: 'f', visualMatch: 1 }
  ])
  assert.deepEqual(
    sorted.map((result) => result.id),
    ['c', 'e', 'd', 'b', 'f', 'a']
  )
})

test('buildVisualReviewUserContent names the shot, the narration, and the frame count', () => {
  const content = buildVisualReviewUserContent({
    visualPrompt: 'hand folding blanket on sofa',
    beatText: 'Straighten the blanket.',
    frameCount: 4
  })
  assert.match(content, /hand folding blanket on sofa/)
  assert.match(content, /Straighten the blanket\./)
  assert.match(content, /numbered 1 to 4/)
})

test('fetchFrameDataUrl refuses hosts outside the stock CDNs', async () => {
  await assert.rejects(fetchFrameDataUrl('https://example.com/frame.jpg'), /not an allowed/)
  await assert.rejects(fetchFrameDataUrl('http://cdn.pixabay.com/frame.jpg'), /HTTPS required/)
})
