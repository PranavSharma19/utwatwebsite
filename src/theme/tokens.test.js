import { describe, it, expect } from 'vitest'
import { contrastRatio, meetsAA } from './contrast'
import { palette, FACTIONS, factionAccent, NEUTRAL_ACCENT, factionLabel, factionSchool } from './tokens'

describe('contrast maths', () => {
  it('gives 21:1 for black on white', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1)
  })

  it('is order independent', () => {
    expect(contrastRatio('#0A0C14', '#FDD54F')).toBeCloseTo(
      contrastRatio('#FDD54F', '#0A0C14'), 5)
  })

  it('accepts hex with or without the leading hash', () => {
    expect(contrastRatio('0A0C14', '#FDD54F')).toBeCloseTo(
      contrastRatio('#0A0C14', '#FDD54F'), 5)
  })
})

describe('shipped colour pairs', () => {
  const foregrounds = ['ink', 'muted', 'signal', 'waterloo']

  it.each(foregrounds)('%s meets AA on the void', (key) => {
    expect(meetsAA(palette[key], palette.void)).toBe(true)
  })

  it.each(['ink', 'muted', 'waterloo'])('%s meets AA on the uoft surface', (key) => {
    expect(meetsAA(palette[key], palette.uoft)).toBe(true)
  })

  it.each(FACTIONS)('the %s accent meets AA on the void', (f) => {
    expect(meetsAA(factionAccent[f], palette.void)).toBe(true)
  })

  it('the neutral accent meets AA on the void', () => {
    expect(meetsAA(NEUTRAL_ACCENT, palette.void)).toBe(true)
  })
})

describe('uoft blue is ground-only', () => {
  // Documents WHY the factions are asymmetric. If this ever passes, someone
  // changed #1E3765 and the ground/foreground split needs revisiting.
  it('fails AA as a foreground on the void', () => {
    expect(meetsAA(palette.uoft, palette.void)).toBe(false)
  })

  it('is never used as a faction accent', () => {
    expect(Object.values(factionAccent)).not.toContain(palette.uoft)
  })
})

describe('faction metadata', () => {
  it.each(FACTIONS)('has a label for %s', (faction) => {
    expect(factionLabel[faction]).toBeDefined()
    expect(typeof factionLabel[faction]).toBe('string')
    expect(factionLabel[faction].length).toBeGreaterThan(0)
  })

  it.each(FACTIONS)('has a school name for %s', (faction) => {
    expect(factionSchool[faction]).toBeDefined()
    expect(typeof factionSchool[faction]).toBe('string')
    expect(factionSchool[faction].length).toBeGreaterThan(0)
  })

  it('has correct label values', () => {
    expect(factionLabel).toEqual({
      utmist: 'UTMIST',
      watai: 'WAT.ai',
    })
  })

  it('has correct school names', () => {
    expect(factionSchool).toEqual({
      utmist: 'University of Toronto',
      watai: 'University of Waterloo',
    })
  })
})
