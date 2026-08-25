import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import { FactionProvider } from '../faction/FactionContext'
import TugOfWar from './TugOfWar'

// Only fetchTally is replaced. subscribeTally and submitCheer stay real, so
// the "a cheer moves the bar" test below exercises the actual wiring between
// them rather than a mock of it.
vi.mock('./cheerClient', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchTally: vi.fn(),
}))
import { fetchTally, submitCheer } from './cheerClient'

const setup = () => render(<FactionProvider><TugOfWar /></FactionProvider>)

describe('TugOfWar', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.restoreAllMocks())

  it('splits the bar in proportion to the tally', async () => {
    fetchTally.mockResolvedValue({ utmist: 75, watai: 25 })
    setup()
    await waitFor(() => {
      expect(screen.getByTestId('tug-utmist')).toHaveStyle({ width: '75%' })
    })
  })

  it('sits at an even split when nobody has cheered', async () => {
    fetchTally.mockResolvedValue({ utmist: 0, watai: 0 })
    setup()
    await waitFor(() => {
      expect(screen.getByTestId('tug-utmist')).toHaveStyle({ width: '50%' })
    })
  })

  // Territory, never a scoreline: a side that is losing badly still holds ground.
  it('never lets either side fall below a visible floor', async () => {
    fetchTally.mockResolvedValue({ utmist: 1000, watai: 1 })
    setup()
    await waitFor(() => {
      const width = parseFloat(screen.getByTestId('tug-utmist').style.width)
      expect(width).toBeLessThanOrEqual(90)
      expect(width).toBeGreaterThanOrEqual(10)
    })
  })

  // The floor must only soften the *visual* width. With this same lopsided
  // tally, aria-valuenow has to report the true ~100 share, not the
  // floor-clamped ~90 the bar is drawn at — otherwise assistive tech hears
  // the softened number instead of the honest one. This is the one render
  // where raw and share actually diverge, so it's the only place a
  // regression that swaps one for the other would show up.
  it('reports the true unclamped share to assistive technology even when the floor is engaged', async () => {
    fetchTally.mockResolvedValue({ utmist: 1000, watai: 1 })
    setup()
    await waitFor(() => {
      const bar = screen.getByRole('meter')
      const width = parseFloat(screen.getByTestId('tug-utmist').style.width)
      expect(width).toBeLessThanOrEqual(90)
      expect(bar).toHaveAttribute('aria-valuenow', '100')
    })
  })

  it('does not show raw counts', async () => {
    fetchTally.mockResolvedValue({ utmist: 75, watai: 25 })
    setup()
    await waitFor(() => expect(screen.getByTestId('tug-utmist')).toBeInTheDocument())
    expect(screen.queryByText('75')).toBeNull()
    expect(screen.queryByText('25')).toBeNull()
  })

  it('exposes the split to assistive technology', async () => {
    fetchTally.mockResolvedValue({ utmist: 60, watai: 40 })
    setup()
    await waitFor(() => {
      const bar = screen.getByRole('meter')
      expect(bar).toHaveAttribute('aria-valuenow', '60')
      expect(bar).toHaveAttribute('aria-valuemin', '0')
      expect(bar).toHaveAttribute('aria-valuemax', '100')
    })
  })

  it('renders an even split when the tracker is unreachable', async () => {
    fetchTally.mockResolvedValue({ utmist: 0, watai: 0 })
    setup()
    await waitFor(() => {
      expect(screen.getByTestId('tug-utmist')).toHaveStyle({ width: '50%' })
    })
  })

  // The two fills are 1.71:1 apart — a hue change and nothing else, which
  // tritanopes and dim displays lose entirely. The boundary is the component.
  it('separates the two territories with more than a hue change', async () => {
    fetchTally.mockResolvedValue({ utmist: 50, watai: 50 })
    setup()
    await waitFor(() => expect(screen.getByTestId('tug-divide')).toBeInTheDocument())
    const divide = screen.getByTestId('tug-divide')
    expect(divide.className).toMatch(/bg-void/)
    expect(divide).toHaveAttribute('aria-hidden', 'true')
  })

  // The bar used to fetch once on mount and never again, so a visitor's own
  // cheer could not move it in their own session — even though submitCheer
  // already had the fresh tally in hand and was discarding it.
  it('follows the tally a cheer returns, without refetching', async () => {
    import.meta.env.VITE_SUPABASE_URL = 'http://localhost:54321'
    fetchTally.mockResolvedValue({ utmist: 50, watai: 50 })
    setup()
    await waitFor(() => {
      expect(screen.getByTestId('tug-utmist')).toHaveStyle({ width: '50%' })
    })

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ utmist: 80, watai: 20 }),
    }))
    // act(), because the publish lands as a state update outside React's
    // own event handling — the real one comes from FactionChoice in the hero.
    await act(async () => {
      await submitCheer({ faction: 'utmist', turnstileToken: 'tok' })
    })

    await waitFor(() => {
      expect(screen.getByTestId('tug-utmist')).toHaveStyle({ width: '80%' })
    })
    expect(fetchTally).toHaveBeenCalledTimes(1)
    vi.unstubAllGlobals()
  })
})
