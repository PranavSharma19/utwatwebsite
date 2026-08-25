import { FACTIONS } from '../theme/tokens'

const EMPTY = { utmist: 0, watai: 0 }

function endpoint() {
  const base = import.meta.env.VITE_SUPABASE_URL
  return base ? `${base}/functions/v1/faction-cheer` : null
}

/**
 * Supabase's function gateway checks the project apikey on every request,
 * independently of the per-function `verify_jwt` setting (which
 * supabase/config.toml pins to false for this one, since cheering is
 * anonymous by design). Without these headers every call 401s — and because
 * this client swallows failures by contract, the bar would read 0/0 forever
 * with nothing reported anywhere. supabase-js's `functions.invoke` attaches
 * them for the admissions portal; this module uses bare fetch, so it has to
 * do it itself.
 */
function authHeaders() {
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!key) return {}
  return { apikey: key, Authorization: `Bearer ${key}` }
}

function normalise(payload) {
  const out = { ...EMPTY }
  for (const faction of FACTIONS) {
    const value = payload?.[faction]
    out[faction] = Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0
  }
  return out
}

// A cheer is submitted from FactionChoice (in the hero) but the bar that
// shows it lives in TugOfWar (in the Organizers section), and the two are in
// different subtrees. submitCheer already gets the fresh tally back, so it
// publishes it here rather than discarding it — otherwise the bar fetches
// once on mount and a visitor's own cheer never moves it in their session.
// Deliberately not a store: no retries, no error state, no loading state.
const tallyListeners = new Set()

/** Returns an unsubscribe function. */
export function subscribeTally(listener) {
  tallyListeners.add(listener)
  return () => tallyListeners.delete(listener)
}

function publishTally(tally) {
  for (const listener of tallyListeners) listener(tally)
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
    const res = await fetch(url, { method: 'GET', headers: { ...authHeaders() } })
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
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ faction, turnstileToken }),
    })
    if (!res.ok) return { ...EMPTY }
    const tally = normalise(await res.json())
    // Only a real tally is published: the zero-filled failure results above
    // would yank a populated bar back to an even split.
    publishTally(tally)
    return tally
  } catch {
    return { ...EMPTY }
  }
}
