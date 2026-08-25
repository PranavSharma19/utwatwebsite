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

  it('renders three parallax depth layers', () => {
    const { container } = render(<Starfield />)
    expect(container.querySelectorAll('[data-layer]')).toHaveLength(3)
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
