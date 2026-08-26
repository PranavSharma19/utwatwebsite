import { FACTIONS } from '../theme/tokens'

const EMPTY = { utmist: 0, watai: 0 }

/**
 * A tally the server never answered for. `reachable` is the whole point of
 * this module's return shape: a tracker that is down and a tracker that has
 * genuinely counted zero votes both produce 0/0, and without this flag they
 * render identically — a cheerful "No votes yet" over an endpoint returning
 * 500 on every read. That is not hypothetical; it is exactly what this site
 * displayed for the window between the table being created and PostgREST
 * noticing it existed. Callers that only want numbers can keep ignoring it.
 */
const UNREACHABLE = { ...EMPTY, reachable: false }

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
 * A tally request started before anything rendered. See `primeTally`.
 */
let primed = null

/**
 * Start fetching the tally now, without waiting for the bar to mount.
 *
 * TugOfWar lives behind the hero's opening crawl, so on a cold load its
 * mount-time fetch did not begin until the animation had finished — the
 * request queued behind six and a half seconds of dead time, and the bar
 * then sat blank for a further round trip. Calling this at startup spends
 * that time instead of waiting it out.
 *
 * The result is handed to whichever `fetchTally` asks for it first and then
 * released, so a later call (a retry, a second mount) still goes to the
 * network and cannot be served a stale count.
 */
export function primeTally() {
  if (!primed) primed = requestTally()
  // Nothing may await this yet; without a catch a rejection here would
  // surface as an unhandled promise rejection. fetchTally does not reject,
  // so this only guards against a future change that makes it able to.
  primed.catch(() => {})
  return primed
}

/**
 * Never throws: an unconfigured or unreachable tracker degrades to
 * `reachable: false` rather than breaking the page. It degrades *visibly*
 * though — see UNREACHABLE above.
 */
export async function fetchTally() {
  if (primed) {
    const pending = primed
    primed = null
    return pending
  }
  return requestTally()
}

/** The actual request, with no priming involved. */
async function requestTally() {
  const url = endpoint()
  // Missing config counts as unreachable rather than as an empty tally. A
  // build shipped without VITE_SUPABASE_URL cannot ever count a vote, and
  // saying so beats rendering a permanently empty bar.
  if (!url) return { ...UNREACHABLE }
  try {
    const res = await fetch(url, { method: 'GET', headers: { ...authHeaders() } })
    if (!res.ok) return { ...UNREACHABLE }
    return { ...normalise(await res.json()), reachable: true }
  } catch {
    return { ...UNREACHABLE }
  }
}

export async function submitCheer({ faction, turnstileToken }) {
  const url = endpoint()
  if (!url || !FACTIONS.includes(faction)) return { ...UNREACHABLE }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ faction, turnstileToken }),
    })
    if (!res.ok) return { ...UNREACHABLE }
    const tally = { ...normalise(await res.json()), reachable: true }
    // Only a real tally is published: the zero-filled failure results above
    // would yank a populated bar back to an even split.
    publishTally(tally)
    return tally
  } catch {
    return { ...UNREACHABLE }
  }
}
