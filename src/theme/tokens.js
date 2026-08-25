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
  // Panel surface. `uoft` maxes out at 1.66:1 against the void even at full
  // opacity, which is not enough for a card to read as a distinct surface —
  // at the /20 we were using it measured 1.07:1, i.e. invisible. This is the
  // same hue, lifted until a panel actually looks like a panel (1.89:1).
  panel: '#24406F',
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
