// Owns all access to public.faction_cheers. The browser never touches the
// table directly. Verifies Turnstile, derives the visitor hash server-side
// from the request IP (never from anything the client sends, because anything
// the client sends can be forged), and returns aggregate counts only.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2'

const FACTIONS = ['utmist', 'watai'] as const
type Faction = (typeof FACTIONS)[number]

function isFaction(value: unknown): value is Faction {
  return typeof value === 'string' && (FACTIONS as readonly string[]).includes(value)
}

// Fail closed, not open: with no configured origin, POST is refused (see the
// method handler below) rather than left reachable from any page on the web.
// GET stays permissive since it only ever returns an aggregate tally.
const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN')

// Sitekeys are public by construction (they ship in the page), so a token
// that verifies with Cloudflare only proves it was solved for *some* site
// using this sitekey — not this one. TURNSTILE_EXPECTED_HOSTNAME closes that
// replay path; like ALLOWED_ORIGIN, an unset value fails closed rather than
// silently accepting tokens solved on someone else's page.
const TURNSTILE_EXPECTED_HOSTNAME = Deno.env.get('TURNSTILE_EXPECTED_HOSTNAME')

// Also fails closed, and for a sharper reason than its siblings. An unset
// salt does not break anything visibly: visitor_hash simply degrades to
// SHA-256("<ip>|YYYY-MM-DD|"), the deploy looks healthy, and the table then
// holds effectively reversible IP addresses — the whole IPv4 space is 2^32
// digests against a known date, minutes of work. Refusing to write is the
// only safe reading of "no salt configured".
const CHEER_HASH_SALT = Deno.env.get('CHEER_HASH_SALT')

const CORS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN ?? '*',
  // Matches supabase/functions/admin-applications/index.ts so a client using
  // supabase-js's `functions.invoke` (which sends apikey + x-client-info)
  // doesn't fail preflight here.
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

const json = (
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, ...extraHeaders, 'Content-Type': 'application/json' },
  })

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

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
function extractIp(req: Request): string {
  const xff =
    req.headers
      .get('x-forwarded-for')
      ?.split(',')
      .map((s) => s.trim())
      .filter(Boolean) ?? []
  // `||`, not `??`: an XFF header that is present but empty parses to an
  // empty array, so `xff[xff.length - 1]` is `undefined`, not `''` — but a
  // stray empty *string* anywhere in this chain must still fall through
  // rather than being treated as a truthy-but-blank identity.
  return req.headers.get('cf-connecting-ip')?.trim() || xff[xff.length - 1] || 'unknown'
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
function normalizeIp(ip: string): string {
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

// --- Per-IP rate limiting -----------------------------------------------
//
// In-memory sliding window keyed on the corrected+normalized IP. This is
// per-isolate, not global, which is an accepted limitation for a public vote
// counter; it still blunts single-origin bursts, and it must run on the
// corrected IP or it limits nobody (a forgeable IP makes each "identity"
// disposable).
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX_REQUESTS = 5
const rateLimitHits = new Map<string, number[]>()

// Bound on rateLimitHits' size. This is a public, unauthenticated endpoint,
// so the map gains roughly one entry per distinct IP seen, and nothing ever
// touches the entry for an IP that doesn't call back -- left alone that is
// an unbounded, slow memory leak in a long-lived isolate (and would make the
// limiter itself the resource an attacker exhausts). Past this many distinct
// keys, a full sweep drops every entry that has entirely aged out of the
// window. It's O(map size), but it only runs once the map is actually large,
// so no setInterval-based reaper is needed.
const RATE_LIMIT_MAP_SWEEP_THRESHOLD = 10_000

// Filters one IP's hit timestamps down to the current window and writes the
// result back -- deleting the key outright when nothing survives, rather
// than leaving an empty array resident forever (the common case for a
// one-off visitor).
function pruneHits(ip: string, now: number): number[] {
  const windowStart = now - RATE_LIMIT_WINDOW_MS
  const filtered = (rateLimitHits.get(ip) ?? []).filter((t) => t > windowStart)
  if (filtered.length === 0) {
    rateLimitHits.delete(ip)
  } else {
    rateLimitHits.set(ip, filtered)
  }
  return filtered
}

function checkRateLimit(ip: string): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now()

  if (rateLimitHits.size > RATE_LIMIT_MAP_SWEEP_THRESHOLD) {
    for (const key of [...rateLimitHits.keys()]) {
      pruneHits(key, now)
    }
  }

  const hits = pruneHits(ip, now)

  if (hits.length >= RATE_LIMIT_MAX_REQUESTS) {
    const retryAfterMs = hits[0] + RATE_LIMIT_WINDOW_MS - now
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) }
  }

  hits.push(now)
  rateLimitHits.set(ip, hits)
  return { allowed: true, retryAfterSeconds: 0 }
}

async function hashVisitor(normalizedIp: string): Promise<string> {
  // Salt rotates daily so the hash is not a durable identifier. Combined with
  // the per-IP unique index, this means one cheer per IP per UTC day,
  // accumulating into an all-time tally — not one cheer per visitor forever.
  // Non-null: the POST handler refuses the request before reaching here when
  // the salt is unset (see the 503 below), so this never silently falls back
  // to an unsalted, brute-forceable digest.
  const day = new Date().toISOString().slice(0, 10)
  const data = new TextEncoder().encode(`${normalizedIp}|${day}|${CHEER_HASH_SALT}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// extractIp falls back to the literal 'unknown' when no usable header is
// present. Cloudflare rejects a siteverify call whose `remoteip` is not a
// valid address, which would turn every cheer from such a client into
// `captcha failed` — a hard failure caused by a missing header rather than a
// failed challenge. `remoteip` is optional, so the field is simply omitted
// when we don't have an address to put in it.
const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/
function isIpAddress(value: string): boolean {
  if (IPV4.test(value)) return value.split('.').every((o) => Number(o) <= 255)
  return value.includes(':') && /^[0-9a-fA-F:.]+$/.test(value)
}

async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  const secret = Deno.env.get('TURNSTILE_SECRET_KEY')
  if (!secret) return false
  const body = new FormData()
  body.append('secret', secret)
  body.append('response', token)
  if (isIpAddress(ip)) body.append('remoteip', ip)
  const res = await fetch(
    'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    { method: 'POST', body },
  )
  if (!res.ok) return false
  const result = await res.json()
  if (result.success !== true) return false

  // Fail closed: without a configured expected hostname we cannot rule out a
  // token harvested on a page that merely embeds our public sitekey.
  if (!TURNSTILE_EXPECTED_HOSTNAME) return false
  return result.hostname === TURNSTILE_EXPECTED_HOSTNAME
}

async function tally(): Promise<Record<Faction, number>> {
  const results = await Promise.all(
    FACTIONS.map((faction) =>
      admin
        .from('faction_cheers')
        .select('*', { count: 'exact', head: true })
        .eq('faction', faction),
    ),
  )

  const counts = { utmist: 0, watai: 0 }
  results.forEach((result, i) => {
    if (result.error) throw result.error
    counts[FACTIONS[i]] = result.count ?? 0
  })
  return counts
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  // Identity comes ONLY from request headers plus the server-held salt, never
  // from the request body — anything the client sends in the body can be
  // forged and must never influence visitor_hash.
  const ip = extractIp(req)

  try {
    if (req.method === 'GET') return json(await tally())

    if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

    if (!ALLOWED_ORIGIN || !CHEER_HASH_SALT) {
      return json({ error: 'cheer submission is not configured' }, 503)
    }

    const normalizedIp = normalizeIp(ip)

    const rateLimit = checkRateLimit(normalizedIp)
    if (!rateLimit.allowed) {
      return json(
        { error: 'too many requests' },
        429,
        { 'Retry-After': String(rateLimit.retryAfterSeconds) },
      )
    }

    let payload: unknown
    try {
      payload = await req.json()
    } catch {
      return json({ error: 'invalid body' }, 400)
    }
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
      return json({ error: 'invalid body' }, 400)
    }

    const { faction, turnstileToken } = payload as Record<string, unknown>

    if (!isFaction(faction)) return json({ error: 'unknown faction' }, 400)
    if (typeof turnstileToken !== 'string' || !turnstileToken)
      return json({ error: 'captcha required' }, 400)
    if (!(await verifyTurnstile(turnstileToken, ip)))
      return json({ error: 'captcha failed' }, 403)

    // visitor_hash is derived solely from `normalizedIp` (header-sourced,
    // above) and the CHEER_HASH_SALT secret. `faction` and `turnstileToken`
    // are the only client-supplied values used, and neither feeds the hash.
    const visitor_hash = await hashVisitor(normalizedIp)

    // Unique index makes a repeat cheer a no-op rather than a double count.
    const { error } = await admin
      .from('faction_cheers')
      .insert({ faction, visitor_hash })

    if (error && error.code !== '23505') throw error

    return json(await tally())
  } catch (err) {
    console.error('faction-cheer failed', err)
    return json({ error: 'internal error' }, 500)
  }
})
