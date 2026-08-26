import { describe, it, expect } from 'vitest'
import { contrastRatio, meetsAA } from './contrast'
import { palette, FACTIONS, factionAccent, NEUTRAL_ACCENT, factionSchool, factionSchoolFull, factionClub } from './tokens'

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

// The sides of the vote are the two SCHOOLS. UTMIST and WAT.ai host the event;
// they are credited, never the thing being voted on. The poll originally had
// this inverted and asked people to pick a club.
describe('faction metadata', () => {
  it.each(FACTIONS)('names a school for %s', (faction) => {
    expect(typeof factionSchool[faction]).toBe('string')
    expect(factionSchool[faction].length).toBeGreaterThan(0)
  })

  it.each(FACTIONS)('names a full school title for %s', (faction) => {
    expect(factionSchoolFull[faction]).toMatch(/^University of /)
  })

  it.each(FACTIONS)('credits a host club for %s', (faction) => {
    expect(typeof factionClub[faction]).toBe('string')
    expect(factionClub[faction].length).toBeGreaterThan(0)
  })

  it('uses the schools as the sides', () => {
    expect(factionSchool).toEqual({ utmist: 'UofT', watai: 'Waterloo' })
  })

  // "UofT" is a proper noun with specific casing. Anything that uppercases it
  // renders "UOFT", which is wrong to anyone who actually goes there — so the
  // token keeps its own casing and the UI must not transform it.
  it('preserves UofT casing rather than flattening it', () => {
    expect(factionSchool.utmist).toBe('UofT')
    expect(factionSchool.utmist).not.toBe(factionSchool.utmist.toUpperCase())
  })

  it('keeps the clubs distinct from the schools', () => {
    expect(factionClub).toEqual({ utmist: 'UTMIST', watai: 'WAT.ai' })
    for (const faction of FACTIONS) {
      expect(factionClub[faction]).not.toBe(factionSchool[faction])
    }
  })

  it('spells the full school names out', () => {
    expect(factionSchoolFull).toEqual({
      utmist: 'University of Toronto',
      watai: 'University of Waterloo',
    })
  })
})
