import { describe, it, expect } from 'vitest'
import { sponsors } from './sponsors'

describe('sponsor data', () => {
  it('has at least the five confirmed sponsors', () => {
    expect(sponsors.length).toBeGreaterThanOrEqual(5)
  })

  it('gives every sponsor a name, a logo and a url', () => {
    for (const s of sponsors) {
      expect(s.name, 'sponsor is missing a name').toBeTruthy()
      expect(s.logo, `${s.name} is missing a logo`).toBeTruthy()
      expect(s.url, `${s.name} is missing a url`).toMatch(/^https:\/\//)
    }
  })

  it('uses a sane optical scale where one is given', () => {
    for (const s of sponsors) {
      if (s.logoScale === undefined) continue
      expect(s.logoScale, `${s.name} logoScale out of range`).toBeGreaterThan(0.3)
      expect(s.logoScale, `${s.name} logoScale out of range`).toBeLessThanOrEqual(1)
    }
  })

  it('has no duplicate sponsors', () => {
    const names = sponsors.map((s) => s.name.toLowerCase())
    expect(new Set(names).size).toBe(names.length)
  })
})
