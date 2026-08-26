// Scenario: N applicants request a sign-in link at the same instant.
// Also: impatient double-click, and odd/malformed email addresses.
// Usage: STRESS_EMAIL_BASE=you@gmail.com STRESS_USERS=10 node scripts/stress/signup-burst.mjs
import {
  anonClient,
  errorSummary,
  getConfig,
  logWarnings,
  pad,
  saveJson,
  testEmails,
} from './lib.mjs';

const config = getConfig();
logWarnings(config);
const emails = testEmails(config);
const client = anonClient(config);
const report = { startedAt: new Date().toISOString(), scenarios: {} };

async function otp(email) {
  const t = performance.now();
  const { error } = await client.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: config.redirectTo },
  });
  return {
    email,
    ms: Math.round(performance.now() - t),
    ok: !error,
    status: error?.status,
    code: error?.code,
    error: error?.message,
  };
}

function printRows(rows) {
  for (const r of rows) {
    console.log(
      `  ${pad(r.email, 48)} ${pad(r.ms + 'ms', 8)} ${r.ok ? 'OK  ' : 'FAIL'} ${
        r.ok ? '' : errorSummary({ status: r.status, code: r.code, message: r.error })
      }`,
    );
  }
}

console.log(
  `\n=== A. ${emails.length} people click "Send Sign-In Link" at the same instant`,
);
const t0 = performance.now();
const burst = await Promise.all(emails.map(otp));
const wall = Math.round(performance.now() - t0);
printRows(burst);
const okA = burst.filter((r) => r.ok).length;
console.log(`  -> ${okA}/${burst.length} accepted, wall-clock ${wall}ms`);
const rateLimited = burst.filter((r) => /rate limit/i.test(r.error || ''));
if (rateLimited.length) {
  console.log(
    `  -> ${rateLimited.length} rejected by the auth email rate limit. Those applicants see "${rateLimited[0].error}" and never get a link.`,
  );
}
const captcha = burst.filter((r) => /captcha/i.test(r.error || ''));
if (captcha.length) {
  console.log(
    `  -> Supabase Auth CAPTCHA is enforced server-side (${captcha.length} rejected without a token).`,
  );
} else if (okA > 0) {
  console.log(
    '  -> No CAPTCHA enforced server-side: the Turnstile widget in AuthPanel is cosmetic; a script can request links freely.',
  );
}
report.scenarios.burst = { wallMs: wall, results: burst };

console.log('\n=== B. One applicant double-clicks "Send Sign-In Link"');
const dbl = await Promise.all([otp(emails[0]), otp(emails[0])]);
printRows(dbl);
report.scenarios.doubleClick = dbl;

console.log('\n=== C. Odd / malformed addresses (what the server accepts)');
const [local, domain] = config.emailBase.split('@');
const odd = [
  'not-an-email',
  'a@b',
  'spaces in@gmail.com',
  `  ${emails[1]}  `,
  emails[2].toUpperCase(),
  `${local}+bots-stress-3@${domain}.`,
  'x@localhost',
  'a'.repeat(250) + '@gmail.com',
  `${local}+bots-stress-1@${domain}\n`,
];
const oddResults = [];
for (const email of odd) {
  const r = await otp(email);
  oddResults.push(r);
}
printRows(oddResults.map((r) => ({ ...r, email: JSON.stringify(r.email) })));
report.scenarios.oddEmails = oddResults;

const path = saveJson('signup-burst.json', report);
console.log(`\nSaved ${path}`);
