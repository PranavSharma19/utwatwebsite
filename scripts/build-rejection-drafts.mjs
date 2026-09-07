#!/usr/bin/env node
// Turns the rejected-applicants TSV (copied straight out of the Google Sheet)
// into one Gmail compose URL per recipient. Nothing here sends: a compose URL
// only opens a prefilled window, which Gmail saves to Drafts.
//
//   node scripts/build-rejection-drafts.mjs <rejected.tsv> [authuser]
//
// Prints a JSON array of {n, first, email, url} to stdout and a human summary
// to stderr, so the summary can be read while the JSON is piped to a file.
import { readFileSync } from 'node:fs';

const [, , tsvPath, authuserArg = '0'] = process.argv;
if (!tsvPath) {
  console.error('usage: build-rejection-drafts.mjs <rejected.tsv> [authuser]');
  process.exit(1);
}

// Rows that are ours, not applicants': smoke tests, a teammate's own address,
// and two single-letter junk submissions. Mailing them is pointless, and one
// of them would mail the organiser their own rejection.
const EXCLUDE = new Set([
  'r342shar@uwaterloo.ca',      // "Test Test" -- the organisers' own address
  'test_lztmrx@uwaterloo.ca',   // "Testuan Userhkaq"
  'aa@a.com',                   // "aa a", program "a"
  'a@c.a',                      // "a a", program "adfsa"
  'redmaple9gakkuxt@uberip.com' // "Canary Bluepine", program "Test Program"
]);

const raw = readFileSync(tsvPath, 'utf8').replace(/\r/g, '');
const lines = raw.split('\n').filter((l) => l.trim());
const header = lines[0].split('\t').map((h) => h.trim());
const col = (name) => {
  const i = header.indexOf(name);
  if (i < 0) throw new Error(`missing column: ${name}`);
  return i;
};
const [iEmail, iStatus, iFirst] = [col('email'), col('status'), col('first_name')];

const tpl = readFileSync('scripts/rejection-emails.txt', 'utf8');
const m = tpl.match(/^Subject:\s*(.+)\n\n([\s\S]*)$/);
if (!m) throw new Error('rejection-emails.txt is not "Subject: ...\\n\\n<body>"');
const SUBJECT = m[1].trim();
const BODY = m[2].trimEnd();

// The template is typed by hand and pasted through a URL. An em dash or a
// stray {{token}} would go out to 46 people before anyone noticed.
for (const [label, s] of [['subject', SUBJECT], ['body', BODY]]) {
  if (/[–—]/.test(s)) throw new Error(`${label} contains an en/em dash`);
  const left = s.replace(/\{\{first_name\}\}/g, '').match(/\{\{[^}]*\}\}/g);
  if (left) throw new Error(`${label} has unknown placeholders: ${left.join(', ')}`);
}
if (!BODY.includes('{{first_name}}')) throw new Error('body never uses {{first_name}}');

const skipped = [];
const bad = [];
const people = [];

for (const line of lines.slice(1)) {
  const c = line.split('\t');
  const email = (c[iEmail] || '').trim();
  const status = (c[iStatus] || '').trim();
  let first = (c[iFirst] || '').trim();

  if (EXCLUDE.has(email.toLowerCase())) { skipped.push(`${email} (test/junk row)`); continue; }
  if (status !== 'rejected') { bad.push(`${email}: status is "${status}", not rejected`); continue; }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { bad.push(`${email}: not a usable address`); continue; }
  if (!first) { bad.push(`${email}: no first name, would read "Hi ,"`); continue; }

  // Some people typed their name in all lowercase. "Hi rastin," reads as a
  // mail merge that went wrong; anything more than fixing the first letter
  // would be guessing at names we cannot pronounce, let alone capitalise.
  if (first === first.toLowerCase()) first = first[0].toUpperCase() + first.slice(1);

  people.push({ email, first });
}

const seen = new Set();
for (const p of people) {
  const k = p.email.toLowerCase();
  if (seen.has(k)) bad.push(`${p.email}: duplicate row`);
  seen.add(k);
}

const AUTHUSER = String(Number(authuserArg));
const out = people.map((p, i) => ({
  n: i + 1,
  first: p.first,
  email: p.email,
  url:
    `https://mail.google.com/mail/u/${AUTHUSER}/?view=cm&fs=1&tf=1`
    + `&to=${encodeURIComponent(p.email)}`
    + `&su=${encodeURIComponent(SUBJECT)}`
    + `&body=${encodeURIComponent(BODY.replace(/\{\{first_name\}\}/g, p.first))}`,
}));

console.error(`recipients: ${out.length}`);
console.error(`skipped:    ${skipped.length}`);
for (const s of skipped) console.error(`  - ${s}`);
if (bad.length) {
  console.error(`PROBLEMS:   ${bad.length}`);
  for (const b of bad) console.error(`  ! ${b}`);
}
const longest = Math.max(...out.map((o) => o.url.length));
console.error(`longest compose URL: ${longest} chars`);

console.log(JSON.stringify(out, null, 2));
