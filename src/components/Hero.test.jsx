import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FactionProvider } from '../faction/FactionContext'
import Hero from './Hero'

// Hero renders FactionChoice, which now renders TugOfWar. That fetches a
// tally on mount and updates state, which is act() noise in tests about the
// hero's own composition. The bar has its own suite.
vi.mock('../cheer/TugOfWar', () => ({ default: () => null }))


// Byte-exact, approved crawl copy — see task-10a-brief.md. Do not reword,
// re-punctuate, or "improve" this string. The dash is an em dash (U+2014).
const CRAWL_COPY =
  'Toronto and Waterloo. Thirty-six hours, one weekend, and whichever school scores highest across all of its teams takes the Maple Cup.'

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

  it('renders the approved crawl copy verbatim, byte-exact', () => {
    mockReducedMotion(false)
    setup()
    expect(screen.getByText(CRAWL_COPY)).toBeInTheDocument()
  })

  it('advances past the crawl immediately under prefers-reduced-motion, with no interaction', () => {
    mockReducedMotion(true)
    setup()
    expect(
      screen.getByRole('heading', { name: /battle of the schools/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /vote uoft/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /vote waterloo/i })).toBeInTheDocument()
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
