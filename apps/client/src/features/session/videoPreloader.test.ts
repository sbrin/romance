import test from 'node:test'
import assert from 'node:assert/strict'
import { videoPreloader } from './videoPreloader'


test('videoPreloader exports required methods', () => {
  assert.equal(typeof videoPreloader.preload, 'function')
  assert.equal(typeof videoPreloader.isReady, 'function')
  assert.equal(typeof videoPreloader.getVideoUrl, 'function')
  assert.equal(typeof videoPreloader.clear, 'function')
})

test('isReady returns false for non-preloaded videos', () => {
  videoPreloader.clear()
  assert.equal(videoPreloader.isReady('test-video.mp4'), false)
})

test('getVideoUrl returns null for non-preloaded videos', () => {
  videoPreloader.clear()
  assert.equal(videoPreloader.getVideoUrl('test-video.mp4'), null)
})

test('clear does not throw errors', () => {
  assert.doesNotThrow(() => {
    videoPreloader.clear()
  })
})

// Note: Full DOM-dependent tests (preload, canplaythrough events, etc.)
// require a browser environment and should be tested with E2E tools like Playwright
