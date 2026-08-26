// The parts of faction-cheer that are pure: deriving a stable, non-forgeable
// identity from request headers, and rate-limiting on it.
//
// They live here rather than in index.ts so they can be tested without
// standing up the Deno runtime or a local Postgres — this is the logic most
// worth pinning (a mistake in either function silently merges unrelated
// visitors into one voter) and the logic least able to be checked by looking
// at a rendered page. index.ts imports from here; so does identity.test.js.

// --- IP extraction -----------------------------------------------------
//
// `x-forwarded-for` is a client-appendable list: each proxy hop *appends* the
// peer it received the request from, so the list reads
// `<client-asserted>, <hop1>, <hop2>, ...`. The LEFTMOST entry is whatever the
// client chose to send and is trivially forgeable (`X-Forwarded-For:
// 203.0.113.<random>` on every request). The rightmost entry is the peer our
// own edge/proxy layer observed directly, which the client cannot set.
// `cf-connecting-ip`, where present, is written by Cloudflare's edge itself
// and is stronger still, so it is preferred outright.
export function extractIp(headers: Headers): string {
  const xff =
    headers
      .get('x-forwarded-for')
      ?.split(',')
      .map((s) => s.trim())
      .filter(Boolean) ?? []
  // `||`, not `??`: an XFF header that is present but empty parses to an
  // empty array, so `xff[xff.length - 1]` is `undefined`, not `''` — but a
  // stray empty *string* anywhere in this chain must still fall through
  // rather than being treated as a truthy-but-blank identity.
  return headers.get('cf-connecting-ip')?.trim() || xff[xff.length - 1] || 'unknown'
}

// Normalizes an IPv6 address down to its /64 network prefix so that a single
// household (which typically gets a /64 or larger from its ISP) is one
// voter, and so RFC 4941 privacy-extension address rotation within that
// prefix doesn't mint new identities. IPv4 addresses (and the 'unknown'
// fallback) pass through unchanged.
//
// IPv4-mapped and IPv4-compatible forms (`::ffff:a.b.c.d`, `::a.b.c.d`) MUST
// be pulled out before the `::` expander runs, and this is not a nicety. The
// expander inserts the synthesized zero groups ahead of the tail, so the
// first four groups of any `::`-prefixed address are all zeros and
// `slice(0, 4)` collapses the entire class into one string:
//
//   ::ffff:203.0.113.5  ->  0000:0000:0000:0000
//   ::ffff:8.8.8.8      ->  0000:0000:0000:0000
//   ::1                 ->  0000:0000:0000:0000
//
// That is a single shared dedup identity AND a single shared 5-req/min
// rate-limit bucket for every client reaching us over an IPv4-mapped socket
// — i.e. one cheer per day for all of them, and one of them can rate-limit
// the rest. Returning the embedded dotted quad puts them back on the same
// footing as a plain IPv4 peer.
export function normalizeIp(ip: string): string {
  const trimmed = ip.trim()
  if (!trimmed.includes(':')) return trimmed // IPv4, or 'unknown'

  const withoutZone = trimmed.split('%')[0]

  const last = withoutZone.split(':').pop()
  if (last?.includes('.')) return last
  const halves = withoutZone.split('::')
  let head: string[]
  let tail: string[]
  if (halves.length === 2) {
    head = halves[0] ? halves[0].split(':') : []
    tail = halves[1] ? halves[1].split(':') : []
  } else {
    head = withoutZone.split(':')
    tail = []
  }
  const missing = Math.max(0, 8 - head.length - tail.length)
  const groups = [...head, ...Array(missing).fill('0'), ...tail]
  return groups
    .slice(0, 4)
    .map((g) => g.padStart(4, '0'))
    .join(':')
}

// extractIp falls back to the literal 'unknown' when no usable header is
// present. Cloudflare rejects a siteverify call whose `remoteip` is not a
// valid address, which would turn every cheer from such a client into
// `captcha failed` — a hard failure caused by a missing header rather than a
// failed challenge. `remoteip` is optional, so the field is simply omitted
// when we don't have an address to put in it.
const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/
export function isIpAddress(value: string): boolean {
  if (IPV4.test(value)) return value.split('.').every((o) => Number(o) <= 255)
  return value.includes(':') && /^[0-9a-fA-F:.]+$/.test(value)
}

// --- Per-IP rate limiting -----------------------------------------------
//
// In-memory sliding window keyed on the corrected+normalized IP. This is
// per-isolate, not global, which is an accepted limitation for a public vote
// counter; it still blunts single-origin bursts, and it must run on the
// corrected IP or it limits nobody (a forgeable IP makes each "identity"
// disposable).
export const RATE_LIMIT_WINDOW_MS = 60_000
export const RATE_LIMIT_MAX_REQUESTS = 5

// Bound on the hit map's size. This is a public, unauthenticated endpoint, so
// the map gains roughly one entry per distinct IP seen, and nothing ever
// touches the entry for an IP that doesn't call back -- left alone that is an
// unbounded, slow memory leak in a long-lived isolate (and would make the
// limiter itself the resource an attacker exhausts). Past this many distinct
// keys, a full sweep drops every entry that has entirely aged out of the
// window. It's O(map size), but it only runs once the map is actually large,
// so no setInterval-based reaper is needed.
export const RATE_LIMIT_MAP_SWEEP_THRESHOLD = 10_000

/**
 * A limiter instance owns its own map. index.ts creates exactly one at module
 * scope, which is the per-isolate window described above; tests create their
 * own so one case's hits can't leak into the next.
 */
export function createRateLimiter({
  windowMs = RATE_LIMIT_WINDOW_MS,
  maxRequests = RATE_LIMIT_MAX_REQUESTS,
  sweepThreshold = RATE_LIMIT_MAP_SWEEP_THRESHOLD,
  now = () => Date.now(),
} = {}) {
  const hitsByIp = new Map<string, number[]>()

  // Filters one IP's hit timestamps down to the current window and writes the
  // result back -- deleting the key outright when nothing survives, rather
  // than leaving an empty array resident forever (the common case for a
  // one-off visitor).
  function pruneHits(ip: string, at: number): number[] {
    const windowStart = at - windowMs
    const filtered = (hitsByIp.get(ip) ?? []).filter((t) => t > windowStart)
    if (filtered.length === 0) {
      hitsByIp.delete(ip)
    } else {
      hitsByIp.set(ip, filtered)
    }
    return filtered
  }

  return {
    check(ip: string): { allowed: boolean; retryAfterSeconds: number } {
      const at = now()

      if (hitsByIp.size > sweepThreshold) {
        for (const key of [...hitsByIp.keys()]) pruneHits(key, at)
      }

      const hits = pruneHits(ip, at)

      if (hits.length >= maxRequests) {
        const retryAfterMs = hits[0] + windowMs - at
        return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) }
      }

      hits.push(at)
      hitsByIp.set(ip, hits)
      return { allowed: true, retryAfterSeconds: 0 }
    },
    /** Exposed for the sweep test only. */
    size: () => hitsByIp.size,
  }
}
