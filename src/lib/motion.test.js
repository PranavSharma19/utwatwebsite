import { describe, it, expect, vi, afterEach } from 'vitest'
import { prefersReducedMotion, scrollBehavior } from './motion'

const mockReduce = (reduce) =>
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
    matches: query.includes('prefers-reduced-motion') ? reduce : false,
    media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  }))

describe('motion preference', () => {
  afterEach(() => vi.restoreAllMocks())

  it('reads the preference', () => {
    mockReduce(true)
    expect(prefersReducedMotion()).toBe(true)
    vi.restoreAllMocks()
    mockReduce(false)
    expect(prefersReducedMotion()).toBe(false)
  })

  // src/index.css neutralises CSS `scroll-behavior` under the same query, but
  // that property does not govern a scripted window.scrollTo({ behavior:
  // 'smooth' }) — the Navbar and Footer nav jumps have to opt out explicitly.
  it('hands window.scrollTo an instant behavior under reduced motion', () => {
    mockReduce(true)
    expect(scrollBehavior()).toBe('auto')
  })

  it('keeps smooth scrolling for everyone else', () => {
    mockReduce(false)
    expect(scrollBehavior()).toBe('smooth')
  })

  it('does not assume matchMedia exists', () => {
    const original = window.matchMedia
    delete window.matchMedia
    expect(prefersReducedMotion()).toBe(false)
    expect(scrollBehavior()).toBe('smooth')
    window.matchMedia = original
  })
})
