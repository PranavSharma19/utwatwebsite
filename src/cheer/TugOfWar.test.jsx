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
    fetchTally.mockResolvedValue({ utmist: 75, watai: 25, reachable: true })
    setup()
    await waitFor(() => {
      expect(screen.getByTestId('tug-utmist')).toHaveStyle({ width: '75%' })
    })
  })

  // Visitors asked what the two percentages were of -- applicants? attendees?
  // The label answers it, and it answers it before the first vote lands too,
  // when both numbers are still em dashes.
  it('says what the percentages are a share of, in every state', async () => {
    fetchTally.mockResolvedValue({ utmist: 75, watai: 25, reachable: true })
    const { unmount } = setup()
    await waitFor(() => expect(screen.getByText(/share of the vote/i)).toBeInTheDocument())
    unmount()

    fetchTally.mockResolvedValue({ utmist: 0, watai: 0, reachable: true })
    setup()
    await waitFor(() => expect(screen.getByText(/share of the vote/i)).toBeInTheDocument())
  })

  it('sits at an even split when nobody has cheered', async () => {
    fetchTally.mockResolvedValue({ utmist: 0, watai: 0, reachable: true })
    setup()
    await waitFor(() => {
      expect(screen.getByTestId('tug-utmist')).toHaveStyle({ width: '50%' })
    })
  })

  // Territory, never a scoreline: a side that is losing badly still holds ground.
  it('never lets either side fall below a visible floor', async () => {
    fetchTally.mockResolvedValue({ utmist: 1000, watai: 1, reachable: true })
    setup()
    await waitFor(() => {
      const width = parseFloat(screen.getByTestId('tug-utmist').style.width)
      expect(width).toBeLessThanOrEqual(90)
      expect(width).toBeGreaterThanOrEqual(10)
    })
  })

  // Caught on the live site with a single real vote: the caption read
  // "1 vote" while the meter's own label read "1 votes".
  it('says "1 vote", not "1 votes", to assistive technology', async () => {
    fetchTally.mockResolvedValue({ utmist: 1, watai: 0, reachable: true })
    setup()
    await waitFor(() => {
      expect(screen.getByRole('meter').getAttribute('aria-valuetext')).toContain('1 vote')
      expect(screen.getByRole('meter').getAttribute('aria-valuetext')).not.toContain('1 votes')
      expect(screen.getByTestId('tug-caption')).toHaveTextContent(/^1 vote$/)
    })
  })

  it('pluralises normally above one', async () => {
    fetchTally.mockResolvedValue({ utmist: 2, watai: 1, reachable: true })
    setup()
    await waitFor(() => {
      expect(screen.getByRole('meter').getAttribute('aria-valuetext')).toContain('3 votes')
    })
  })

  // What the floor must NOT do: manufacture territory for a side with no
  // votes. At 100/0 the bar drew 90/10 under a label reading 100%, so a strip
  // of Waterloo gold sat there with nothing behind it.
  it('gives a shut-out side no territory at all', async () => {
    fetchTally.mockResolvedValue({ utmist: 7, watai: 0, reachable: true })
    setup()
    await waitFor(() => {
      expect(screen.getByTestId('tug-utmist')).toHaveStyle({ width: '100%' })
      expect(screen.getByTestId('tug-watai')).toHaveStyle({ width: '0%' })
    })
  })

  it('gives a shut-out side no territory in the other direction either', async () => {
    fetchTally.mockResolvedValue({ utmist: 0, watai: 3, reachable: true })
    setup()
    await waitFor(() => {
      expect(screen.getByTestId('tug-utmist')).toHaveStyle({ width: '0%' })
      expect(screen.getByTestId('tug-watai')).toHaveStyle({ width: '100%' })
    })
  })

  // The bar and the number have to agree once nothing is being softened.
  it('draws the bar at exactly the number it prints during a shut-out', async () => {
    fetchTally.mockResolvedValue({ utmist: 7, watai: 0, reachable: true })
    setup()
    await waitFor(() => {
      expect(screen.getByText('100%')).toBeInTheDocument()
      expect(screen.getByTestId('tug-utmist')).toHaveStyle({ width: '100%' })
    })
  })

  // The floor must only soften the *visual* width. With this same lopsided
  // tally, aria-valuenow has to report the true ~100 share, not the
  // floor-clamped ~90 the bar is drawn at — otherwise assistive tech hears
  // the softened number instead of the honest one. This is the one render
  // where raw and share actually diverge, so it's the only place a
  // regression that swaps one for the other would show up.
  it('reports the true unclamped share to assistive technology even when the floor is engaged', async () => {
    fetchTally.mockResolvedValue({ utmist: 1000, watai: 1, reachable: true })
    setup()
    await waitFor(() => {
      const bar = screen.getByRole('meter')
      const width = parseFloat(screen.getByTestId('tug-utmist').style.width)
      expect(width).toBeLessThanOrEqual(90)
      expect(bar).toHaveAttribute('aria-valuenow', '100')
    })
  })

  // It has to read as a poll, so it shows numbers. Shares and a turnout, not
  // two raw scores: the event is co-hosted, and a bare scoreline puts one of
  // the two host orgs on their own homepage losing.
  it('shows each side its share, and the turnout', async () => {
    fetchTally.mockResolvedValue({ utmist: 75, watai: 25, reachable: true })
    setup()
    await waitFor(() => expect(screen.getByText('75%')).toBeInTheDocument())
    expect(screen.getByText('25%')).toBeInTheDocument()
    expect(screen.getByText(/100 votes/)).toBeInTheDocument()
  })

  it('does not print the two sides as raw scores', async () => {
    fetchTally.mockResolvedValue({ utmist: 75, watai: 25, reachable: true })
    setup()
    await waitFor(() => expect(screen.getByText('75%')).toBeInTheDocument())
    expect(screen.queryByText('75')).toBeNull()
    expect(screen.queryByText('25')).toBeNull()
  })

  it('invites the first vote instead of showing a hollow 50/50', async () => {
    fetchTally.mockResolvedValue({ utmist: 0, watai: 0, reachable: true })
    setup()
    await waitFor(() => expect(screen.getByText(/no votes yet/i)).toBeInTheDocument())
    expect(screen.queryByText('50%')).toBeNull()
  })

  // The floor is a visual courtesy for the bar. The number must stay honest.
  it('reports the true share even when the bar is floored', async () => {
    fetchTally.mockResolvedValue({ utmist: 1000, watai: 1, reachable: true })
    setup()
    await waitFor(() => expect(screen.getByText('100%')).toBeInTheDocument())
    const width = parseFloat(screen.getByTestId('tug-utmist').style.width)
    expect(width).toBeLessThanOrEqual(90)
  })

  it('says vote, not votes, for a single vote', async () => {
    fetchTally.mockResolvedValue({ utmist: 1, watai: 0, reachable: true })
    setup()
    await waitFor(() => expect(screen.getByText(/1 vote$/)).toBeInTheDocument())
  })

  it('exposes the split to assistive technology', async () => {
    fetchTally.mockResolvedValue({ utmist: 60, watai: 40, reachable: true })
    setup()
    await waitFor(() => {
      const bar = screen.getByRole('meter')
      expect(bar).toHaveAttribute('aria-valuenow', '60')
      expect(bar).toHaveAttribute('aria-valuemin', '0')
      expect(bar).toHaveAttribute('aria-valuemax', '100')
    })
  })

  it('renders an even split when the tracker is unreachable', async () => {
    fetchTally.mockResolvedValue({ utmist: 0, watai: 0, reachable: true })
    setup()
    await waitFor(() => {
      expect(screen.getByTestId('tug-utmist')).toHaveStyle({ width: '50%' })
    })
  })

  // The two fills are 1.71:1 apart — a hue change and nothing else, which
  // tritanopes and dim displays lose entirely. The boundary is the component.
  it('separates the two territories with more than a hue change', async () => {
    fetchTally.mockResolvedValue({ utmist: 50, watai: 50, reachable: true })
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
    fetchTally.mockResolvedValue({ utmist: 50, watai: 50, reachable: true })
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

/**
 * The state that did not previously exist. A tracker returning 500 on every
 * read used to render as "No votes yet — be the first": indistinguishable
 * from a healthy poll nobody had voted in, which is how a broken tally goes
 * unnoticed until someone asks why the numbers never moved.
 */
describe('TugOfWar when the tracker cannot be reached', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('says the count is unavailable instead of claiming zero votes', async () => {
    fetchTally.mockResolvedValue({ utmist: 0, watai: 0, reachable: false })
    render(<TugOfWar />)
    expect(await screen.findByText(/live count unavailable/i)).toBeInTheDocument()
    expect(screen.queryByText(/no votes yet/i)).toBeNull()
  })

  it('shows no percentages it cannot stand behind', async () => {
    fetchTally.mockResolvedValue({ utmist: 0, watai: 0, reachable: false })
    render(<TugOfWar />)
    await screen.findByText(/live count unavailable/i)
    expect(screen.queryByText('50%')).toBeNull()
    expect(screen.getAllByText('—')).toHaveLength(2)
  })

  it('tells assistive technology the same thing it tells everyone else', async () => {
    fetchTally.mockResolvedValue({ utmist: 0, watai: 0, reachable: false })
    render(<TugOfWar />)
    await screen.findByText(/live count unavailable/i)
    expect(screen.getByRole('meter')).toHaveAttribute(
      'aria-valuetext',
      'Live count unavailable',
    )
  })

  // The inverse, and the reason `reachable` is three-valued: a real zero
  // tally must still read as an open poll, not as a fault.
  it('still invites the first vote when the server really did answer zero', async () => {
    fetchTally.mockResolvedValue({ utmist: 0, watai: 0, reachable: true })
    render(<TugOfWar />)
    expect(await screen.findByText(/no votes yet/i)).toBeInTheDocument()
    expect(screen.queryByText(/unavailable/i)).toBeNull()
  })

  // Before the first response there is nothing to report either way, and
  // crying wolf on every page load would train everyone to ignore it.
  it('does not accuse the tracker before the first response lands', () => {
    fetchTally.mockReturnValue(new Promise(() => {}))
    render(<TugOfWar />)
    expect(screen.queryByText(/unavailable/i)).toBeNull()
    expect(screen.queryByText(/no votes yet/i)).toBeNull()
  })
})
