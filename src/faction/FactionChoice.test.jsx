import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
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
