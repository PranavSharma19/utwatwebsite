import { describe, it, expect } from 'vitest'
import config from './tailwind.config.js'
import { palette } from './src/theme/tokens.js'

const { fontFamily, colors } = config.theme.extend

describe('typography config', () => {
  it('uses a real monospace for the mono slot', () => {
    // Regression guard: this was ["Inter", "monospace"] — a sans in the mono slot.
    expect(fontFamily.mono[0]).toBe('IBM Plex Mono')
    expect(fontFamily.mono[0]).not.toBe('Inter')
  })

  it('keeps display, sans and mono distinct', () => {
    const heads = [fontFamily.display[0], fontFamily.sans[0], fontFamily.mono[0]]
    expect(new Set(heads).size).toBe(3)
  })

  it('uses Chakra Petch for display and IBM Plex Sans for body', () => {
    expect(fontFamily.display[0]).toBe('Chakra Petch')
    expect(fontFamily.sans[0]).toBe('IBM Plex Sans')
  })
})

describe('colour config', () => {
  it('exposes the palette tokens', () => {
    for (const key of ['void', 'uoft', 'signal', 'waterloo', 'ink', 'muted']) {
      expect(colors[key], `missing token ${key}`).toBe(palette[key])
    }
  })

  it('wires the accent to a CSS custom property so theming needs no JS', () => {
    expect(colors.accent).toBe('var(--accent)')
  })

  it('has dropped the unused Material dump', () => {
    expect(Object.keys(colors).length).toBeLessThan(15)
    expect(colors['on-tertiary-fixed-variant']).toBeUndefined()
  })
})
