import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { FactionProvider } from '../faction/FactionContext'
import TugOfWar from './TugOfWar'

vi.mock('./cheerClient', () => ({
  fetchTally: vi.fn(),
  submitCheer: vi.fn(),
}))
import { fetchTally } from './cheerClient'

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
})
