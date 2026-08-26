import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import useConfetti from './useConfetti'

/**
 * The burst can't be watched in an automated browser — a tab that isn't being
 * painted has requestAnimationFrame paused, so nothing draws no matter how
 * correct the code is. These pin the parts that don't need a visible frame:
 * whether it schedules work at all, whether it respects reduced motion, and
 * whether it cleans up after itself.
 */
function mockMotion(reduce) {
  window.matchMedia = vi.fn().mockImplementation((q) => ({
    matches: q.includes('prefers-reduced-motion') ? reduce : false,
    media: q,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

function attachCanvas(result) {
  const canvas = document.createElement('canvas')
  // jsdom has no 2d context; the hook only needs the calls not to throw.
  canvas.getContext = vi.fn(() => ({
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    fillRect: vi.fn(),
  }))
  result.current.canvasRef.current = canvas
  return canvas
}

describe('useConfetti', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('schedules a frame when motion is allowed', () => {
    mockMotion(false)
    const { result } = renderHook(() => useConfetti())
    attachCanvas(result)
    act(() => result.current.fire({ x: 100, y: 100 }, ['#fff']))
    expect(requestAnimationFrame).toHaveBeenCalled()
  })

  it('sizes the canvas to the viewport before drawing', () => {
    mockMotion(false)
    const { result } = renderHook(() => useConfetti())
    const canvas = attachCanvas(result)
    act(() => result.current.fire({ x: 10, y: 10 }, ['#fff']))
    expect(canvas.width).toBeGreaterThan(0)
    expect(canvas.height).toBeGreaterThan(0)
  })

  // The site gates every other animation on this; a burst of ninety tumbling
  // rectangles is exactly what someone with the preference set is avoiding.
  it('does nothing at all under prefers-reduced-motion', () => {
    mockMotion(true)
    const { result } = renderHook(() => useConfetti())
    const canvas = attachCanvas(result)
    act(() => result.current.fire({ x: 100, y: 100 }, ['#fff']))
    expect(requestAnimationFrame).not.toHaveBeenCalled()
    expect(canvas.getContext).not.toHaveBeenCalled()
    // 300 is the HTML default; the point is that fire() never resized it.
    expect(canvas.width).toBe(300)
  })

  it('survives being fired with no canvas mounted', () => {
    mockMotion(false)
    const { result } = renderHook(() => useConfetti())
    expect(() => result.current.fire({ x: 0, y: 0 }, ['#fff'])).not.toThrow()
  })

  it('cancels its frame loop on unmount', () => {
    mockMotion(false)
    const { result, unmount } = renderHook(() => useConfetti())
    attachCanvas(result)
    act(() => result.current.fire({ x: 100, y: 100 }, ['#fff']))
    unmount()
    expect(cancelAnimationFrame).toHaveBeenCalled()
  })

  it('replaces an in-flight burst rather than stacking loops', () => {
    mockMotion(false)
    const { result } = renderHook(() => useConfetti())
    attachCanvas(result)
    act(() => result.current.fire({ x: 100, y: 100 }, ['#fff']))
    act(() => result.current.fire({ x: 200, y: 200 }, ['#fff']))
    expect(cancelAnimationFrame).toHaveBeenCalled()
  })
})
