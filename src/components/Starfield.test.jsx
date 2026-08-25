import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import Starfield from './Starfield'

describe('Starfield', () => {
  it('is hidden from assistive technology', () => {
    const { container } = render(<Starfield />)
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true')
  })

  it('never intercepts pointer input', () => {
    const { container } = render(<Starfield />)
    expect(container.firstChild.className).toMatch(/pointer-events-none/)
  })

  it('renders three parallax depth layers', () => {
    const { container } = render(<Starfield />)
    expect(container.querySelectorAll('[data-layer]')).toHaveLength(3)
  })
})
