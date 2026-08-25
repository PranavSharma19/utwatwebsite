import { describe, it, expect } from 'vitest'
import { contrastRatio, meetsAA } from './contrast'
import { palette, FACTIONS, factionAccent, NEUTRAL_ACCENT } from './tokens'

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
