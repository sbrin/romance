
import { API_BASE_URL } from '../../api/http'

type VideoStatus = 'idle' | 'loading' | 'ready' | 'failed'

class VideoPreloader {
  private cache: Map<string, VideoStatus> = new Map()
  private blobUrls: Map<string, string> = new Map()

  /**
   * Предзагружает видео в фоне используя fetch для полной загрузки
   */
  async preload(videoUrls: string[]): Promise<void> {
    const baseUrl = API_BASE_URL ? API_BASE_URL.replace(/\/$/, '') : ''

    for (const url of videoUrls) {
      if (this.cache.get(url) !== 'idle' && this.cache.has(url)) {
        continue // уже загружается или готово
      }

      this.cache.set(url, 'loading')

      try {
        const fullUrl = `${baseUrl}/videos/${url}`
        const response = await fetch(fullUrl)
        if (!response.ok) {
          throw new Error(`Failed to load video: ${response.statusText}`)
        }
        const blob = await response.blob()
        const blobUrl = URL.createObjectURL(blob)

        this.blobUrls.set(url, blobUrl)
        this.cache.set(url, 'ready')
      } catch (error) {
        console.error(`Failed to preload video ${url}`, error)
        this.cache.set(url, 'failed')
      }
    }
  }

  /**
   * Проверяет, готово ли видео
   */
  isReady(videoUrl: string): boolean {
    return this.cache.get(videoUrl) === 'ready'
  }

  /**
   * Получает URL предзагруженного видео (если готово)
   */
  getVideoUrl(videoUrl: string): string | null {
    return this.blobUrls.get(videoUrl) ?? null
  }

  /**
   * Очищает кэш (при завершении сессии)
   */
  clear(): void {
    for (const url of this.blobUrls.values()) {
      URL.revokeObjectURL(url)
    }
    this.blobUrls.clear()
    this.cache.clear()
  }
}

export const videoPreloader = new VideoPreloader()
