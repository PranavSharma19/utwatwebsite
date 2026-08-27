/**
 * Where an in-progress application lives now that there is no account to hang
 * a server-side draft off.
 *
 * The old portal wrote every keystroke-batch to an `applications` row with
 * status 'incomplete', which is what made "save a draft, come back later"
 * possible -- and which is also what required an account, which required a
 * magic link, which university mail systems would not reliably deliver. The
 * draft moves into the browser so that applying needs nothing but the browser.
 *
 * The trade is real and worth stating plainly: a draft is per-browser and
 * per-device. Start on a laptop and you finish on that laptop. The form says
 * so. In exchange, an applicant whose school silently drops our mail can still
 * apply, which the previous arrangement did not allow at all.
 *
 * Every access is wrapped: localStorage throws outright in Safari's private
 * mode and when a browser is set to block site data, and a storage failure
 * must never be the reason somebody cannot fill in a form.
 */

// Versioned so a change to the form's shape retires old drafts instead of
// rehydrating a half-matching object into it.
const DRAFT_KEY = 'bots2026.application.draft.v1';
const SUBMITTED_KEY = 'bots2026.application.submitted.v1';

function readJson(key) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function remove(key) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Nothing to do -- the draft simply outlives the session.
  }
}

/** Returns `{ formData, resumePath, resumeName }`, or null when there is no
 *  usable draft. */
export function loadDraft() {
  const stored = readJson(DRAFT_KEY);
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
    return null;
  }
  const { formData, resumePath, resumeName } = stored;
  if (!formData || typeof formData !== 'object' || Array.isArray(formData)) {
    return null;
  }
  return {
    formData,
    resumePath: typeof resumePath === 'string' ? resumePath : '',
    // Older drafts predate this field; an empty name falls back to a
    // generic "Resume attached." rather than rendering "undefined".
    resumeName: typeof resumeName === 'string' ? resumeName : '',
  };
}

export function saveDraft(formData, resumePath = '', resumeName = '') {
  return writeJson(DRAFT_KEY, { formData, resumePath, resumeName });
}

export function clearDraft() {
  remove(DRAFT_KEY);
}

/**
 * The receipt for a submitted application: `{ id, statusToken, submittedAt }`.
 *
 * Kept separately from the draft and deliberately NOT cleared, so that
 * reopening /apply on the same browser lands on "you already applied, here is
 * your status link" rather than on an empty form inviting a second attempt
 * that the unique index on the email address would reject anyway.
 */
export function loadSubmission() {
  const stored = readJson(SUBMITTED_KEY);
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
    return null;
  }
  return typeof stored.statusToken === 'string' && stored.statusToken
    ? stored
    : null;
}

export function saveSubmission(submission) {
  return writeJson(SUBMITTED_KEY, submission);
}

export function clearSubmission() {
  remove(SUBMITTED_KEY);
}
