import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FactionProvider, useFaction } from './FactionContext'
import { STORAGE_KEY } from './factionStorage'

function Probe() {
  const { faction, hasChosen, choose, clear } = useFaction()
  return (
    <div>
      <span data-testid="faction">{faction ?? 'none'}</span>
      <span data-testid="chosen">{String(hasChosen)}</span>
      <button onClick={() => choose('utmist')}>pick utmist</button>
      <button onClick={() => choose('watai')}>pick watai</button>
      <button onClick={clear}>clear</button>
    </div>
  )
}

const renderProbe = () =>
  render(<FactionProvider><Probe /></FactionProvider>)

describe('FactionProvider', () => {
  beforeEach(() => window.localStorage.clear())

  it('starts neutral with no stored choice', () => {
    renderProbe()
    expect(screen.getByTestId('faction')).toHaveTextContent('none')
    expect(screen.getByTestId('chosen')).toHaveTextContent('false')
  })

  it('leaves data-faction unset while neutral', () => {
    renderProbe()
    expect(document.documentElement.hasAttribute('data-faction')).toBe(false)
  })

  it('sets data-faction on the document element when a side is chosen', async () => {
    const user = userEvent.setup()
    renderProbe()
    await user.click(screen.getByText('pick watai'))
    expect(document.documentElement.getAttribute('data-faction')).toBe('watai')
  })

  it('persists the choice', async () => {
    const user = userEvent.setup()
    renderProbe()
    await user.click(screen.getByText('pick utmist'))
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('utmist')
  })

  it('rehydrates a stored choice on mount', () => {
    window.localStorage.setItem(STORAGE_KEY, 'watai')
    renderProbe()
    expect(screen.getByTestId('faction')).toHaveTextContent('watai')
    expect(document.documentElement.getAttribute('data-faction')).toBe('watai')
  })

  it('allows switching sides', async () => {
    const user = userEvent.setup()
    renderProbe()
    await user.click(screen.getByText('pick utmist'))
    await user.click(screen.getByText('pick watai'))
    expect(screen.getByTestId('faction')).toHaveTextContent('watai')
    expect(document.documentElement.getAttribute('data-faction')).toBe('watai')
  })

  it('returns to neutral and removes the attribute on clear', async () => {
    const user = userEvent.setup()
    renderProbe()
    await user.click(screen.getByText('pick utmist'))
    await user.click(screen.getByText('clear'))
    expect(screen.getByTestId('faction')).toHaveTextContent('none')
    expect(document.documentElement.hasAttribute('data-faction')).toBe(false)
  })

  it('ignores an invalid faction', async () => {
    function BadProbe() {
      const { faction, choose } = useFaction()
      return (
        <div>
          <span data-testid="faction">{faction ?? 'none'}</span>
          <button onClick={() => choose('mit')}>bad</button>
        </div>
      )
    }
    const user = userEvent.setup()
    render(<FactionProvider><BadProbe /></FactionProvider>)
    await user.click(screen.getByText('bad'))
    expect(screen.getByTestId('faction')).toHaveTextContent('none')
  })

  it('still works when storage is unavailable', () => {
    // The site must render correctly with no stored value available.
    const original = window.localStorage.getItem
    window.localStorage.getItem = () => { throw new DOMException('denied') }
    expect(() => renderProbe()).not.toThrow()
    window.localStorage.getItem = original
  })
})

describe('useFaction outside a provider', () => {
  it('throws a helpful error', () => {
    function Orphan() { useFaction(); return null }
    expect(() => render(<Orphan />)).toThrow(/FactionProvider/)
  })
})
