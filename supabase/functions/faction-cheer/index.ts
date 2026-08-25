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

const CORS = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

async function hashVisitor(ip: string): Promise<string> {
  // Salt rotates daily so the hash is not a durable identifier.
  const salt = Deno.env.get('CHEER_HASH_SALT') ?? ''
  const day = new Date().toISOString().slice(0, 10)
  const data = new TextEncoder().encode(`${ip}|${day}|${salt}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  const secret = Deno.env.get('TURNSTILE_SECRET_KEY')
  if (!secret) return false
  const body = new FormData()
  body.append('secret', secret)
  body.append('response', token)
  body.append('remoteip', ip)
  const res = await fetch(
    'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    { method: 'POST', body },
  )
  const result = await res.json()
  return result.success === true
}

async function tally(): Promise<Record<Faction, number>> {
  const counts = { utmist: 0, watai: 0 }
  for (const faction of FACTIONS) {
    const { count, error } = await admin
      .from('faction_cheers')
      .select('*', { count: 'exact', head: true })
      .eq('faction', faction)
    if (error) throw error
    counts[faction] = count ?? 0
  }
  return counts
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  // Identity comes ONLY from request headers plus the server-held salt, never
  // from the request body — anything the client sends in the body can be
  // forged and must never influence visitor_hash.
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('cf-connecting-ip') ??
    'unknown'

  try {
    if (req.method === 'GET') return json(await tally())

    if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

    let payload: Record<string, unknown>
    try {
      payload = await req.json()
    } catch {
      return json({ error: 'invalid body' }, 400)
    }

    const { faction, turnstileToken } = payload

    if (!isFaction(faction)) return json({ error: 'unknown faction' }, 400)
    if (typeof turnstileToken !== 'string' || !turnstileToken)
      return json({ error: 'captcha required' }, 400)
    if (!(await verifyTurnstile(turnstileToken, ip)))
      return json({ error: 'captcha failed' }, 403)

    // visitor_hash is derived solely from `ip` (header-sourced, above) and the
    // CHEER_HASH_SALT secret. `faction` and `turnstileToken` are the only
    // client-supplied values used, and neither feeds the hash.
    const visitor_hash = await hashVisitor(ip)

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
