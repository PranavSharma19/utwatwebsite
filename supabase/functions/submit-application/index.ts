// Owns every applicant write to public.applications. The browser holds no
// grant on the table or the resumes bucket -- after
// 202608260003_anonymous_applications.sql it cannot insert, update, or read a
// row at all. Everything an applicant does arrives here, is checked, and is
// performed with the service role.
//
// This exists because applying used to require receiving a magic link, and
// university mail systems do not reliably deliver them: Waterloo's gateway
// refuses mail from shared sending pools outright, Microsoft accepts it and
// files it somewhere the applicant never sees, and Defender Safe Links fetches
// URLs to scan them -- which can spend a single-use token before the human
// clicks it. Email is now a form field, and nothing an applicant does depends
// on mail arriving.
//
// Three actions:
//   resume-upload-url  -> a short-lived signed URL, so a 10 MB PDF goes
//                         browser -> storage directly and never through here
//   submit             -> validate, insert, return the status token
//   status             -> read one row back by that token
//
// Turnstile gates the two that write. `status` does not take one: it is a read
// of a single row by an unguessable id, it is the thing an applicant reloads
// days later, and putting a captcha on it would mean solving a widget to find
// out whether you got in.
//
// The validation and row-shaping live in ./application.ts so they can be
// tested under vitest; this file is the IO around them.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2'
import {
  createRateLimiter,
  extractIp,
  isAllowedHostname,
  isIpAddress,
  normalizeIp,
  parseList,
  resolveAllowedOrigin,
} from '../_shared/identity.ts'
import { isDeadlinePassed, str, toRow, validate } from './application.ts'

const ALLOWED_ORIGINS = parseList(Deno.env.get('ALLOWED_ORIGIN'))
const TURNSTILE_EXPECTED_HOSTNAMES = parseList(
  Deno.env.get('TURNSTILE_EXPECTED_HOSTNAME'),
)

const RESUME_BUCKET = 'resumes'

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
  extraHeaders: Record<string, string> = {},
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, ...extraHeaders, 'Content-Type': 'application/json' },
  })

const rateLimiter = createRateLimiter()

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

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
  // Sitekeys ship in the page, so a token that verifies with Cloudflare only
  // proves it was solved for *some* site using this sitekey. Fails closed.
  return isAllowedHostname(result.hostname, TURNSTILE_EXPECTED_HOSTNAMES)
}

Deno.serve(async (req) => {
  const cors = corsFor(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') {
    return json(cors, { error: 'method not allowed' }, 405)
  }

  const ip = extractIp(req.headers)

  try {
    if (ALLOWED_ORIGINS.length === 0) {
      return json(cors, { error: 'applications are not configured' }, 503)
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

    const { action, turnstileToken, form, statusToken } =
      payload as Record<string, unknown>

    // --- status -----------------------------------------------------------
    // No captcha, by design (see the header). The token is the capability.
    // The column list is deliberately narrow: enough to render a status page,
    // nothing that would turn a leaked bookmark into a data disclosure.
    if (action === 'status') {
      if (typeof statusToken !== 'string' || !statusToken) {
        return json(cors, { error: 'missing token' }, 400)
      }
      const { data, error } = await admin
        .from('applications')
        .select('status, submitted_at, first_name, school, preferred_track')
        .eq('status_token', statusToken)
        .maybeSingle()
      if (error) throw error
      if (!data) return json(cors, { error: 'not found' }, 404)
      return json(cors, { application: data })
    }

    // Everything past here writes, so everything past here needs a token.
    if (typeof turnstileToken !== 'string' || !turnstileToken) {
      return json(cors, { error: 'captcha required' }, 400)
    }
    if (!(await verifyTurnstile(turnstileToken, ip))) {
      return json(cors, { error: 'captcha failed' }, 403)
    }

    if (isDeadlinePassed()) {
      return json(cors, { error: 'The application deadline has passed.' }, 403)
    }

    // --- resume-upload-url ------------------------------------------------
    // The path is ours, not the client's: a caller that could name its own
    // path could overwrite somebody else's resume. The uuid is generated here
    // and handed back, and `submit` only accepts a path in exactly this shape
    // that actually resolves to an object.
    if (action === 'resume-upload-url') {
      const path = `${crypto.randomUUID()}/resume.pdf`
      const { data, error } = await admin.storage
        .from(RESUME_BUCKET)
        .createSignedUploadUrl(path)
      if (error) throw error
      return json(cors, { path, token: data.token, signedUrl: data.signedUrl })
    }

    // --- submit -----------------------------------------------------------
    if (action !== 'submit') {
      return json(cors, { error: 'unknown action' }, 400)
    }
    if (form === null || typeof form !== 'object' || Array.isArray(form)) {
      return json(cors, { error: 'invalid body' }, 400)
    }

    const formRecord = form as Record<string, unknown>
    const errors = validate(formRecord)
    if (Object.keys(errors).length > 0) {
      return json(cors, { error: 'validation failed', errors }, 422)
    }

    // A path the client made up, or one whose upload never completed, must not
    // be recorded against the row -- the admin console would render a resume
    // link that 404s and nobody would know which applications were affected.
    const resumePath = str(formRecord.resume_path)
    if (resumePath) {
      const { data: listed, error: listError } = await admin.storage
        .from(RESUME_BUCKET)
        .list(resumePath.split('/')[0])
      if (listError) throw listError
      if (!listed?.some((entry) => entry.name === 'resume.pdf')) {
        return json(
          cors,
          {
            error: 'validation failed',
            errors: { resume_path: 'Re-upload your resume.' },
          },
          422,
        )
      }
    }

    const { data, error } = await admin
      .from('applications')
      .insert(toRow(formRecord))
      .select('id, status, status_token, submitted_at')
      .single()

    if (error) {
      // 23505 is unique_violation, which here means applications_email_uniq:
      // this address has already applied. That is a normal outcome a person
      // can act on, not a server fault, so it gets a field message rather
      // than a 500 they can do nothing with.
      if ((error as { code?: string }).code === '23505') {
        return json(
          cors,
          {
            error: 'validation failed',
            errors: {
              email: 'An application already exists for this email address.',
            },
          },
          409,
        )
      }
      throw error
    }

    return json(cors, { application: data })
  } catch (err) {
    console.error('submit-application failed', err)
    return json(cors, { error: 'internal error' }, 500)
  }
})
