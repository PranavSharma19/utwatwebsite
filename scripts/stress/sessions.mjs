// Turn the test applicants into real sessions (JWT + refresh token), saved to
// .out/sessions.json for applicant-suite.mjs.
//
// Path A (no inbox needed):  SUPABASE_SERVICE_ROLE_KEY=... node scripts/stress/sessions.mjs
//   Creates the users (idempotent) and mints magic-link token hashes with the
//   admin API, then exchanges them for sessions. Nothing is emailed.
// Path B (from the inbox):   STRESS_MAGIC_LINKS=links.txt node scripts/stress/sessions.mjs
//   links.txt holds one unclicked magic-link URL per line, copied from the
//   "Your Magic Link" emails the signup burst produced.
import { readFileSync } from 'node:fs';
import {
  anonClient,
  errorSummary,
  getConfig,
  loadJson,
  logWarnings,
  saveJson,
  serviceClient,
  testEmails,
} from './lib.mjs';

const config = getConfig();
logWarnings(config);
const anon = anonClient(config);
const sessions = loadJson('sessions.json', []);

function upsert(session) {
  const i = sessions.findIndex((s) => s.email === session.email);
  if (i >= 0) sessions[i] = session;
  else sessions.push(session);
}

async function exchange(email, tokenHash, type = 'magiclink') {
  const { data, error } = await anon.auth.verifyOtp({
    token_hash: tokenHash,
    type,
  });
  if (error) {
    console.log(`  ${email}: verifyOtp failed: ${errorSummary(error)}`);
    return null;
  }
  const s = data.session;
  upsert({
    email: data.user.email,
    user_id: data.user.id,
    access_token: s.access_token,
    refresh_token: s.refresh_token,
    expires_at: s.expires_at,
  });
  console.log(`  ${email}: session OK (user ${data.user.id})`);
  return s;
}

if (config.serviceRoleKey) {
  console.log('Path A: minting sessions with the service role (no email sent)');
  const admin = serviceClient(config);
  for (const email of testEmails(config)) {
    const created = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { stress_test: true },
    });
    if (created.error && !/already/i.test(created.error.message)) {
      console.log(`  ${email}: createUser failed: ${errorSummary(created.error)}`);
      continue;
    }
    const { data, error } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });
    if (error) {
      console.log(`  ${email}: generateLink failed: ${errorSummary(error)}`);
      continue;
    }
    await exchange(email, data.properties.hashed_token, 'magiclink');
  }
} else if (process.env.STRESS_MAGIC_LINKS) {
  console.log('Path B: exchanging magic links from', process.env.STRESS_MAGIC_LINKS);
  const lines = readFileSync(process.env.STRESS_MAGIC_LINKS, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('http'));
  for (const line of lines) {
    const url = new URL(line);
    const token = url.searchParams.get('token');
    const type = url.searchParams.get('type') || 'magiclink';
    if (!token) {
      console.log(`  skipping (no token param): ${line.slice(0, 80)}`);
      continue;
    }
    await exchange(`link#${lines.indexOf(line) + 1}`, token, type);
  }
} else {
  console.log(
    'Nothing to do. Set SUPABASE_SERVICE_ROLE_KEY (path A) or STRESS_MAGIC_LINKS (path B).',
  );
  process.exit(1);
}

const path = saveJson('sessions.json', sessions);
console.log(`${sessions.length} session(s) saved to ${path}`);
