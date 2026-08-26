// Authenticated stress suite for the applicant portal. Needs .out/sessions.json
// from sessions.mjs (at least 2 test applicants). Everything here is what a
// real applicant, an impatient applicant, or a curious applicant with DevTools
// open could do with their own JWT and the public anon key.
//
//   node scripts/stress/applicant-suite.mjs            # runs every section
//   STRESS_SKIP_BIG_UPLOAD=1 node scripts/stress/applicant-suite.mjs
import { Buffer } from 'node:buffer';
import {
  anonClient,
  errorSummary,
  getConfig,
  loadJson,
  logWarnings,
  pad,
  saveJson,
  userClient,
} from './lib.mjs';
import {
  emptyApplicationForm,
  isDeadlinePassed,
  portalConfig,
} from '../../src/admissions/portalConfig.js';

const config = getConfig();
logWarnings(config);
const anon = anonClient(config);
const results = [];
let section = '';

function begin(title) {
  section = title;
  console.log(`\n=== ${title}`);
}

// ok=true means the portal behaved correctly for this scenario (accepted what it
// should accept, blocked what it should block). ok=null is informational.
function record(name, ok, detail = '', extra = {}) {
  results.push({ section, name, ok, detail, ...extra });
  const tag = ok === null ? 'INFO' : ok ? 'PASS' : 'FAIL';
  console.log(`  ${tag} ${pad(name, 74)} ${detail}`);
}

// Mirrors formToApplicationPayload() in src/admissions/applicationService.js
// (which cannot be imported outside Vite because it touches import.meta.env).
const FORM_COLUMNS = [
  'first_name', 'last_name', 'phone', 'school', 'program', 'level_of_study',
  'graduation_year', 'over_18', 'can_attend_in_person', 'ml_skill_level',
  'hackathon_count', 'preferred_track',
];
const LINK_FIELDS = ['github_url', 'linkedin_url', 'portfolio_url', 'devpost_url'];
const RESPONSE_FIELDS = ['why_bots', 'project_story', 'future_build', 'anything_else', 'joke'];
const AGREEMENT_FIELDS = ['agree_code_of_conduct', 'agree_privacy', 'agree_accuracy'];

function payloadFrom(form) {
  return {
    ...Object.fromEntries(FORM_COLUMNS.map((k) => [k, form[k]])),
    team_intent: form.team_intent,
    team_emails: String(form.teammate_emails || '')
      .split(',').map((s) => s.trim()).filter(Boolean),
    links: Object.fromEntries(LINK_FIELDS.map((k) => [k, form[k]?.trim() || null])),
    responses: Object.fromEntries(RESPONSE_FIELDS.map((k) => [k, form[k]?.trim() || ''])),
    agreements: Object.fromEntries(AGREEMENT_FIELDS.map((k) => [k, Boolean(form[k])])),
  };
}

function validForm(overrides = {}) {
  return {
    ...emptyApplicationForm,
    first_name: 'STRESS TEST',
    last_name: 'Applicant',
    phone: '+1 647 555 0100',
    program: 'Computer Science',
    why_bots: 'Stress-test draft. Safe to delete.',
    project_story: 'A project.',
    future_build: 'Robots.',
    over_18: true,
    can_attend_in_person: true,
    agree_privacy: true,
    agree_accuracy: true,
    ...overrides,
  };
}

// Mirrors getOrCreateApplication() — the exact select-then-insert the page does.
async function getOrCreate(client, user) {
  const { data: existing, error: fetchError } = await client
    .from('applications').select('*').eq('user_id', user.id).maybeSingle();
  if (fetchError) throw fetchError;
  if (existing) return existing;
  const { data, error } = await client
    .from('applications')
    .insert({
      user_id: user.id,
      email: user.email,
      status: 'incomplete',
      school: portalConfig.allowedSchools[0],
      level_of_study: portalConfig.levelsOfStudy[0],
      graduation_year: portalConfig.graduationYears[1],
      preferred_track: portalConfig.tracks[0],
      links: {}, responses: {}, agreements: {}, team_emails: [],
    })
    .select('*').single();
  if (error) throw error;
  return data;
}

// Mirrors saveApplicationDraft().
async function saveDraft(client, appId, payload) {
  return client.from('applications').update(payload).eq('id', appId).select('*').single();
}

async function timedAll(tasks) {
  const t0 = performance.now();
  const settled = await Promise.all(
    tasks.map(async (fn) => {
      const t = performance.now();
      try {
        return { ok: true, value: await fn(), ms: Math.round(performance.now() - t) };
      } catch (error) {
        return { ok: false, error, ms: Math.round(performance.now() - t) };
      }
    }),
  );
  return { settled, wallMs: Math.round(performance.now() - t0) };
}

// ---------------------------------------------------------------------------
// 0. Sessions
// ---------------------------------------------------------------------------
begin('0. Sessions');
let sessions = loadJson('sessions.json', []);
const live = [];
for (const s of sessions) {
  const { data, error } = await anon.auth.refreshSession({ refresh_token: s.refresh_token });
  if (error || !data.session) {
    record(`refresh ${s.email}`, null, `dropped: ${errorSummary(error) || 'no session'}`);
    continue;
  }
  live.push({
    ...s,
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at,
    user: data.user,
    client: userClient(config, data.session.access_token),
  });
}
sessions = live;
saveJson('sessions.json', sessions.map((s) => {
  const { client: _client, user: _user, ...rest } = s;
  return rest;
}));
record('usable applicant sessions', sessions.length >= 2, `${sessions.length}`);

// ---------------------------------------------------------------------------
// 1. Things that need no session at all
// ---------------------------------------------------------------------------
begin('1. Unauthenticated surface (anon key only)');
{
  const { data, error } = await anon.from('applications').select('id,email');
  record('anon cannot read applications', !error && data.length === 0, error ? errorSummary(error) : `${data.length} rows`);
  const upd = await anon.from('applications').update({ first_name: 'x' }).eq('status', 'incomplete').select('id');
  record('anon cannot update applications', Boolean(upd.error) || upd.data?.length === 0, upd.error ? errorSummary(upd.error) : `${upd.data?.length} rows touched`);
  const rpc = await anon.rpc('submit_application', { p_application_id: '00000000-0000-0000-0000-000000000000' });
  record('anon cannot call submit_application', Boolean(rpc.error), errorSummary(rpc.error));
  const bad = userClient(config, 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYXV0aGVudGljYXRlZCIsInN1YiI6IjAwMDAwMDAwLTAwMDAtMDAwMC0wMDAwLTAwMDAwMDAwMDAwMCJ9.invalid');
  const forged = await bad.from('applications').select('id');
  record('forged JWT is rejected', Boolean(forged.error), errorSummary(forged.error));
  const list = await anon.storage.from('resumes').list('');
  record('anon cannot list resumes bucket', !list.error && list.data.length === 0, list.error ? errorSummary(list.error) : `${list.data.length} entries`);
}

if (sessions.length < 2) {
  console.log('\nNeed at least 2 sessions for the rest. Run sessions.mjs first.');
  saveJson('applicant-suite.json', results);
  process.exit(0);
}

const [me, other] = sessions;

// ---------------------------------------------------------------------------
// 2. Concurrency
// ---------------------------------------------------------------------------
begin('2. Concurrency — first load, double tab, parallel saves');
{
  // Magic link opens in a new tab while the old tab also reacts to the auth
  // change: both run select-then-insert at the same time.
  const { settled, wallMs } = await timedAll(
    sessions.flatMap((s) => [() => getOrCreate(s.client, s.user), () => getOrCreate(s.client, s.user)]),
  );
  const failures = settled.filter((r) => !r.ok);
  record(
    `${sessions.length} applicants x 2 tabs load at once`,
    failures.length === 0,
    `${failures.length}/${settled.length} tab loads failed, wall ${wallMs}ms` +
      (failures[0] ? ` — applicant sees: "${failures[0].error.message}"` : ''),
    { failures: failures.map((f) => errorSummary(f.error)) },
  );
}
const apps = new Map();
{
  const { settled, wallMs } = await timedAll(sessions.map((s) => () => getOrCreate(s.client, s.user)));
  settled.forEach((r, i) => r.ok && apps.set(sessions[i].email, r.value));
  const slowest = Math.max(...settled.map((r) => r.ms));
  record(`${sessions.length} applicants load their application at once`, settled.every((r) => r.ok), `wall ${wallMs}ms, slowest ${slowest}ms`);
}
{
  const { settled, wallMs } = await timedAll(
    sessions.map((s, i) => () => saveDraft(s.client, apps.get(s.email).id, payloadFrom(validForm({ last_name: `Applicant ${i + 1}` }))).then((r) => { if (r.error) throw r.error; return r.data; })),
  );
  const slowest = Math.max(...settled.map((r) => r.ms));
  const firstFail = settled.find((r) => !r.ok);
  record(`${sessions.length} applicants save a full draft at once`, settled.every((r) => r.ok), `wall ${wallMs}ms, slowest ${slowest}ms` + (firstFail ? ` — ${errorSummary(firstFail.error)}` : ''));
}
{
  const names = ['Tab A', 'Tab B', 'Tab C', 'Tab D', 'Tab E'];
  const { settled } = await timedAll(
    names.map((n) => () => saveDraft(me.client, apps.get(me.email).id, payloadFrom(validForm({ first_name: n }))).then((r) => { if (r.error) throw r.error; return r.data; })),
  );
  const { data } = await me.client.from('applications').select('first_name').eq('id', apps.get(me.email).id).single();
  record('same applicant saves from 5 tabs at once', settled.every((r) => r.ok), `all accepted; winner "${data?.first_name}" (last write wins, no version check — a stale tab silently overwrites newer edits)`);
}

// ---------------------------------------------------------------------------
// 3. Garbage through "Save Draft" (the save path skips client validation)
// ---------------------------------------------------------------------------
begin('3. Wrong things in wrong places — what the server accepts');
const meApp = apps.get(me.email);
const cases = [
  // [name, form overrides OR { __raw: payload patch }, expectation]
  ['letters in phone: "hello"', { phone: 'hello' }, 'reject'],
  ['phone number typed in first_name', { first_name: '6475550100' }, 'reject'],
  ['emoji + RTL + zero-width name', { first_name: '\u{1F916}‮ada​' }, 'accept'],
  ['whitespace-only required answers', { first_name: '   ', why_bots: '\n\n' }, 'reject'],
  ['201-char first_name (DB cap 200)', { first_name: 'a'.repeat(201) }, 'reject'],
  ['51-char phone (DB cap 50)', { phone: '1'.repeat(51) }, 'reject'],
  ['301-char program (DB cap 300)', { program: 'a'.repeat(301) }, 'reject'],
  ['three 7 000-char essays (responses cap 20 000)', { why_bots: 'a'.repeat(7000), project_story: 'b'.repeat(7000), future_build: 'c'.repeat(7000) }, 'reject'],
  ['one 1 000 000-char essay', { why_bots: 'a'.repeat(1_000_000) }, 'reject'],
  ['21 teammate emails (DB cap 20)', { teammate_emails: Array.from({ length: 21 }, (_, i) => `t${i}@x.co`).join(',') }, 'reject'],
  ['20 teammate "emails" of 5 000 chars each', { teammate_emails: Array.from({ length: 20 }, () => 'x'.repeat(5000)).join(',') }, 'reject'],
  ['teammate emails that are not emails', { teammate_emails: 'not an email, also not' }, 'reject'],
  ['github link without scheme "github.com/ada"', { github_url: 'github.com/ada' }, 'reject'],
  ['github link "javascript:alert(1)"', { github_url: 'javascript:alert(1)' }, 'reject'],
  ['github link uppercase scheme', { github_url: 'HTTPS://GITHUB.COM/ada' }, 'accept'],
  ['school outside allowlist "MIT"', { school: 'MIT' }, 'reject'],
  ['graduation_year "1999" (not an option)', { graduation_year: '1999' }, 'reject'],
  ['level_of_study "Kindergarten"', { level_of_study: 'Kindergarten' }, 'reject'],
  ['preferred_track "Crypto"', { preferred_track: 'Crypto' }, 'reject'],
  ['hackathon_count "banana"', { hackathon_count: 'banana' }, 'reject'],
  ['ml_skill_level "God"', { ml_skill_level: 'God' }, 'reject'],
  ['HTML in name "<script>alert(1)</script>"', { first_name: '<script>alert(1)</script>' }, 'accept'],
  ["SQL in name \"'; DROP TABLE applications; --\"", { first_name: "'; DROP TABLE applications; --" }, 'accept'],
  ['NUL byte in name', { first_name: 'a b' }, 'reject'],
  ['CSV formula in name "=1+1"', { first_name: '=1+1' }, 'accept'],
  ['raw: over_18 = "yes" (string into boolean column)', { __raw: { over_18: 'yes' } }, 'reject'],
  ['raw: hackathon_count = 5 (number into text column)', { __raw: { hackathon_count: 5 } }, 'accept'],
  ['raw: links = [] (array instead of object)', { __raw: { links: [] } }, 'reject'],
  ['raw: links = {github_url: 123}', { __raw: { links: { github_url: 123 } } }, 'reject'],
  ['raw: responses with unknown key {hack: "x"}', { __raw: { responses: { hack: 'x' } } }, 'reject'],
  ['raw: unknown column foo=1', { __raw: { foo: 1 } }, 'reject'],
  ['raw: team_emails = "a@b.co" (string, not array)', { __raw: { team_emails: 'a@b.co' } }, 'reject'],
];
for (const [name, patch, expectation] of cases) {
  const payload = patch.__raw ? { ...payloadFrom(validForm()), ...patch.__raw } : payloadFrom(validForm(patch));
  const t = performance.now();
  const { data, error } = await saveDraft(me.client, meApp.id, payload);
  const ms = Math.round(performance.now() - t);
  const accepted = !error;
  const ok = expectation === 'accept' ? accepted : !accepted;
  let detail = accepted ? `ACCEPTED (${ms}ms)` : `rejected (${ms}ms): "${error.message}"`;
  if (accepted && expectation === 'reject') detail += ' — stored as-is; nothing on the server objects';
  if (!accepted && expectation === 'reject') detail += ' <- this exact text is what the applicant sees';
  if (accepted && data && patch.first_name !== undefined && data.first_name !== patch.first_name) detail += ` (stored as ${JSON.stringify(data.first_name)})`;
  record(name, ok, detail, { expectation, accepted, message: error?.message, code: error?.code });
}
// restore a sane draft
await saveDraft(me.client, meApp.id, payloadFrom(validForm()));

// ---------------------------------------------------------------------------
// 4. Privilege escalation with DevTools open (every one must be blocked)
// ---------------------------------------------------------------------------
begin('4. Direct-API privilege tests (all must be blocked)');
const otherApp = apps.get(other.email);
const blocked = async (name, promise) => {
  const res = await promise;
  const rows = Array.isArray(res.data) ? res.data.length : res.data ? 1 : 0;
  const isBlocked = Boolean(res.error) || rows === 0;
  record(name, isBlocked, res.error ? `blocked: ${errorSummary(res.error)}` : `no error, ${rows} row(s) affected`);
  return res;
};
const escalations = {
  status: 'admitted',
  admin_notes: 'pwned',
  submitted_at: new Date().toISOString(),
  email: 'admin@evil.example',
  user_id: other.user.id,
  decided_by: 'me',
  decided_at: new Date().toISOString(),
  created_at: '2000-01-01',
  updated_at: '2000-01-01',
};
for (const [col, value] of Object.entries(escalations)) {
  await blocked(`update own ${col}`, me.client.from('applications').update({ [col]: value }).eq('id', meApp.id).select('id'));
}
await blocked("update resume_path into another applicant's folder", me.client.from('applications').update({ resume_path: `${other.user.id}/${otherApp.id}/resume.pdf` }).eq('id', meApp.id).select('id'));
await blocked("update another applicant's draft by id", me.client.from('applications').update({ first_name: 'hijacked' }).eq('id', otherApp.id).select('id'));
{
  const { data } = await me.client.from('applications').select('id,email');
  record('select * returns only my own row', data?.length === 1 && data[0].id === meApp.id, `${data?.length} row(s)`);
}
await blocked("select another applicant's row by id", me.client.from('applications').select('email').eq('id', otherApp.id));
await blocked('insert a second application for myself', me.client.from('applications').insert({ user_id: me.user.id, email: me.user.email, status: 'incomplete' }).select('id'));
await blocked('insert a row claiming another user_id and a fake email', me.client.from('applications').insert({ user_id: other.user.id, email: 'admin@evil.example', status: 'incomplete' }).select('id'));
await blocked('insert a row that starts as "submitted"', me.client.from('applications').insert({ user_id: me.user.id, email: me.user.email, status: 'submitted' }).select('id'));
await blocked("submit_application on someone else's id", me.client.rpc('submit_application', { p_application_id: otherApp.id }));
await blocked('submit_application with garbage id', me.client.rpc('submit_application', { p_application_id: 'abc' }));
await blocked('delete my own application', me.client.from('applications').delete().eq('id', meApp.id).select('id'));
{
  const { data, error } = await me.client.auth.getUser();
  record('token still valid after all of that (no lockout side effects)', !error && data.user.id === me.user.id, errorSummary(error));
}

// ---------------------------------------------------------------------------
// 5. Storage
// ---------------------------------------------------------------------------
begin('5. Resume storage');
const pdfBytes = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
const myPath = `${me.user.id}/${meApp.id}/resume.pdf`;
{
  const up = await me.client.storage.from('resumes').upload(myPath, pdfBytes, { contentType: 'application/pdf', upsert: true });
  record('upload a PDF to my own folder', !up.error, errorSummary(up.error));
  const link = await saveDraft(me.client, meApp.id, { resume_path: myPath });
  record('point resume_path at my own upload', !link.error, errorSummary(link.error));
}
{
  const exePath = `${me.user.id}/${meApp.id}/resume.exe`;
  const up = await me.client.storage.from('resumes').upload(exePath, Buffer.from('MZ not a pdf at all'), { contentType: 'application/pdf', upsert: true });
  record('non-PDF bytes labelled application/pdf (client hardcodes the type)', Boolean(up.error), up.error ? errorSummary(up.error) : 'ACCEPTED — bucket only checks the declared MIME type');
  if (!up.error) await me.client.storage.from('resumes').remove([exePath]);
}
{
  const up = await me.client.storage.from('resumes').upload(`${me.user.id}/${meApp.id}/notes.txt`, Buffer.from('hi'), { contentType: 'text/plain', upsert: true });
  record('text/plain upload is rejected by the bucket', Boolean(up.error), errorSummary(up.error));
}
{
  const up = await me.client.storage.from('resumes').upload(`${other.user.id}/${otherApp.id}/resume.pdf`, pdfBytes, { contentType: 'application/pdf', upsert: true });
  record("upload into another applicant's folder", Boolean(up.error), errorSummary(up.error));
}
{
  const up = await me.client.storage.from('resumes').upload(`${me.user.id}/../${other.user.id}/resume.pdf`, pdfBytes, { contentType: 'application/pdf', upsert: true });
  record('path traversal "<me>/../<other>/resume.pdf"', Boolean(up.error), up.error ? errorSummary(up.error) : `ACCEPTED as ${JSON.stringify(up.data?.path)}`);
}
{
  const list = await me.client.storage.from('resumes').list(other.user.id);
  record("list another applicant's folder", !list.error && list.data.length === 0, list.error ? errorSummary(list.error) : `${list.data.length} entries visible`);
}
{
  const dl = await me.client.storage.from('resumes').download(myPath);
  record('download my own resume', !dl.error, errorSummary(dl.error));
  const dl2 = await me.client.storage.from('resumes').download(`${other.user.id}/${otherApp.id}/resume.pdf`);
  record("download another applicant's resume by guessed path", Boolean(dl2.error), errorSummary(dl2.error));
}
if (!process.env.STRESS_SKIP_BIG_UPLOAD) {
  const bigPath = `${me.user.id}/${meApp.id}/big.pdf`;
  const big = Buffer.alloc(portalConfig.maxResumeBytes + 1, 0x20);
  const t = performance.now();
  const up = await me.client.storage.from('resumes').upload(bigPath, big, { contentType: 'application/pdf', upsert: true });
  record('10 MB + 1 byte upload is rejected by the bucket', Boolean(up.error), `${Math.round(performance.now() - t)}ms ${errorSummary(up.error) || 'ACCEPTED'}`);
  if (!up.error) await me.client.storage.from('resumes').remove([bigPath]);
}

// ---------------------------------------------------------------------------
// 6. Submit
// ---------------------------------------------------------------------------
begin('6. Submit path');
record('client-side deadline check', null, `${portalConfig.applicationDeadlineIso} -> isDeadlinePassed() = ${isDeadlinePassed()}`);
{
  // Blank draft straight to the RPC: the server does not validate content.
  const blankApp = apps.get(other.email);
  await saveDraft(other.client, blankApp.id, payloadFrom({ ...emptyApplicationForm }));
  const rpc = await other.client.rpc('submit_application', { p_application_id: blankApp.id });
  if (rpc.error && /deadline/i.test(rpc.error.message)) {
    record('submit a completely blank application via RPC', null, `blocked only by the deadline: "${rpc.error.message}" — re-run after moving the deadline; the RPC has no required-field check`);
  } else {
    record('submit a completely blank application via RPC', Boolean(rpc.error), rpc.error ? errorSummary(rpc.error) : 'ACCEPTED — a blank application is now "submitted"');
  }
}
{
  await saveDraft(me.client, meApp.id, payloadFrom(validForm()));
  const [a, b] = await Promise.all([
    me.client.rpc('submit_application', { p_application_id: meApp.id }),
    me.client.rpc('submit_application', { p_application_id: meApp.id }),
  ]);
  const okCount = [a, b].filter((r) => !r.error).length;
  const deadline = [a, b].some((r) => /deadline/i.test(r.error?.message || ''));
  record('double-click Submit (two RPC calls at once)', deadline ? null : okCount === 1, deadline ? `both blocked by deadline: "${a.error?.message}"` : `${okCount} succeeded, other: "${(a.error || b.error)?.message}"`);
  if (okCount >= 1) {
    const save = await saveDraft(me.client, meApp.id, payloadFrom(validForm({ first_name: 'after submit' })));
    record('edit the draft after submitting (stale tab)', Boolean(save.error), save.error ? `blocked, applicant sees: "${save.error.message}"` : 'ACCEPTED — submitted application was edited');
    const again = await me.client.rpc('submit_application', { p_application_id: meApp.id });
    record('submit twice', Boolean(again.error), errorSummary(again.error));
    const up = await me.client.storage.from('resumes').upload(myPath, Buffer.from('%PDF-1.4 replaced after submit'), { contentType: 'application/pdf', upsert: true });
    record('replace the resume file after submitting', Boolean(up.error), up.error ? errorSummary(up.error) : 'ACCEPTED — storage policy does not check application status');
  }
}

// cleanup of storage objects we created (rows are cleaned by cleanup.mjs)
await me.client.storage.from('resumes').remove([myPath]);
await saveDraft(me.client, meApp.id, { resume_path: null });

const path = saveJson('applicant-suite.json', results);
const fails = results.filter((r) => r.ok === false).length;
console.log(`\n${results.length} checks, ${fails} FAIL. Saved ${path}`);
