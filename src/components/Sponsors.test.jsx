import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FactionProvider } from '../faction/FactionContext'
import Sponsors from './Sponsors'
import { sponsors } from '../data/sponsors'

const setup = () => render(<FactionProvider><Sponsors /></FactionProvider>)

describe('Sponsors', () => {
  it('renders every sponsor', () => {
    setup()
    for (const s of sponsors) {
      expect(screen.getByAltText(`${s.name} logo`)).toBeInTheDocument()
    }
  })

  it('links each sponsor out safely', () => {
    setup()
    for (const s of sponsors) {
      const link = screen.getByRole('link', { name: new RegExp(s.name, 'i') })
      expect(link).toHaveAttribute('href', s.url)
      expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
    }
  })

  // Sponsor marks carry their own brand colours — Shopify's greens,
  // Accenture's purple. A faction wash would corrupt them.
  it('never applies the faction accent to a sponsor card', () => {
    const { container } = setup()
    const section = container.querySelector('#sponsors')
    expect(section.querySelectorAll('[class*="accent"]')).toHaveLength(0)
  })

  it('no longer advertises sponsors as coming soon', () => {
    setup()
    expect(screen.queryByText(/coming soon/i)).toBeNull()
  })
})
