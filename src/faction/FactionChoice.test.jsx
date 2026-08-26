import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FactionProvider } from './FactionContext'
import FactionChoice from './FactionChoice'

const setup = (props = {}) =>
  render(<FactionProvider><FactionChoice {...props} /></FactionProvider>)

const voteButton = (school) =>
  screen.getByRole('button', { name: new RegExp(`vote ${school}`, 'i') })

/** Arm a side without confirming it. */
async function arm(user, school) {
  await user.click(voteButton(school))
}

/** The full two-step: arm, then commit. */
async function vote(user, school) {
  await arm(user, school)
  await user.click(screen.getByRole('button', { name: /^confirm$/i }))
}

describe('FactionChoice', () => {
  beforeEach(() => window.localStorage.clear())

  it('offers both schools', () => {
    setup()
    expect(voteButton('uoft')).toBeInTheDocument()
    expect(voteButton('waterloo')).toBeInTheDocument()
  })

  it('themes the document once a side is confirmed', async () => {
    const user = userEvent.setup()
    setup()
    await vote(user, 'waterloo')
    expect(document.documentElement.getAttribute('data-faction')).toBe('watai')
  })

  it('reports the cheer to its caller', async () => {
    const onCheer = vi.fn()
    const user = userEvent.setup()
    setup({ onCheer })
    await vote(user, 'uoft')
    expect(onCheer).toHaveBeenCalledWith('utmist')
  })

  it('marks the chosen side as pressed for assistive technology', async () => {
    const user = userEvent.setup()
    setup()
    expect(voteButton('uoft')).toHaveAttribute('aria-pressed', 'false')
    await vote(user, 'uoft')
    expect(screen.getByRole('button', { name: /you voted uoft/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('is operable by keyboard end to end', async () => {
    const user = userEvent.setup()
    setup()
    await user.tab()
    expect(voteButton('uoft')).toHaveFocus()
    await user.keyboard('{Enter}')
    // Confirm takes focus when the panel arms, so the whole flow is reachable
    // without a pointer.
    expect(screen.getByRole('button', { name: /^confirm$/i })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(document.documentElement.getAttribute('data-faction')).toBe('utmist')
  })

  it('locks the choice: the other side stops being a control', async () => {
    const user = userEvent.setup()
    setup()
    await vote(user, 'uoft')
    const other = screen.getByRole('button', { name: /not your side/i })
    expect(other).toBeDisabled()
    await user.click(other)
    expect(document.documentElement.getAttribute('data-faction')).toBe('utmist')
  })
})

// The vote cannot be undone, so a stray click must not be able to cast one.
describe('FactionChoice confirmation step', () => {
  beforeEach(() => window.localStorage.clear())

  it('does not vote on the first click', async () => {
    const onCheer = vi.fn()
    const user = userEvent.setup()
    setup({ onCheer })
    await arm(user, 'uoft')
    expect(document.documentElement.hasAttribute('data-faction')).toBe(false)
    expect(onCheer).not.toHaveBeenCalled()
  })

  it('says plainly that the choice is permanent', async () => {
    const user = userEvent.setup()
    setup()
    await arm(user, 'waterloo')
    expect(screen.getByText(/lock in waterloo\?/i)).toBeInTheDocument()
    expect(screen.getByText(/can't be changed later/i)).toBeInTheDocument()
  })

  it('cancels back to an unvoted state', async () => {
    const user = userEvent.setup()
    setup()
    await arm(user, 'uoft')
    await user.click(screen.getByRole('button', { name: /^cancel$/i }))
    expect(document.documentElement.hasAttribute('data-faction')).toBe(false)
    expect(voteButton('uoft')).toBeInTheDocument()
  })

  it('lets you change your mind about which side to arm', async () => {
    const user = userEvent.setup()
    setup()
    await arm(user, 'uoft')
    await user.click(screen.getByRole('button', { name: /^cancel$/i }))
    await vote(user, 'waterloo')
    expect(document.documentElement.getAttribute('data-faction')).toBe('watai')
  })

  it('offers no confirmation once a vote is already cast', async () => {
    const user = userEvent.setup()
    setup()
    await vote(user, 'uoft')
    expect(screen.queryByRole('button', { name: /^confirm$/i })).toBeNull()
  })
})

/**
 * The target used to be the "Vote UofT" caption alone -- a ~10px line of
 * mono text, well under any sane touch minimum, sitting inside a panel that
 * occupies half the screen and looks clickable in its entirety.
 */
describe('FactionChoice click target', () => {
  beforeEach(() => window.localStorage.clear())

  it('is the whole panel, not just the caption', () => {
    setup()
    // The panel element and the button are the same element.
    expect(voteButton('uoft')).toHaveAttribute('data-faction-panel', 'utmist')
    expect(voteButton('waterloo')).toHaveAttribute('data-faction-panel', 'watai')
  })

  it('arms from a click on the school name', async () => {
    const user = userEvent.setup()
    setup()
    // Scoped to the panel: the tally below renders the same school names.
    await user.click(within(voteButton('uoft')).getByText('UofT'))
    expect(screen.getByRole('button', { name: /^confirm$/i })).toBeInTheDocument()
    // Still only armed -- a bigger target must not skip the confirmation.
    expect(document.documentElement.hasAttribute('data-faction')).toBe(false)
  })

  it('arms from a click on the hosting club label', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(within(voteButton('waterloo')).getByText('WAT.ai'))
    expect(screen.getByRole('button', { name: /^confirm$/i })).toBeInTheDocument()
  })

  // Cancel and Confirm sit inside the panel. If the panel were still a click
  // target while armed, Cancel would bubble straight back into re-arming it.
  it('does not re-arm when Cancel is clicked inside the panel', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(within(voteButton('uoft')).getByText('UofT'))
    await user.click(screen.getByRole('button', { name: /^cancel$/i }))
    expect(screen.queryByRole('button', { name: /^confirm$/i })).toBeNull()
    expect(voteButton('uoft')).toBeInTheDocument()
  })
})
