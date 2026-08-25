/** WCAG 2.1 relative luminance and contrast ratio. */

function channel(value) {
  const c = value / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

export function relativeLuminance(hex) {
  const h = hex.replace('#', '')
  if (h.length !== 6) throw new Error(`expected a 6-digit hex colour, got "${hex}"`)
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export function contrastRatio(hexA, hexB) {
  const a = relativeLuminance(hexA)
  const b = relativeLuminance(hexB)
  const lighter = Math.max(a, b)
  const darker = Math.min(a, b)
  return (lighter + 0.05) / (darker + 0.05)
}

/** WCAG AA for normal-size text. */
export function meetsAA(foreground, background) {
  return contrastRatio(foreground, background) >= 4.5
}
