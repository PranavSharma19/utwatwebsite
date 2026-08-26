import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import Starfield from './Starfield'

describe('Starfield', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('is hidden from assistive technology', () => {
    const { container } = render(<Starfield />)
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true')
  })

  it('never intercepts pointer input', () => {
    const { container } = render(<Starfield />)
    expect(container.firstChild.className).toMatch(/pointer-events-none/)
  })

  it('renders the constellation art as a parallax layer', () => {
    const { container } = render(<Starfield />)
    const art = container.querySelector('[data-layer="art"]')
    expect(art).toBeInTheDocument()
    expect(art.style.backgroundImage).toMatch(/url\(/)
  })

  // The artwork already contains stars. Two extra layers of CSS point-stars
  // on top of it were noise, and the hero read as cluttered with them there.
  it('does not stack extra dust layers over the artwork', () => {
    const { container } = render(<Starfield />)
    expect(container.querySelectorAll('[data-layer]')).toHaveLength(1)
  })

  it('never attaches a scroll listener when motion is reduced', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true })
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener')

    render(<Starfield />)

    expect(addEventListenerSpy).not.toHaveBeenCalledWith(
      'scroll',
      expect.any(Function),
      expect.anything()
    )
  })

  it('attaches a scroll listener when motion is not reduced', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false })
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener')

    render(<Starfield />)

    expect(addEventListenerSpy).toHaveBeenCalledWith(
      'scroll',
      expect.any(Function),
      expect.anything()
    )
  })
})
