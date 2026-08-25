import { FACTIONS } from '../theme/tokens'

const EMPTY = { utmist: 0, watai: 0 }

function endpoint() {
  const base = import.meta.env.VITE_SUPABASE_URL
  return base ? `${base}/functions/v1/faction-cheer` : null
}

function normalise(payload) {
  const out = { ...EMPTY }
  for (const faction of FACTIONS) {
    const value = payload?.[faction]
    out[faction] = Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0
  }
  return out
}

/**
 * The tally is decorative. Every failure path returns zeroes instead of
 * throwing, so an unconfigured or unreachable tracker degrades to an empty
 * bar rather than breaking the page.
 */
export async function fetchTally() {
  const url = endpoint()
  if (!url) return { ...EMPTY }
  try {
    const res = await fetch(url, { method: 'GET' })
    if (!res.ok) return { ...EMPTY }
    return normalise(await res.json())
  } catch {
    return { ...EMPTY }
  }
}

export async function submitCheer({ faction, turnstileToken }) {
  const url = endpoint()
  if (!url || !FACTIONS.includes(faction)) return { ...EMPTY }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ faction, turnstileToken }),
    })
    if (!res.ok) return { ...EMPTY }
    return normalise(await res.json())
  } catch {
    return { ...EMPTY }
  }
}
