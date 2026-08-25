import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FactionProvider } from '../faction/FactionContext'
import Hero from './Hero'

// Byte-exact, approved crawl copy — see task-10a-brief.md. Do not reword,
// re-punctuate, or "improve" this string. The dash is an em dash (U+2014).
const CRAWL_COPY =
  'Two schools. Thirty-six hours. One arena. UTMIST and WAT.ai send their finest builders to settle it the only way that matters — in code.'

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
    expect(screen.getByRole('button', { name: /utmist/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /wat\.ai/i })).toBeInTheDocument()
  })

  it('offers a functional faction choice once the intro has resolved', async () => {
    mockReducedMotion(true)
    const user = userEvent.setup()
    setup()

    await user.click(screen.getByRole('button', { name: /utmist/i }))

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
