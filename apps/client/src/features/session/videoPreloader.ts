type VideoStatus = 'idle' | 'loading' | 'ready' | 'failed';

class VideoPreloader {
  private cache: Map<string, VideoStatus> = new Map();
  private videos: Map<string, HTMLVideoElement> = new Map();

  /**
   * Предзагружает видео в фоне
   */
  preload(videoUrls: string[]): void {
    for (const url of videoUrls) {
      if (this.cache.get(url) !== 'idle' && this.cache.has(url)) {
        continue; // уже загружается или готово
      }

      this.cache.set(url, 'loading');
      const video = document.createElement('video');
      video.preload = 'auto';
      video.src = `/videos/${url}`;

      video.addEventListener('canplaythrough', () => {
        this.cache.set(url, 'ready');
        this.videos.set(url, video);
      });

      video.addEventListener('error', () => {
        this.cache.set(url, 'failed');
      });

      video.load();
    }
  }

  /**
   * Проверяет, готово ли видео
   */
  isReady(videoUrl: string): boolean {
    return this.cache.get(videoUrl) === 'ready';
  }

  /**
   * Получает предзагруженное видео (если готово)
   */
  getVideo(videoUrl: string): HTMLVideoElement | null {
    return this.videos.get(videoUrl) ?? null;
  }

  /**
   * Очищает кэш (при завершении сессии)
   */
  clear(): void {
    for (const video of this.videos.values()) {
      video.src = '';
    }
    this.cache.clear();
    this.videos.clear();
  }
}

export const videoPreloader = new VideoPreloader();
