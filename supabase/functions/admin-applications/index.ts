import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2';
import {
  CHECKIN_COLUMNS,
  checkinOutcome,
  extractStatusToken,
  publicCheckinFields,
  rsvpResetUpdate,
  type CheckinRow,
} from './checkin.ts';

// CORS origin is driven by ADMIN_ALLOWED_ORIGINS (comma-separated). If unset,
// we fall back to '*' so the function keeps working before it is configured.
// Auth is via bearer token (not cookies), so '*' is not itself a CSRF risk, but
// pinning to your real origin(s) is recommended once known.
function buildCorsHeaders(req: Request): Record<string, string> {
  const allowed = (Deno.env.get('ADMIN_ALLOWED_ORIGINS') || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const origin = req.headers.get('Origin') || '';

  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, PATCH, OPTIONS',
  };

  if (allowed.length === 0) {
    headers['Access-Control-Allow-Origin'] = '*';
  } else if (origin && allowed.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Vary'] = 'Origin';
  } else {
    headers['Access-Control-Allow-Origin'] = allowed[0];
    headers['Vary'] = 'Origin';
  }

  return headers;
}

const allowedStatuses = new Set([
  'incomplete',
  'submitted',
  'admitted',
  'waitlisted',
  'rejected',
]);

function jsonResponse(
  body: unknown,
  status = 200,
  corsHeaders: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

// Strip characters that have meaning in a PostgREST `or()` / ilike filter so a
// search term cannot break out of the value position and inject filter logic.
function sanitizeSearch(raw: unknown): string {
  return String(raw ?? '')
    .replace(/[,()*\\%"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
}

function getAdminAllowlist() {
  return (Deno.env.get('ADMIN_EMAIL_ALLOWLIST') || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

async function requireAdmin(req: Request, corsHeaders: Record<string, string>) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    throw new Error('Supabase function environment is not configured.');
  }

  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '');

  if (!token) {
    return {
      error: jsonResponse({ error: 'Missing auth token.' }, 401, corsHeaders),
      adminClient: null,
      user: null,
    };
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
  const {
    data: { user },
    error,
  } = await authClient.auth.getUser(token);

  if (error || !user?.email) {
    return {
      error: jsonResponse({ error: 'Invalid auth token.' }, 401, corsHeaders),
      adminClient: null,
      user: null,
    };
  }

  const allowlist = getAdminAllowlist();
  if (!allowlist.includes(user.email.toLowerCase())) {
    return {
      error: jsonResponse(
        { error: 'This email is not an admissions admin.' },
        403,
        corsHeaders,
      ),
      adminClient: null,
      user: null,
    };
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
    },
  });

  return { error: null, adminClient, user };
}

async function parseBody(req: Request) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { error, adminClient, user } = await requireAdmin(req, corsHeaders);
    if (error) {
      return error;
    }

    const body = await parseBody(req);

    if (req.method === 'POST' && body.action === 'resume-url') {
      if (!body.resume_path) {
        return jsonResponse({ error: 'Missing resume_path.' }, 400, corsHeaders);
      }

      const { data, error: signedUrlError } = await adminClient.storage
        .from('resumes')
        .createSignedUrl(body.resume_path, 60 * 5);

      if (signedUrlError) {
        return jsonResponse(
          { error: signedUrlError.message },
          400,
          corsHeaders,
        );
      }

      return jsonResponse({ url: data.signedUrl }, 200, corsHeaders);
    }

    // Door check-in. Every outcome is a 200 with a `result`: from the scan
    // page's point of view "not attending" and "unknown code" are answers to
    // show in red, not failures to retry.
    if (
      req.method === 'POST' &&
      (body.action === 'checkin' || body.action === 'checkin_by_email')
    ) {
      let query = adminClient.from('applications').select(CHECKIN_COLUMNS);
      if (body.action === 'checkin') {
        const token = extractStatusToken(body.statusToken);
        if (!token) {
          return jsonResponse({ result: 'not_found', application: null }, 200, corsHeaders);
        }
        query = query.eq('status_token', token);
      } else {
        const email = String(body.email ?? '').trim().toLowerCase();
        if (!email) {
          // Matches the sibling `checkin` branch above: an unresolvable
          // input is an outcome the door screen renders, not a failure to
          // retry, so both actions stay on the "always 200" contract.
          return jsonResponse({ result: 'not_found', application: null }, 200, corsHeaders);
        }
        // Rows written by submit-application are already lowercased; the
        // unique index is on lower(email), so this matches at most one row.
        query = query.ilike('email', email.replace(/[%_]/g, '\\$&'));
      }

      const { data: found, error: findError } = await query.maybeSingle();
      if (findError) {
        return jsonResponse({ error: findError.message }, 400, corsHeaders);
      }
      const row = (found as CheckinRow | null) ?? null;
      const outcome = checkinOutcome(row);
      if (outcome !== 'checked_in') {
        return jsonResponse(
          { result: outcome, application: row ? publicCheckinFields(row) : null },
          200,
          corsHeaders,
        );
      }

      // `is('checked_in_at', null)` makes two doors scanning the same person
      // at once race safely: one update matches, the other sees the result.
      const { data: updated, error: updateError } = await adminClient
        .from('applications')
        .update({ checked_in_at: new Date().toISOString(), checked_in_by: user.email })
        .eq('id', row!.id)
        .is('checked_in_at', null)
        .select(CHECKIN_COLUMNS)
        .maybeSingle();
      if (updateError) {
        return jsonResponse({ error: updateError.message }, 400, corsHeaders);
      }
      if (!updated) {
        const { data: again } = await adminClient
          .from('applications')
          .select(CHECKIN_COLUMNS)
          .eq('id', row!.id)
          .maybeSingle();
        return jsonResponse(
          {
            result: 'already_checked_in',
            application: publicCheckinFields((again as CheckinRow) ?? row!),
          },
          200,
          corsHeaders,
        );
      }
      return jsonResponse(
        { result: 'checked_in', application: publicCheckinFields(updated as CheckinRow) },
        200,
        corsHeaders,
      );
    }

    if (req.method === 'POST' && body.action === 'list') {
      const filters = body.filters || {};
      let query = adminClient
        .from('applications')
        .select('*')
        .order('submitted_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });

      if (filters.status && filters.status !== 'all') {
        query = query.eq('status', filters.status);
      }

      if (filters.school && filters.school !== 'all') {
        query = query.eq('school', filters.school);
      }

      const cleanSearch = sanitizeSearch(filters.search);
      if (cleanSearch) {
        const search = `%${cleanSearch}%`;
        query = query.or(
          `email.ilike.${search},first_name.ilike.${search},last_name.ilike.${search},school.ilike.${search},program.ilike.${search}`,
        );
      }

      const { data, error: listError } = await query;
      if (listError) {
        return jsonResponse({ error: listError.message }, 400, corsHeaders);
      }

      return jsonResponse({ applications: data || [] }, 200, corsHeaders);
    }

    if (req.method === 'PATCH') {
      if (!body.id) {
        return jsonResponse(
          { error: 'Missing application id.' },
          400,
          corsHeaders,
        );
      }

      const { data: current, error: currentError } = await adminClient
        .from('applications')
        .select('status, rsvp_status')
        .eq('id', body.id)
        .maybeSingle();
      if (currentError) {
        return jsonResponse({ error: currentError.message }, 400, corsHeaders);
      }
      if (!current) {
        return jsonResponse({ error: 'Application not found.' }, 404, corsHeaders);
      }

      const updates: Record<string, unknown> = {};
      const now = new Date().toISOString();

      if (body.status) {
        if (!allowedStatuses.has(body.status)) {
          return jsonResponse({ error: 'Invalid status.' }, 400, corsHeaders);
        }
        // Only a real change is a decision. Re-saving the same status (to
        // edit notes, say) used to re-stamp decided_at, which would now
        // silently extend a late admit's 24-hour RSVP window.
        if (body.status !== current.status) {
          const decided = ['admitted', 'waitlisted', 'rejected'].includes(body.status);
          updates.status = body.status;
          updates.decided_at = decided ? now : null;
          updates.decided_by = decided ? user.email : null;
        }
      }

      if (typeof body.admin_notes === 'string') {
        updates.admin_notes = body.admin_notes;
      }

      if (body.rsvp_reset === true) {
        Object.assign(updates, rsvpResetUpdate());
      }

      if (typeof body.checked_in === 'boolean') {
        if (body.checked_in && current.rsvp_status !== 'attending') {
          return jsonResponse(
            { error: 'Only someone who RSVP’d as attending can be checked in.' },
            409,
            corsHeaders,
          );
        }
        updates.checked_in_at = body.checked_in ? now : null;
        updates.checked_in_by = body.checked_in ? user.email : null;
      }

      if (Object.keys(updates).length === 0) {
        return jsonResponse({ error: 'Nothing to update.' }, 400, corsHeaders);
      }

      const { data, error: updateError } = await adminClient
        .from('applications')
        .update(updates)
        .eq('id', body.id)
        .select('*')
        .single();

      if (updateError) {
        return jsonResponse({ error: updateError.message }, 400, corsHeaders);
      }

      return jsonResponse({ application: data }, 200, corsHeaders);
    }

    return jsonResponse({ error: 'Unsupported admin action.' }, 405, corsHeaders);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unexpected error.';
    return jsonResponse({ error: message }, 500, corsHeaders);
  }
});
