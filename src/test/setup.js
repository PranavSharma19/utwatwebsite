import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// jsdom does not implement window.matchMedia; components that check
// prefers-reduced-motion (e.g. Starfield) need this to avoid throwing.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })
}

afterEach(() => {
  cleanup()
  document.documentElement.removeAttribute('data-faction')
  // The crawl records a "seen" flag here; without this, the first test to
  // render it would suppress the animation for every test after it.
  try {
    window.sessionStorage.clear()
  } catch {
    /* not available in every environment */
  }
})
