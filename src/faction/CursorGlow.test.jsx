import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import CursorGlow from './CursorGlow'

function mockMedia({ reduce = false, coarse = false } = {}) {
  window.matchMedia = vi.fn().mockImplementation((q) => ({
    matches: q.includes('prefers-reduced-motion') ? reduce
           : q.includes('pointer: coarse') ? coarse : false,
    media: q, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  }))
}

describe('CursorGlow', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('renders on a fine pointer with motion allowed', () => {
    mockMedia()
    const { container } = render(<CursorGlow />)
    expect(container.querySelector('[data-cursor-glow]')).toBeInTheDocument()
  })

  it('renders nothing on touch devices', () => {
    mockMedia({ coarse: true })
    const { container } = render(<CursorGlow />)
    expect(container.querySelector('[data-cursor-glow]')).toBeNull()
  })

  it('renders nothing under prefers-reduced-motion', () => {
    mockMedia({ reduce: true })
    const { container } = render(<CursorGlow />)
    expect(container.querySelector('[data-cursor-glow]')).toBeNull()
  })

  it('is inert and hidden from assistive technology', () => {
    mockMedia()
    const { container } = render(<CursorGlow />)
    const glow = container.querySelector('[data-cursor-glow]')
    expect(glow).toHaveAttribute('aria-hidden', 'true')
    expect(glow.className).toMatch(/pointer-events-none/)
  })

  it('attaches a pointermove listener when enabled', () => {
    mockMedia()
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener')

    render(<CursorGlow />)

    expect(addEventListenerSpy).toHaveBeenCalledWith(
      'pointermove',
      expect.any(Function),
      expect.anything()
    )
  })

  it('never attaches a pointermove listener on touch devices', () => {
    mockMedia({ coarse: true })
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener')

    render(<CursorGlow />)

    expect(addEventListenerSpy).not.toHaveBeenCalledWith(
      'pointermove',
      expect.any(Function),
      expect.anything()
    )
  })

  it('never attaches a pointermove listener under prefers-reduced-motion', () => {
    mockMedia({ reduce: true })
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener')

    render(<CursorGlow />)

    expect(addEventListenerSpy).not.toHaveBeenCalledWith(
      'pointermove',
      expect.any(Function),
      expect.anything()
    )
  })
})
