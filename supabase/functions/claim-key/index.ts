// Hands each attending applicant exactly one Anthropic signup code.
//
// Same shape as submit-application: the browser holds no grant on
// public.event_signup_codes, so this function is the entire read/write surface,
// performed with the service role. There is no sign-in -- the applicant's
// status_token (the same bearer credential that gates RSVP) is the whole proof,
// so verify_jwt is off (see supabase/config.toml) and the guard is inside:
// a per-IP flood limit, a strict token shape, and the claim_signup_code() RPC
// which refuses anyone who is not admitted AND attending.
//
// Claim outcomes are results, not errors (like admin-applications' checkin): the
// 'claim' action always answers 200 with an { outcome, signup_link } body, and
// the page renders each outcome. Only malformed input and genuine faults are
// non-2xx.
//
// The pool is filled out of band by scripts/load-signup-codes.mjs writing with
// the service role directly -- there is deliberately no load endpoint here, so
// this public function can only ever hand a code to an attending applicant, not
// accept one.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2'
import {
  createRateLimiter,
  extractIp,
  normalizeIp,
  parseList,
  resolveAllowedOrigin,
} from '../_shared/identity.ts'

const STATUS_TOKEN_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const ALLOWED_ORIGINS = parseList(Deno.env.get('ALLOWED_ORIGIN'))

function corsFor(req: Request): Record<string, string> {
  return {
    'Access-Control-Allow-Origin':
      resolveAllowedOrigin(req.headers.get('origin'), ALLOWED_ORIGINS) ?? '*',
    Vary: 'Origin',
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

const json = (
  cors: Record<string, string>,
  body: unknown,
  status = 200,
  extra: Record<string, string> = {},
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, ...extra, 'Content-Type': 'application/json' },
  })

const rateLimiter = createRateLimiter()

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

Deno.serve(async (req) => {
  const cors = corsFor(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json(cors, { error: 'method not allowed' }, 405)

  const ip = extractIp(req.headers)

  try {
    if (ALLOWED_ORIGINS.length === 0) {
      return json(cors, { error: 'claiming is not configured' }, 503)
    }

    const rateLimit = rateLimiter.check(normalizeIp(ip))
    if (!rateLimit.allowed) {
      return json(cors, { error: 'too many requests' }, 429, {
        'Retry-After': String(rateLimit.retryAfterSeconds),
      })
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

    const { action } = payload as Record<string, unknown>

    // --- claim -------------------------------------------------------------
    if (action === 'claim') {
      const { statusToken } = payload as Record<string, unknown>
      // A malformed token is the same event as an unknown one, exactly like the
      // status page: it reads as not_found, never as an error.
      if (typeof statusToken !== 'string' || !STATUS_TOKEN_RE.test(statusToken)) {
        return json(cors, { outcome: 'not_found', signup_link: null })
      }

      const { data, error } = await admin.rpc('claim_signup_code', {
        p_token: statusToken,
      })
      if (error) {
        console.error('claim_signup_code error:', error.message)
        return json(cors, { error: 'claim failed' }, 500)
      }

      const row = Array.isArray(data) ? data[0] : data
      const outcome = (row?.outcome as string) ?? 'not_found'
      const signup_link = (row?.signup_link as string) ?? null
      return json(cors, { outcome, signup_link })
    }

    return json(cors, { error: 'unknown action' }, 400)
  } catch (e) {
    console.error('claim-key error:', (e as Error).message)
    return json(cors, { error: 'internal error' }, 500)
  }
})
