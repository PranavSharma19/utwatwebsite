// Owns all access to public.faction_cheers. The browser never touches the
// table directly. Verifies Turnstile, derives the visitor hash server-side
// from the request IP (never from anything the client sends, because anything
// the client sends can be forged), and returns aggregate counts only.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2'
import {
  createRateLimiter,
  extractIp,
  isAllowedHostname,
  isIpAddress,
  normalizeIp,
  parseList,
  resolveAllowedOrigin,
} from './identity.ts'

const FACTIONS = ['utmist', 'watai'] as const
type Faction = (typeof FACTIONS)[number]

function isFaction(value: unknown): value is Faction {
  return typeof value === 'string' && (FACTIONS as readonly string[]).includes(value)
}

// Fail closed, not open: with no configured origin, POST is refused (see the
// method handler below) rather than left reachable from any page on the web.
// GET stays permissive since it only ever returns an aggregate tally.
const ALLOWED_ORIGINS = parseList(Deno.env.get('ALLOWED_ORIGIN'))

// Sitekeys are public by construction (they ship in the page), so a token
// that verifies with Cloudflare only proves it was solved for *some* site
// using this sitekey — not this one. TURNSTILE_EXPECTED_HOSTNAME closes that
// replay path; like ALLOWED_ORIGIN, an unset value fails closed rather than
// silently accepting tokens solved on someone else's page.
const TURNSTILE_EXPECTED_HOSTNAMES = parseList(
  Deno.env.get('TURNSTILE_EXPECTED_HOSTNAME'),
)

// Also fails closed, and for a sharper reason than its siblings. An unset
// salt does not break anything visibly: visitor_hash simply degrades to
// SHA-256("<ip>|YYYY-MM-DD|"), the deploy looks healthy, and the table then
// holds effectively reversible IP addresses — the whole IPv4 space is 2^32
// digests against a known date, minutes of work. Refusing to write is the
// only safe reading of "no salt configured".
const CHEER_HASH_SALT = Deno.env.get('CHEER_HASH_SALT')

function corsFor(req: Request): Record<string, string> {
  return {
    'Access-Control-Allow-Origin':
      resolveAllowedOrigin(req.headers.get('origin'), ALLOWED_ORIGINS) ?? '*',
    // Responses differ by request origin now. Without this a shared cache can
    // serve one origin's header to another and undo the allowlist entirely.
    Vary: 'Origin',
    // Matches supabase/functions/admin-applications/index.ts so a client
    // using supabase-js's `functions.invoke` (which sends apikey +
    // x-client-info) doesn't fail preflight here.
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  }
}

const json = (
  cors: Record<string, string>,
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, ...extraHeaders, 'Content-Type': 'application/json' },
  })

// One window per isolate; see createRateLimiter's contract.
const rateLimiter = createRateLimiter()

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

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
  return isAllowedHostname(result.hostname, TURNSTILE_EXPECTED_HOSTNAMES)
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
  const cors = corsFor(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  // Identity comes ONLY from request headers plus the server-held salt, never
  // from the request body — anything the client sends in the body can be
  // forged and must never influence visitor_hash.
  const ip = extractIp(req.headers)

  try {
    if (req.method === 'GET') return json(cors, await tally())

    if (req.method !== 'POST') return json(cors, { error: 'method not allowed' }, 405)

    if (ALLOWED_ORIGINS.length === 0 || !CHEER_HASH_SALT) {
      return json(cors, { error: 'cheer submission is not configured' }, 503)
    }

    const normalizedIp = normalizeIp(ip)

    const rateLimit = rateLimiter.check(normalizedIp)
    if (!rateLimit.allowed) {
      return json(
        cors,
        { error: 'too many requests' },
        429,
        { 'Retry-After': String(rateLimit.retryAfterSeconds) },
      )
    }

    let payload: unknown
    try {
      payload = await req.json()
    } catch {
      return json(cors, { error: 'invalid body' }, 400)
    }
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
      return json(cors, { error: 'invalid body' }, 400)
    }

    const { faction, turnstileToken } = payload as Record<string, unknown>

    if (!isFaction(faction)) return json(cors, { error: 'unknown faction' }, 400)
    if (typeof turnstileToken !== 'string' || !turnstileToken)
      return json(cors, { error: 'captcha required' }, 400)
    if (!(await verifyTurnstile(turnstileToken, ip)))
      return json(cors, { error: 'captcha failed' }, 403)

    // visitor_hash is derived solely from `normalizedIp` (header-sourced,
    // above) and the CHEER_HASH_SALT secret. `faction` and `turnstileToken`
    // are the only client-supplied values used, and neither feeds the hash.
    const visitor_hash = await hashVisitor(normalizedIp)

    // Unique index makes a repeat cheer a no-op rather than a double count.
    const { error } = await admin
      .from('faction_cheers')
      .insert({ faction, visitor_hash })

    if (error && error.code !== '23505') throw error

    return json(cors, await tally())
  } catch (err) {
    console.error('faction-cheer failed', err)
    return json(cors, { error: 'internal error' }, 500)
  }
})
