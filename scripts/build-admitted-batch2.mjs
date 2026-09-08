#!/usr/bin/env node
// Builds one Gmail compose URL per admitted applicant who has not actually
// been emailed yet.
//
//   node scripts/build-admitted-batch2.mjs <admitted.tsv> <sent-log.tsv>
//
// Two exclusion sources, because they catch different mistakes:
//
//   sent_log  -- what the Apps Script believes it sent. Complete for script
//                runs, blind to anything sent by hand.
//   ALREADY   -- addresses confirmed present in the Gmail Sent folder by
//                direct `in:sent to:<address>` search. This is the one that
//                matters: Kabir was mailed by hand after his address was
//                corrected, and the log has no idea.
//
// A duplicate acceptance is worse than a late one, so anything appearing in
// either source is dropped.
import { readFileSync } from 'node:fs';

const [, , admittedPath, sentLogPath] = process.argv;
if (!admittedPath || !sentLogPath) {
  console.error('usage: build-admitted-batch2.mjs <admitted.tsv> <sent-log.tsv>');
  process.exit(1);
}

const EXCLUDE_FILE = 'scripts/admitted-batch2-exclude.txt';
// Addresses already present in the Gmail Sent folder. Kept in a gitignored
// file rather than inline: they are real applicants, and this script is
// committed. An empty or missing file means "trust sent_log alone", which is
// exactly the assumption that would have mailed Kabir a second acceptance --
// so the run prints how many it loaded, and a count of 0 is a red flag.
let ALREADY = new Set();
try {
  ALREADY = new Set(
    readFileSync(EXCLUDE_FILE, 'utf8')
      .split('\n')
      .map((l) => l.trim().toLowerCase())
      .filter((l) => l && !l.startsWith('#'))
  );
} catch {
  console.error(`WARNING: no ${EXCLUDE_FILE}; relying on sent_log alone`);
}

const AUTHUSER = 0;
const STATUS_URL = /^https:\/\/www\.utwat\.ca\/apply\/status\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const parse = (p) => {
  const lines = readFileSync(p, 'utf8').replace(/\r/g, '').split('\n').filter((l) => l.trim());
  const header = lines[0].split('\t').map((h) => h.trim());
  return lines.slice(1).map((l) => {
    const c = l.split('\t');
    return Object.fromEntries(header.map((h, i) => [h, (c[i] || '').trim()]));
  });
};

const admitted = parse(admittedPath);
const logged = new Set(parse(sentLogPath).map((r) => r.email.toLowerCase()).filter(Boolean));

const tpl = readFileSync('scripts/admitted-batch2-emails.txt', 'utf8');
const m = tpl.match(/^Subject:\s*(.+)\n\n([\s\S]*)$/);
if (!m) throw new Error('template is not "Subject: ...\\n\\n<body>"');
const SUBJECT = m[1].trim();
const BODY = m[2].trimEnd();

for (const [label, s] of [['subject', SUBJECT], ['body', BODY]]) {
  if (/[–—]/.test(s)) throw new Error(`${label} contains an en/em dash`);
  const left = s.replace(/\{\{first_name\}\}/g, '').replace(/\{\{status_url\}\}/g, '').match(/\{\{[^}]*\}\}/g);
  if (left) throw new Error(`${label} has unknown placeholders: ${left.join(', ')}`);
}
for (const tok of ['{{first_name}}', '{{status_url}}']) {
  if (!BODY.includes(tok)) throw new Error(`body never uses ${tok}`);
}

const skipped = { logged: 0, already: 0 };
const bad = [];
const out = [];
const seen = new Set();

for (const r of admitted) {
  const email = r.email;
  const key = email.toLowerCase();
  if (logged.has(key)) { skipped.logged++; continue; }
  if (ALREADY.has(key)) { skipped.already++; continue; }

  const first = (r.first_name || '').trim();
  const url = r.status_url || '';

  // A wrong or missing status link is the one failure that cannot be walked
  // back: it is the applicant's only route to a seat, and the token in it is
  // their credential. Refuse rather than mail a dead link.
  if (!STATUS_URL.test(url)) { bad.push(`${email}: bad status_url "${url}"`); continue; }
  if (!first) { bad.push(`${email}: no first name, would read "Hi ,"`); continue; }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { bad.push(`${email}: not a usable address`); continue; }
  if (seen.has(key)) { bad.push(`${email}: duplicate row`); continue; }
  seen.add(key);

  const body = BODY.replaceAll('{{first_name}}', first).replaceAll('{{status_url}}', url);
  out.push({
    n: out.length + 1,
    first,
    email,
    url,
    composeUrl:
      `https://mail.google.com/mail/u/${AUTHUSER}/?view=cm&fs=1&tf=1`
      + `&to=${encodeURIComponent(email)}`
      + `&su=${encodeURIComponent(SUBJECT)}`
      + `&body=${encodeURIComponent(body)}`,
  });
}

console.error(`admitted roster:      ${admitted.length}`);
console.error(`skipped (sent_log):   ${skipped.logged}`);
console.error(`skipped (in Sent):    ${skipped.already}`);
console.error(`to send:              ${out.length}`);
if (bad.length) { console.error(`PROBLEMS: ${bad.length}`); for (const b of bad) console.error(`  ! ${b}`); }
console.error(`longest compose URL:  ${Math.max(...out.map((o) => o.composeUrl.length))} chars`);
// Every token is unique to one person; a repeat means two people share a link.
const urls = new Set(out.map((o) => o.url));
console.error(`unique status links:  ${urls.size} (must equal ${out.length})`);
if (urls.size !== out.length) throw new Error('status_url collision -- two applicants share a link');

console.log(JSON.stringify(out, null, 2));
