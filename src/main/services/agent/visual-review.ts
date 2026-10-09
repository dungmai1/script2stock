import { z } from 'zod'
import type { NormalizedToolDefinition } from '../llm/llm-provider.ts'
import { validateDownloadUrl } from '../pexels/download-url-validation.ts'

/**
 * Stock search results are text only (tags, slugs), and those often describe a clip
 * that looks nothing like what the beat needs. A visual review shows the preview
 * frames to a vision model so selection is based on what is actually in the picture.
 */

export const VISUAL_REVIEW_TOOL_NAME = 'submit_frame_reviews'

/** Frames sent in one review call; more than this makes replies slow and less careful. */
export const MAX_FRAMES_PER_REVIEW = 12
/** A preview frame larger than this is skipped instead of being sent to the model. */
export const MAX_FRAME_BYTES = 1_500_000

export const VISUAL_STYLES = ['real footage', 'animation', 'cgi or ai generated'] as const
export type VisualStyle = (typeof VISUAL_STYLES)[number]

export type FrameReview = {
  /** What is actually visible in the frame. */
  description: string
  style: VisualStyle
  /** 0 = unrelated, 1 = same topic but wrong subject or action, 2 = usable, 3 = strong match. */
  match: number
}

export const VISUAL_REVIEW_TOOL: NormalizedToolDefinition = {
  name: VISUAL_REVIEW_TOOL_NAME,
  description: 'Submit one review per preview frame, in the order the frames were given.',
  parameters: {
    type: 'object',
    properties: {
      reviews: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            frame: { type: 'number', description: 'Frame number, starting at 1.' },
            description: {
              type: 'string',
              description: 'What is visible in the frame, in at most 15 words.'
            },
            style: { type: 'string', enum: [...VISUAL_STYLES] },
            match: {
              type: 'number',
              description:
                '0 = unrelated, 1 = same topic but wrong subject or action, 2 = usable, 3 = strong match.'
            }
          },
          required: ['frame', 'description', 'style', 'match']
        }
      }
    },
    required: ['reviews']
  }
}

export const VISUAL_REVIEW_SYSTEM_PROMPT = `You review preview frames of stock video clips for a video editor.
For each frame, say what is actually visible and how well it fits the wanted shot.

Rules:
1. Describe only what you can see. Do not guess from the wanted shot.
2. Score the match strictly. The main subject and the action or setting must both fit to score 2 or 3. A frame that only shares a loose theme scores 1. A frame showing something else scores 0.
3. Set style to "animation" for cartoons, anime, or flat illustrations, to "cgi or ai generated" for rendered or AI-looking images, and to "real footage" for camera footage.

Call ${VISUAL_REVIEW_TOOL_NAME} once with one review per frame.`

export function buildVisualReviewUserContent(input: {
  visualPrompt: string
  beatText?: string
  frameCount: number
}): string {
  const narration = input.beatText ? `\nNarration it plays under: "${input.beatText}"` : ''
  return `Wanted shot: "${input.visualPrompt}"${narration}

${input.frameCount} preview frame(s) follow, numbered 1 to ${input.frameCount} in order.`
}

const ReviewArgsSchema = z.object({
  reviews: z.array(
    z.object({
      frame: z.coerce.number().int(),
      description: z.string().trim().min(1).max(300),
      style: z.string(),
      match: z.coerce.number()
    })
  )
})

function normalizeStyle(style: string): VisualStyle {
  const lower = style.toLowerCase()
  if (lower.includes('anim')) return 'animation'
  if (lower.includes('cgi') || lower.includes('ai')) return 'cgi or ai generated'
  return 'real footage'
}

/** Parses the tool arguments into reviews keyed by zero-based frame index. */
export function parseFrameReviews(
  rawArguments: string,
  frameCount: number
): Map<number, FrameReview> {
  const parsed = ReviewArgsSchema.parse(JSON.parse(rawArguments))
  const reviews = new Map<number, FrameReview>()
  for (const review of parsed.reviews) {
    const index = review.frame - 1
    if (index < 0 || index >= frameCount || reviews.has(index)) continue
    reviews.set(index, {
      description: review.description,
      style: normalizeStyle(review.style),
      match: Math.min(3, Math.max(0, Math.round(review.match)))
    })
  }
  return reviews
}

/**
 * Best-looking results first, so the model reads the strongest candidates before the
 * weak ones. Unreviewed results keep their place after reviewed ones of equal score.
 */
export function sortByVisualMatch<T extends { visualMatch?: number }>(results: T[]): T[] {
  return results
    .map((result, index) => ({ result, index }))
    .sort(
      (a, b) => (b.result.visualMatch ?? 1.5) - (a.result.visualMatch ?? 1.5) || a.index - b.index
    )
    .map((entry) => entry.result)
}

/** Downloads one preview frame from the stock CDN and returns it as a base64 data URL. */
export async function fetchFrameDataUrl(url: string, abortSignal?: AbortSignal): Promise<string> {
  validateDownloadUrl(url)
  const timeout = AbortSignal.timeout(15_000)
  const response = await fetch(url, {
    signal: abortSignal ? AbortSignal.any([abortSignal, timeout]) : timeout
  })
  if (!response.ok) throw new Error(`Preview frame request failed: HTTP ${response.status}`)
  const contentType = (response.headers.get('content-type') || '').split(';')[0].trim()
  if (!contentType.startsWith('image/')) {
    throw new Error(`Preview frame is not an image: ${contentType || 'unknown type'}`)
  }
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.length > MAX_FRAME_BYTES) {
    throw new Error(`Preview frame is too large: ${bytes.length} bytes`)
  }
  return `data:${contentType};base64,${bytes.toString('base64')}`
}
