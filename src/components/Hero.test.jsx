import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FactionProvider } from '../faction/FactionContext'
import Hero from './Hero'

// Hero renders FactionChoice, which now renders TugOfWar. That fetches a
// tally on mount and updates state, which is act() noise in tests about the
// hero's own composition. The bar has its own suite.
vi.mock('../cheer/TugOfWar', () => ({ default: () => null }))


function mockReducedMotion(reduce) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: query.includes('prefers-reduced-motion') ? reduce : false,
    media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  }))
}

const setup = () => render(<FactionProvider><Hero /></FactionProvider>)

describe('Hero', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  /**
   * The regression this exists for: the hero opened with a 6.5s crawl and
   * mounted nothing else until its animation ended. Everything below --
   * including the hand and the whole poll -- was unreachable until then, and
   * on a browser that pauses animations in a background tab it never arrived
   * at all. Motion is *allowed* here on purpose: that was the failing case,
   * since the reduced-motion path already resolved immediately.
   */
  it('renders its content on the first paint, with motion allowed', () => {
    mockReducedMotion(false)
    setup()
    expect(
      screen.getByRole('heading', { name: /battle of the schools/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /vote uoft/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /vote waterloo/i })).toBeInTheDocument()
    expect(screen.getByAltText('')).toBeInTheDocument()
  })

  it('renders the same content under prefers-reduced-motion', () => {
    mockReducedMotion(true)
    setup()
    expect(
      screen.getByRole('heading', { name: /battle of the schools/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /vote uoft/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /vote waterloo/i })).toBeInTheDocument()
  })

  // Nothing may reintroduce a gate: no skip control, and no leftover stage.
  it('has no intro to skip', () => {
    mockReducedMotion(false)
    const { container } = setup()
    expect(screen.queryByRole('button', { name: /skip/i })).toBeNull()
    expect(container.querySelector('.crawl-stage')).toBeNull()
  })

  it('offers a functional faction choice once the intro has resolved', async () => {
    mockReducedMotion(true)
    const user = userEvent.setup()
    setup()

    await user.click(screen.getByRole('button', { name: /vote uoft/i }))
    await user.click(screen.getByRole('button', { name: /^confirm$/i }))

    expect(document.documentElement.getAttribute('data-faction')).toBe('utmist')
  })

  it('renders the hand as decorative', () => {
    mockReducedMotion(true)
    setup()

    const hand = screen.getByAltText('')
    expect(hand.tagName).toBe('IMG')
    expect(hand.className).toMatch(/pointer-events-none/)
  })

  it('never places the hand inside either faction card', () => {
    mockReducedMotion(true)
    setup()

    const hand = screen.getByAltText('')
    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBeGreaterThan(0)
    for (const button of buttons) {
      expect(button.contains(hand)).toBe(false)
    }
  })

  it('never applies the accent colour to the hand or its container', () => {
    mockReducedMotion(true)
    setup()

    const hand = screen.getByAltText('')
    expect(hand.className).not.toMatch(/accent/)
    expect(hand.parentElement.className).not.toMatch(/accent/)
  })
})
