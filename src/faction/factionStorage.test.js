import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { readFaction, writeFaction, clearFaction, STORAGE_KEY } from './factionStorage'

describe('factionStorage', () => {
  beforeEach(() => window.localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it('returns null when nothing is stored', () => {
    expect(readFaction()).toBeNull()
  })

  it('round-trips a valid faction', () => {
    expect(writeFaction('utmist')).toBe(true)
    expect(readFaction()).toBe('utmist')
  })

  it('rejects a faction that is not real', () => {
    expect(writeFaction('mit')).toBe(false)
    expect(readFaction()).toBeNull()
  })

  it('ignores a corrupted stored value', () => {
    window.localStorage.setItem(STORAGE_KEY, 'not-a-faction')
    expect(readFaction()).toBeNull()
  })

  it('clears a stored faction', () => {
    writeFaction('watai')
    clearFaction()
    expect(readFaction()).toBeNull()
  })

  // The important cases: privacy modes make these throw, not return null.
  it('returns null instead of throwing when reads are blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied')
    })
    expect(() => readFaction()).not.toThrow()
    expect(readFaction()).toBeNull()
  })

  it('reports failure instead of throwing when writes are blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota')
    })
    expect(() => writeFaction('utmist')).not.toThrow()
    expect(writeFaction('utmist')).toBe(false)
  })

  it('does not throw when clearing is blocked', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('denied')
    })
    expect(() => clearFaction()).not.toThrow()
  })
})
