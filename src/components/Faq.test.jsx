import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Faq from './Faq'

describe('Faq search', () => {
  // A placeholder is not an accessible name: it is removed from the
  // accessibility tree the moment the field has a value, so the control the
  // visitor is actively typing into is the one with no name at all
  // (WCAG 1.3.1 / 4.1.2). getByRole with a name is the whole assertion —
  // it resolves through the accessible name computation, not the attribute.
  it('keeps its accessible name after something is typed into it', async () => {
    const user = userEvent.setup()
    render(<Faq />)

    const search = screen.getByRole('textbox', { name: /search faq/i })
    await user.type(search, 'team')

    // The placeholder is gone from the accessibility tree at this point;
    // the field is still findable by name only because of the aria-label.
    expect(search).toHaveValue('team')
    expect(screen.getByRole('textbox', { name: /search faq/i })).toBe(search)
  })

  // The field's bg-uoft/20 sits inside a section that is itself bg-uoft/20 —
  // 1.07:1, no boundary at all. The border is the only thing delimiting the
  // control, and WCAG 1.4.11 asks 3:1 of it; /15 measured 1.30:1.
  it('delimits the field with a border that can actually be seen', () => {
    render(<Faq />)
    const search = screen.getByRole('textbox', { name: /search faq/i })
    expect(search.className).toContain('border-signal/60')
    expect(search.className).not.toContain('border-signal/15')
  })

  it('filters the questions as you type', async () => {
    const user = userEvent.setup()
    render(<Faq />)

    expect(screen.getByText(/what is a hackathon/i)).toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: /search faq/i }), 'team sizes')
    expect(screen.queryByText(/what is a hackathon/i)).toBeNull()
    expect(screen.getByText(/how do team sizes/i)).toBeInTheDocument()
  })
})
