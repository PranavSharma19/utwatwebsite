import { portalConfig } from './portalConfig';
import { requireSupabase } from './supabaseClient';

const SUBMIT_FUNCTION = 'submit-application';

/**
 * An error from an edge function that carries per-field messages.
 *
 * The submit endpoint re-runs every rule the form runs, because a server that
 * trusts the client's validation is not validating. When it rejects something
 * the client let through, the result has to land back on the offending field
 * rather than as a banner saying "validation failed" over a form that looks
 * fine -- otherwise the applicant has no way to find what is wrong.
 */
export class ApplicationError extends Error {
  constructor(message, fieldErrors = {}) {
    super(message);
    this.name = 'ApplicationError';
    this.fieldErrors = fieldErrors;
  }
}

async function toFunctionError(error) {
  const fallbackMessage = error?.message || 'Edge Function request failed.';

  if (!error?.context || typeof error.context.json !== 'function') {
    return new ApplicationError(fallbackMessage);
  }

  try {
    const payload = await error.context.json();
    const fieldErrors = payload?.errors;
    if (fieldErrors && typeof fieldErrors === 'object') {
      return new ApplicationError(
        payload.error === 'validation failed'
          ? 'Please fix the highlighted fields.'
          : payload.error || fallbackMessage,
        fieldErrors,
      );
    }
    if (payload?.error) {
      return new ApplicationError(payload.error);
    }
  } catch {
    // Ignore JSON parsing issues and fall back to the original error message.
  }

  return new ApplicationError(fallbackMessage);
}

async function callSubmitFunction(body) {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke(SUBMIT_FUNCTION, {
    method: 'POST',
    body,
  });

  if (error) {
    throw await toFunctionError(error);
  }

  return data;
}

/**
 * Uploads a resume without the browser ever holding a grant on the bucket.
 *
 * The function issues a signed URL for a path *it* chose, and the PDF then
 * goes straight from the browser to storage. Routing a 10 MB file through the
 * function instead would put it against the edge runtime's request limits for
 * no benefit, and a client-chosen path would let a caller overwrite somebody
 * else's resume.
 *
 * Returns the storage path to hand back at submit time.
 */
export async function uploadResume(file, turnstileToken) {
  const client = requireSupabase();
  const { path, token } = await callSubmitFunction({
    action: 'resume-upload-url',
    turnstileToken,
  });

  const { error } = await client.storage
    .from(portalConfig.resumeBucket)
    .uploadToSignedUrl(path, token, file, {
      contentType: 'application/pdf',
    });

  if (error) {
    throw new ApplicationError(error.message || 'Resume upload failed.');
  }

  return path;
}

/**
 * Submits an application. There is no draft on the server and no account
 * behind it: this is the single write, and it is final.
 *
 * Resolves to `{ id, status, status_token, submitted_at }`. The status_token
 * is what replaces "sign in to check your status". The browser also keeps a
 * copy, so this is what carries you back
 * to this application, so the caller must show it to the applicant rather
 * than only storing it.
 */
export async function submitApplication(formData, turnstileToken) {
  const { application } = await callSubmitFunction({
    action: 'submit',
    turnstileToken,
    form: formData,
  });

  return application;
}

/**
 * Reads one application back by its status token. Resolves to null when the
 * token matches nothing, which is the case for a mistyped or truncated
 * bookmark and should read as "we can't find that" rather than as an error.
 */
export async function fetchApplicationStatus(statusToken) {
  try {
    const { application } = await callSubmitFunction({
      action: 'status',
      statusToken,
    });
    return application;
  } catch (error) {
    if (error?.message === 'not found') {
      return null;
    }
    throw error;
  }
}

// --- Admin console ---------------------------------------------------------
//
// The admin path still authenticates, and deliberately so. It is a handful of
// organizers rather than every applicant, they can use whatever address
// actually receives mail, and the console reads every application there is --
// which is exactly the surface that should sit behind a login.

export async function listAdminApplications(filters = {}) {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke(
    portalConfig.adminFunctionName,
    {
      method: 'POST',
      body: {
        action: 'list',
        filters,
      },
    },
  );

  if (error) {
    throw await toFunctionError(error);
  }

  return data.applications || [];
}

export async function updateAdminApplication(applicationId, updates) {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke(
    portalConfig.adminFunctionName,
    {
      method: 'PATCH',
      body: {
        id: applicationId,
        ...updates,
      },
    },
  );

  if (error) {
    throw await toFunctionError(error);
  }

  return data.application;
}

export async function createAdminResumeUrl(path) {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke(
    portalConfig.adminFunctionName,
    {
      method: 'POST',
      body: {
        action: 'resume-url',
        resume_path: path,
      },
    },
  );

  if (error) {
    throw await toFunctionError(error);
  }

  return data.url;
}
