import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import Crawl from './Crawl'

const COPY = 'Two schools. Thirty-six hours. One arena.'

function mockReducedMotion(reduce) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: query.includes('prefers-reduced-motion') ? reduce : false,
    media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  }))
}

describe('Crawl', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('renders the crawl text as real, selectable content', () => {
    mockReducedMotion(false)
    render(<Crawl text={COPY} />)
    expect(screen.getByText(COPY)).toBeInTheDocument()
  })

  it('animates when motion is allowed', () => {
    mockReducedMotion(false)
    const { container } = render(<Crawl text={COPY} />)
    expect(container.querySelector('[data-animated="true"]')).toBeInTheDocument()
  })

  it('renders a static block under prefers-reduced-motion', () => {
    mockReducedMotion(true)
    const { container } = render(<Crawl text={COPY} />)
    expect(container.querySelector('[data-animated="true"]')).toBeNull()
    expect(screen.getByText(COPY)).toBeInTheDocument()
  })

  it('calls onDone immediately under reduced motion', () => {
    mockReducedMotion(true)
    const onDone = vi.fn()
    render(<Crawl text={COPY} onDone={onDone} />)
    expect(onDone).toHaveBeenCalledOnce()
  })

  it('offers a skip control that calls onDone', async () => {
    mockReducedMotion(false)
    const onDone = vi.fn()
    render(<Crawl text={COPY} onDone={onDone} />)
    screen.getByRole('button', { name: /skip/i }).click()
    expect(onDone).toHaveBeenCalled()
  })
})
