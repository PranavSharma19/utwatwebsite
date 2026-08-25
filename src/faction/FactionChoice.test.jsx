import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FactionProvider } from './FactionContext'
import FactionChoice from './FactionChoice'

const setup = (props = {}) =>
  render(<FactionProvider><FactionChoice {...props} /></FactionProvider>)

describe('FactionChoice', () => {
  beforeEach(() => window.localStorage.clear())

  it('offers both schools', () => {
    setup()
    expect(screen.getByRole('button', { name: /UTMIST/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /WAT\.ai/i })).toBeInTheDocument()
  })

  it('themes the document when a side is chosen', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByRole('button', { name: /WAT\.ai/i }))
    expect(document.documentElement.getAttribute('data-faction')).toBe('watai')
  })

  it('reports the cheer to its caller', async () => {
    const onCheer = vi.fn()
    const user = userEvent.setup()
    setup({ onCheer })
    await user.click(screen.getByRole('button', { name: /UTMIST/i }))
    expect(onCheer).toHaveBeenCalledWith('utmist')
  })

  it('marks the chosen side as pressed for assistive technology', async () => {
    const user = userEvent.setup()
    setup()
    const utmist = screen.getByRole('button', { name: /UTMIST/i })
    expect(utmist).toHaveAttribute('aria-pressed', 'false')
    await user.click(utmist)
    expect(utmist).toHaveAttribute('aria-pressed', 'true')
  })

  it('is operable by keyboard', async () => {
    const user = userEvent.setup()
    setup()
    await user.tab()
    expect(screen.getByRole('button', { name: /UTMIST/i })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(document.documentElement.getAttribute('data-faction')).toBe('utmist')
  })

  it('lets the visitor switch sides', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByRole('button', { name: /UTMIST/i }))
    await user.click(screen.getByRole('button', { name: /WAT\.ai/i }))
    expect(document.documentElement.getAttribute('data-faction')).toBe('watai')
  })
})
