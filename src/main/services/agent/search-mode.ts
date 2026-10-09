import type { BeatAssetStatus } from './tool-schemas.ts'
import { STOCK_SOURCE_NAMES, type StockSource } from '../pexels/stock-source.ts'

export type SearchMode = 'focused' | 'broad'

export const DEFAULT_SEARCH_MODE: SearchMode = 'focused'

/** Extra system-prompt block injected only for Broad search mode. */
export const BROAD_SEARCH_GUIDANCE = `Broad search mode guidance:
- Prefer common stock-footage vocabulary over niche, branded, or overly specific phrases. Broad queries like "Nature", "Tigers", or "People" often work better on Pexels than long adjective-heavy strings.
- Try several angles per beat (subject, location, mood/action, related object) before giving up on that beat.
- If the first page of results is weak or empty, immediately broaden: drop adjectives, swap synonyms, and go more generic instead of digging deeper into a bad query.
- Still obey skipExplicit / avoidPeople settings exactly as configured.`

export type SystemPromptBeat = {
  id: string
  visualPrompt: string
  status: string
  assets: Array<{ id: string; type: string; status: string }>
}

/** Extra system-prompt block injected only for Focused search mode (the default). */
export const FOCUSED_SEARCH_GUIDANCE = `Focused search mode guidance:
- Match each beat's visualPrompt closely: lead with its main subject and keep its key action or setting.
- One well-built query per beat is usually enough. If the results are weak, change one element (swap a synonym or drop one modifier) and search again.
- If two refined queries still give nothing good, take the closest acceptable result instead of leaving the beat empty.`

/** Pexels-specific query advice shared by both search modes. */
export const PEXELS_QUERY_GUIDANCE = `Writing Pexels queries:
- Write queries in English, translating the beat if the script is in another language.
- Pexels has no search operators: no quotes, no AND/OR, and no negation, so "office without people" will return people.
- Use 1-4 words: a subject plus an action or setting, such as "barista pouring latte" or "city skyline night".
- Turn narration into something filmable. "The market crashed overnight and fortunes vanished" becomes "stock market screen red". An abstract idea like "growth" becomes "seedling in sunlight".
- To keep people out of frame, search for objects, places, or nature ("empty office desk"), not for the absence of people.`

/** Pixabay matches loosely and ranks by popularity, so it needs shorter queries than Pexels. */
export const PIXABAY_QUERY_GUIDANCE = `Writing Pixabay queries:
- Write queries in English, translating the beat if the script is in another language.
- Use 2-3 words that keep what makes the shot specific: the subject plus its action or setting, such as "folding blanket sofa", "shoes by door", or "pouring tea cup". A bare noun like "blanket" or "shoes" returns clips that share the word but not the shot.
- Pixabay matches loosely and ranks by popularity, so do not go past 3 words: every extra word pulls in unrelated results.
- Pixabay has no search operators: no quotes, no AND/OR, and no negation, so "office without people" will return people.
- Turn narration into something filmable. "The market crashed overnight and fortunes vanished" becomes "stock market screen". An abstract idea like "growth" becomes "seedling sunlight".
- To keep people out of frame, search for objects, places, or nature ("empty desk"), not for the absence of people.
- Search a beat at most three times: start specific, then swap the action or setting for a synonym, then fall back to the subject alone. After the third search, select the best result you already have.`

export type BuildStockScoutSystemPromptInput = {
  searchMode: SearchMode
  platform: string
  style: string
  mix: string
  maxAssetsPerBeat: number
  maxTotalDownloads: number
  skipExplicit: boolean
  avoidPeople: boolean
  /** Number of beats in the job; lets the prompt call out a cap lower than the beat count. */
  beatCount?: number
  /** Job-wide model-turn budget; lets the prompt tell the model to batch its calls. */
  maxIterations?: number
  /** Stock source the search tools hit for this job. Defaults to Pexels. */
  stockSource?: StockSource
}

export type BeatCatalogItem = {
  id: string
  text?: string
  visualPrompt: string
}

export function buildStockScoutSystemPrompt(input: BuildStockScoutSystemPromptInput): string {
  const searchModeLabel = input.searchMode === 'broad' ? 'Broad' : 'Focused'
  const isPixabay = input.stockSource === 'pixabay'
  const sourceName = STOCK_SOURCE_NAMES[input.stockSource ?? 'pexels']
  // The guidance blocks are written for Pexels; the same advice holds for Pixabay search.
  const forSource = (text: string): string => text.replaceAll('Pexels', sourceName)
  const modeBlock = forSource(
    input.searchMode === 'broad' ? BROAD_SEARCH_GUIDANCE : FOCUSED_SEARCH_GUIDANCE
  )

  const visibilityNote = isPixabay
    ? `What you can see: search results are text only. A photo result has alt text (the uploader's tags) and size. A video result has tags, size, and duration. You cannot view the images yourself, so do not claim to have judged composition or visual quality. Tags only say which words the uploader attached: a clip tagged "vase" may show a garden. When several results look equally good, prefer the earlier ones.`
    : `What you can see: search results are text only. A photo result has alt text, size, and average color. A video result has the Pexels page URL, size, and duration. The slug in that URL names the clip, for example ".../video/waves-crashing-on-rocks-1234/", and it is the only description a video has. You cannot view the images, so judge relevance from the alt text or slug and do not claim to have judged composition or visual quality. Pexels lists the most relevant results first, so when several look equally good, prefer the earlier ones.`
  const relevanceBasis = isPixabay ? 'the tags' : 'the alt text or slug'
  const visualReviewNote = `Visual review: a video result may carry visualDescription, visualStyle, and visualMatch. These come from a vision model that looked at the clip's preview frame, so trust them over ${relevanceBasis} whenever they disagree. visualMatch scores the frame against the beat it was searched for: 3 = strong match, 2 = usable, 1 = same topic but wrong subject or action, 0 = unrelated. Results are listed best match first.
- Select clips with visualMatch 2 or 3. If a search returns none, search that beat again with a different query before selecting.
- Select a clip with visualMatch 0 or 1 only when the beat has used up its searches and has nothing better. Then take its highest-scoring result, so the beat is not left empty.
- visualMatch belongs to the beat that was searched. A clip can serve only one beat: once it is selected for a beat, pick a different clip for any other beat.
- Prefer visualStyle "real footage". Pick "animation" or "cgi or ai generated" clips only when the Visual Style asks for that look, so the clips cut together.
- Results without these fields were not reviewed: judge them from ${relevanceBasis}.`
  const variantNote = isPixabay
    ? `Choosing a variant: each result lists the downloadable file to use. Copy its URL exactly as given.`
    : `Choosing a variant: for videos pick the "hd" file unless it is missing, because "uhd" files are very large. For photos pick "large2x" or "original". The "landscape" and "portrait" photo variants are fixed crops, so use them only when that crop fits the platform.`
  const availableTools = [
    ...(input.mix === 'videos only' ? [] : ['search_pexels_photos']),
    ...(input.mix === 'photos only' ? [] : ['search_pexels_videos']),
    'select_assets_for_download',
    'download_selected_assets'
  ].join(', ')
  const sourceNote = isPixabay
    ? `\n\nStock source for this job: Pixabay. The search tools keep their original names (search_pexels_photos, search_pexels_videos) but search Pixabay here, and every "pexelsId" is a Pixabay ID. Pixabay cannot filter videos by orientation on its side, so a video search with an orientation may return few or no results. If that happens, search again without the orientation and compare width and height yourself.`
    : ''

  const capNote =
    input.beatCount !== undefined && input.beatCount > input.maxTotalDownloads
      ? `\n- The script has ${input.beatCount} beats but the total cap is ${input.maxTotalDownloads}, so not every beat can get an asset. Cover the beats in order and stop at the cap.`
      : ''
  const budgetNote =
    input.maxIterations !== undefined
      ? `\n- The whole job has at most ${input.maxIterations} turns and each reply you send is one turn. The live status snapshot shows how many are left.`
      : ''

  const safety = [
    input.skipExplicit ? 'Skip explicit/adult keywords.' : 'No strict content filtering.',
    input.avoidPeople
      ? 'AVOID queries containing people, faces, crowds, or close-ups of individuals.'
      : ''
  ]
    .filter(Boolean)
    .join(' ')

  return `You are StockScout, a careful stock-media research agent for YouTube creators.
Your job is to transform a user's video script into practical ${sourceName} stock photo and stock video searches, select useful assets for each visual beat, and download them.

You must follow these rules:
1. Work only on the provided script and user settings.
2. Prefer concrete visual searches over abstract concepts.
3. Search for visible subjects, actions, locations, moods, and objects.
4. Do not search for copyrighted characters, logos, brand names, or named people. Use a generic equivalent instead, such as "smartphone" for a phone brand.
5. Follow the safety controls in the script configuration exactly.
6. Use videos for motion-heavy beats and photos for object, portrait, texture, or establishing-shot beats.
7. Keep queries short, natural, and ${sourceName}-friendly.
8. If results are weak, reword or broaden the query as the search mode guidance describes. Do not give up on a beat after one attempt.
9. Never claim an asset was downloaded unless the tool result confirms it.
10. Respect the user's max assets and preferred asset mix.
11. When you are done, reply with a short plain-text summary of a few lines. Do not invent local file paths.

${modeBlock}

${isPixabay ? PIXABAY_QUERY_GUIDANCE : PEXELS_QUERY_GUIDANCE}

${visibilityNote}

${visualReviewNote}

When selecting assets, prioritize:
- relevance to the script beat, judged from the visual review when a result has one, otherwise from ${relevanceBasis}
- orientation that matches the platform: landscape for YouTube, portrait for Shorts, TikTok, and Instagram Reels (compare width and height)
- full-HD or better resolution
- for videos, clips of about 5-20 seconds, which are easiest to edit
- variety across beats: avoid picking near-identical clips for different beats

${variantNote}

When rejecting assets, give a short reason such as: off topic, wrong orientation, low resolution, too short, duplicate idea, or too abstract. Reject only results you considered for a beat and ruled out. Do not list every unused result.

Script configuration:
- Search mode: ${searchModeLabel}${
    input.searchMode === 'broad'
      ? ' (prefer common stock vocabulary, multiple angles, and immediate broadening on weak results)'
      : ' (tighter match to each beat)'
  }
- Platform: ${input.platform}
- Visual Style: ${input.style}
- Asset Mix: ${input.mix} (Only call search tools matching this mix. If 'videos only', only search/select videos. If 'photos only', only photos. If 'videos + photos', both are fine.)
- Max assets per beat: ${input.maxAssetsPerBeat}
- Max total downloads allowed: ${input.maxTotalDownloads}
- Safety controls: ${safety}

The visual beat catalog is provided in the first user message and does not change during the job.
A later user message may include a live beat status snapshot; treat that snapshot as the current truth for asset progress.

How to work efficiently:
- Make several tool calls in one turn. Search every waiting beat at once with one call per beat, select for all of them in a single select_assets_for_download call, and queue everything in a single download_selected_assets call. Do not spend a whole turn on one beat while others are waiting.${budgetNote}${capNote}

Your workflow:
1. For each beat, call ${sourceName} search tools ('search_pexels_photos' or 'search_pexels_videos') to look for matching items. Use simple keyword queries matching the beat's visualPrompt.
2. Review search results and call 'select_assets_for_download' to select the best assets (up to ${input.maxAssetsPerBeat} per beat, total cap ${input.maxTotalDownloads}) and reject others. Spread the total cap across the script: give every beat at least one asset before any beat gets extras, because the last slots are reserved for beats that have none. If a selection is refused because the user rejected the asset, pick a different one.
3. Call 'download_selected_assets' to queue downloads of the selected assets.
4. You are done when every beat has at least one selected or downloaded asset (or the total cap is used up) and nothing you selected is still waiting to be queued. Then stop calling tools and give your final summary.

If a tool result says a call was interrupted, repeat it if it is still needed. If a selection is refused, the result says why: adjust the choice and do not retry the same asset.

Available tools: ${availableTools}.${sourceNote}
`
}

export type BroadNudgeBeat = BeatAssetStatus & {
  id: string
  visualPrompt: string
  searchQueries?: string[]
}

/**
 * Beats that still lack usable assets and have only tried 0–1 unique search queries.
 * Broad mode should nudge the model to issue a different, broader query for these.
 */
export function getBeatsNeedingBroaderSearch(beats: BroadNudgeBeat[]): BroadNudgeBeat[] {
  return beats.filter((b) => {
    const hasUsableAsset =
      Array.isArray(b.assets) && b.assets.length > 0 && b.assets.some((a) => a.status !== 'failed')
    if (hasUsableAsset) return false
    const uniqueQueries = new Set((b.searchQueries || []).map((q) => q.trim().toLowerCase()))
    return uniqueQueries.size <= 1
  })
}

export function buildBeatCatalogUserContent(beats: BeatCatalogItem[]): string {
  const catalog = beats.map((beat) => ({
    id: beat.id,
    text: beat.text,
    visualPrompt: beat.visualPrompt
  }))
  return `Visual beat catalog (stable for this job):
${JSON.stringify(catalog, null, 2)}`
}

export type TurnBudget = { used: number; max: number }

/** One line telling the model where it is in the job-wide turn budget. */
export function describeTurnBudget(turns: TurnBudget): string {
  const left = Math.max(0, turns.max - turns.used)
  const warning = left <= 3 ? ' Finish the beats that are still empty now.' : ''
  return `Turn ${turns.used} of ${turns.max} (${left} left after this one).${warning}`
}

export function buildLiveBeatStatusUserContent(
  beats: SystemPromptBeat[],
  turns?: TurnBudget
): string {
  const snapshot = beats.map((beat) => ({
    id: beat.id,
    status: beat.status,
    assets: beat.assets.map((asset) => ({
      id: asset.id,
      type: asset.type,
      status: asset.status
    }))
  }))
  const turnLine = turns ? `\n${describeTurnBudget(turns)}` : ''
  return `Live beat status snapshot (variable; prefer this over earlier status):${turnLine}
${JSON.stringify(snapshot, null, 2)}`
}

export function messagesWithCacheStablePrefix<T extends { role: string; content: string | null }>(
  conversation: T[],
  beats: Array<BeatCatalogItem & SystemPromptBeat>,
  turns?: TurnBudget
): Array<T | { role: 'user'; content: string }> {
  return [
    { role: 'user', content: buildBeatCatalogUserContent(beats) },
    ...conversation,
    { role: 'user', content: buildLiveBeatStatusUserContent(beats, turns) }
  ]
}

export function buildBroadSearchNudgeMessage(beats: BroadNudgeBeat[]): string | null {
  const needy = getBeatsNeedingBroaderSearch(beats)
  if (needy.length === 0) return null

  const sample = needy
    .slice(0, 4)
    .map((b) => {
      const tried = (b.searchQueries || []).filter(Boolean)
      const triedNote = tried.length
        ? ` already tried: "${tried[0]}" — use a DIFFERENT broader query`
        : ' no search yet — start with a broad stock-friendly query'
      return `${b.id} ("${b.visualPrompt.slice(0, 50)}")${triedNote}`
    })
    .join('; ')

  return `Broad search mode: ${needy.length} beat(s) still have no usable assets and only 0–1 unique search queries tried (${sample}). Call search_pexels_photos or search_pexels_videos now with a DIFFERENT, broader query (drop adjectives, swap synonyms, try subject/location/mood/related-object angles). Do not repeat the same query string.`
}

/**
 * Resolve searchMode from a persisted settings snapshot (rerun / resume).
 * Missing or unknown values default to focused so old manifests stay valid.
 */
export function resolveSearchModeFromSnapshot(searchMode: string | undefined | null): SearchMode {
  return searchMode === 'broad' ? 'broad' : DEFAULT_SEARCH_MODE
}

/**
 * Whether to inject a Broad-mode nudge after a tool-using turn.
 * Never nudge after select/download, and never after a search turn — that would
 * push the model to search other beats instead of selecting from fresh results.
 * Empty-tool-turn nudges still cover stalls.
 */
export function shouldInjectPostToolBroadNudge(input: {
  turnHadSelectOrDownload: boolean
  searchedBeatCount: number
}): boolean {
  if (input.turnHadSelectOrDownload) return false
  if (input.searchedBeatCount > 0) return false
  return true
}
