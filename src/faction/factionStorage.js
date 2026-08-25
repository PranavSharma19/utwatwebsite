import { FACTIONS } from '../theme/tokens'

export const STORAGE_KEY = 'bots.faction'

function isFaction(value) {
  return FACTIONS.includes(value)
}

/**
 * Every access is wrapped: localStorage throws outright in some privacy
 * configurations rather than returning null, and a faction preference is
 * never important enough to break the page over.
 */
export function readFaction() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return isFaction(stored) ? stored : null
  } catch {
    return null
  }
}

export function writeFaction(faction) {
  if (!isFaction(faction)) return false
  try {
    window.localStorage.setItem(STORAGE_KEY, faction)
    return true
  } catch {
    return false
  }
}

export function clearFaction() {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* nothing to do — the preference simply does not persist */
  }
}
