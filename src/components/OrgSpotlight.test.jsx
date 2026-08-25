import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FactionProvider, useFaction } from '../faction/FactionContext'
import { writeFaction } from '../faction/factionStorage'
import OrgSpotlight from './OrgSpotlight'

// The tug-of-war bar is a child of this section but is its own component with
// its own tests; stubbing it keeps an unrelated async fetch out of these.

function ChooseWatai() {
  const { choose } = useFaction()
  return <button type="button" onClick={() => choose('watai')}>choose watai</button>
}

const setup = () =>
  render(
    <FactionProvider>
      <ChooseWatai />
      <OrgSpotlight />
    </FactionProvider>,
  )

// The org panel shows a blurb unique to whichever side is active, so the
// blurb is the honest read on what the section is displaying.
const showing = () =>
  screen.queryByText(/largest undergraduate AI\/ML community/i) ? 'utmist' : 'watai'

describe('OrgSpotlight', () => {
  beforeEach(() => window.localStorage.clear())

  // This panel used to hold its own activeOrg state, defaulting to 'utmist'
  // and disconnected from FactionContext — so a visitor who picked WAT.ai in
  // the hero scrolled down to find the Organizers section still on UTMIST,
  // contradicting the one claim the whole design rests on.
  it('opens on the faction the visitor already chose', () => {
    writeFaction('watai')
    setup()
    expect(showing()).toBe('watai')
  })

  it('defaults to UTMIST when no side has been chosen', () => {
    setup()
    expect(showing()).toBe('utmist')
  })

  it('follows the faction when it changes while the section is mounted', async () => {
    const user = userEvent.setup()
    setup()
    expect(showing()).toBe('utmist')

    await user.click(screen.getByRole('button', { name: 'choose watai' }))

    expect(showing()).toBe('watai')
  })

  // Syncing must not disable the section's own toggle: it is a browsable
  // comparison of the two organizations, not a second way to pick a side.
  it('still lets the visitor browse the other organization by hand', async () => {
    const user = userEvent.setup()
    setup()
    expect(showing()).toBe('utmist')

    await user.click(screen.getByRole('button', { name: /waterloo ai/i }))
    expect(showing()).toBe('watai')
  })

  // Browsing is not choosing: the section's own toggle must not write back to
  // the faction, or scrolling past it would silently re-theme the whole site.
  it('does not change the visitor\'s faction when its own toggle is used', async () => {
    const user = userEvent.setup()
    setup()

    await user.click(screen.getByRole('button', { name: /waterloo ai/i }))

    expect(document.documentElement.getAttribute('data-faction')).toBeNull()
  })
})
