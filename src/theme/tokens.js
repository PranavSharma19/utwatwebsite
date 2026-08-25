/**
 * Single source of truth for the Deep Field palette.
 *
 * `uoft` is ground and nebula ONLY. It is a dark navy designed for white
 * paper and measures 1.66:1 on the void, so it can never carry foreground
 * text. The blue faction's foreground colour is `signal`, a lightened
 * derivative of the same hue.
 *
 * This makes the factions asymmetric: gold is one token in both roles,
 * blue is two tokens with different roles. Do not write code that assumes
 * a faction is a single colour.
 */
export const palette = {
  void: '#0A0C14',
  uoft: '#1E3765',
  signal: '#8BA7DA',
  waterloo: '#FDD54F',
  ink: '#E2E1EF',
  muted: '#C3CBDD',
}

export const FACTIONS = ['utmist', 'watai']

export const factionAccent = {
  utmist: palette.signal,
  watai: palette.waterloo,
}

/** Used before a side is chosen. Favours neither school. */
export const NEUTRAL_ACCENT = palette.muted

export const factionLabel = {
  utmist: 'UTMIST',
  watai: 'WAT.ai',
}

export const factionSchool = {
  utmist: 'University of Toronto',
  watai: 'University of Waterloo',
}
