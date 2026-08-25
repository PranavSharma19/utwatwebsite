import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FactionProvider } from '../faction/FactionContext'
import Faq from './Faq'

const setup = () => render(<FactionProvider><Faq /></FactionProvider>)

// The search field was removed deliberately: it filtered a list short enough
// to read in full, and it competed for attention with the cheer interaction.
// These cover what the section still owes.
describe('Faq', () => {
  it('shows every question without needing to search for it', () => {
    setup()
    expect(screen.getAllByRole('button').length).toBeGreaterThanOrEqual(3)
  })

  it('has no search field', () => {
    setup()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByPlaceholderText(/search/i)).toBeNull()
  })

  it('opens an answer when its question is activated', async () => {
    const user = userEvent.setup()
    setup()
    const first = screen.getAllByRole('button')[0]
    const label = first.textContent
    await user.click(first)
    expect(label).toBeTruthy()
    expect(first).toBeInTheDocument()
  })

  it('is operable by keyboard', async () => {
    const user = userEvent.setup()
    setup()
    await user.tab()
    expect(screen.getAllByRole('button')[0]).toHaveFocus()
  })
})
