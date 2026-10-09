import { SecureSecrets } from '../storage/secure-secrets'
import { SettingsStore } from '../storage/settings-store'
import { ApiCircuitBreaker, ApiError, fetchWithRetry } from '../http/api-errors'
import type {
  PexelsPhoto,
  PexelsPhotoSearchInput,
  PexelsPhotoSearchResult,
  PexelsVideo,
  PexelsVideoSearchInput,
  PexelsVideoSearchResult
} from './pexels-types'
import type { PexelsQuotaSnapshot } from './pexels-rate-limit'
import { PexelsSearchCache } from './pexels-search-cache'
import {
  PixabayPhotoSearchResponseSchema,
  PixabayVideoSearchResponseSchema,
  buildPixabayByIdUrl,
  buildPixabayPhotoSearchUrl,
  buildPixabayVideoSearchUrl,
  mapPixabayPhoto,
  mapPixabayVideo,
  selectPixabayVideos
} from './pixabay-mapping'

const pixabayCircuit = new ApiCircuitBreaker(5, 60_000)

/** Pixabay counterpart of PexelsClient; returns Pexels-shaped results (see pixabay-mapping). */
export class PixabayClient {
  public static resetCircuit(): void {
    pixabayCircuit.reset()
  }

  private static async getApiKey(): Promise<string> {
    const key = await SecureSecrets.getSecret('pixabayKey')
    if (!key || !key.trim()) {
      throw new ApiError('Pixabay API Key is missing. Please set it in Settings.', 'permanent')
    }
    return key.trim()
  }

  private static async fetchPixabay(
    url: string,
    label: string,
    parentSignal?: AbortSignal
  ): Promise<Response> {
    pixabayCircuit.ensureClosed(label)

    const settings = await SettingsStore.getSettings()
    const timeoutMs = (settings.requestTimeoutSeconds || 60) * 1000
    const controller = new AbortController()

    if (parentSignal?.aborted) {
      throw new ApiError('Request aborted', 'permanent')
    }

    const onParentAbort = (): void => controller.abort()
    parentSignal?.addEventListener('abort', onParentAbort)
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetchWithRetry(url, {
        label,
        maxRetries: 3,
        init: { signal: controller.signal },
        isAborted: () => controller.signal.aborted
      })
      pixabayCircuit.recordSuccess()
      return response
    } catch (error) {
      // Caller cancel/pause must not open the circuit — only real upstream failures.
      if (!parentSignal?.aborted) {
        pixabayCircuit.recordFailure()
      }
      if (error instanceof ApiError && error.statusCode === 429) {
        throw new ApiError(
          'pixabay_rate_limited: Pixabay API rate limit reached.',
          'transient',
          429,
          error.retryAfterMs,
          error
        )
      }
      throw error
    } finally {
      clearTimeout(timeoutId)
      parentSignal?.removeEventListener('abort', onParentAbort)
    }
  }

  private static async getSearchOptions(): Promise<{ apiKey: string; safeSearch: boolean }> {
    const apiKey = await this.getApiKey()
    const settings = await SettingsStore.getSettings()
    return { apiKey, safeSearch: settings.skipExplicitQueries }
  }

  // Pixabay does not expose a long-lived quota (its limit is 100 requests per minute),
  // so there is nothing to snapshot; 429s are retried by fetchWithRetry.
  public static getQuotaSnapshot(): PexelsQuotaSnapshot | null {
    return null
  }

  public static isQuotaLow(): boolean {
    return false
  }

  public static async searchPhotos(
    input: PexelsPhotoSearchInput,
    abortSignal?: AbortSignal
  ): Promise<PexelsPhotoSearchResult> {
    const options = await this.getSearchOptions()
    const cacheKey = PexelsSearchCache.buildKey('photo', {
      ...input,
      source: 'pixabay',
      safeSearch: options.safeSearch
    })
    const cached = PexelsSearchCache.get<PexelsPhotoSearchResult>(cacheKey)
    if (cached) return cached

    const response = await this.fetchPixabay(
      buildPixabayPhotoSearchUrl(input, options),
      'Pixabay photo search',
      abortSignal
    )
    const data = PixabayPhotoSearchResponseSchema.parse(await response.json())
    const result: PexelsPhotoSearchResult = {
      total_results: data.totalHits,
      page: input.page,
      per_page: input.per_page,
      photos: data.hits.map(mapPixabayPhoto)
    }
    PexelsSearchCache.set(cacheKey, result)
    return result
  }

  public static async searchVideos(
    input: PexelsVideoSearchInput,
    abortSignal?: AbortSignal
  ): Promise<PexelsVideoSearchResult> {
    const options = await this.getSearchOptions()
    const cacheKey = PexelsSearchCache.buildKey('video', {
      ...input,
      source: 'pixabay',
      safeSearch: options.safeSearch
    })
    const cached = PexelsSearchCache.get<PexelsVideoSearchResult>(cacheKey)
    if (cached) return cached

    const response = await this.fetchPixabay(
      buildPixabayVideoSearchUrl(input, options),
      'Pixabay video search',
      abortSignal
    )
    const data = PixabayVideoSearchResponseSchema.parse(await response.json())
    const videos = selectPixabayVideos(data.hits, input)
    const result: PexelsVideoSearchResult = {
      // With a local orientation filter the upstream total no longer describes what is returned.
      total_results: input.orientation ? videos.length : data.totalHits,
      page: input.page,
      per_page: input.per_page,
      videos
    }
    PexelsSearchCache.set(cacheKey, result)
    return result
  }

  public static async getPhoto(id: number): Promise<PexelsPhoto> {
    const apiKey = await this.getApiKey()
    const response = await this.fetchPixabay(
      buildPixabayByIdUrl('photo', id, apiKey),
      'Pixabay get photo'
    )
    const data = PixabayPhotoSearchResponseSchema.parse(await response.json())
    if (!data.hits[0]) throw new ApiError(`Pixabay photo ${id} was not found.`, 'permanent')
    return mapPixabayPhoto(data.hits[0])
  }

  public static async getVideo(id: number): Promise<PexelsVideo> {
    const apiKey = await this.getApiKey()
    const response = await this.fetchPixabay(
      buildPixabayByIdUrl('video', id, apiKey),
      'Pixabay get video'
    )
    const data = PixabayVideoSearchResponseSchema.parse(await response.json())
    if (!data.hits[0]) throw new ApiError(`Pixabay video ${id} was not found.`, 'permanent')
    return mapPixabayVideo(data.hits[0])
  }
}
