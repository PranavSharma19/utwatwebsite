#!/usr/bin/env node
/**
 * Turns the admin page's "Export Admitted" CSV into a local click-to-send
 * page: one link per recipient that opens a fully pre-filled Gmail compose
 * window. Press Send, close the tab, click the next one.
 *
 * This exists because the waitlist promotion had to go out WITHOUT the Apps
 * Script mail merge, and 50-odd per-person status links cannot be pasted into
 * one broadcast email -- each link is that person's bearer token for their own
 * application. The compose URL carries the substitution instead.
 *
 * The output is written to disk and never uploaded: it contains every
 * recipient's status token in plain text. Treat it like the roster itself.
 *
 *   node scripts/build-compose-page.mjs <export.csv> [out.html]
 *
 * Reads the letter from scripts/waitlist-emails.txt ("Subject:" first line,
 * blank line, then the body) and the recipient allowlist from
 * scripts/waitlist-recipients.txt (one lowercased email per line).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

// Gmail account index in the URL. utwat.bots@gmail.com is the only signed-in
// account, so 0. If Gmail opens the wrong account, change this to its index.
const AUTHUSER = 0;

// Brandon Choi applied twice, with two addresses and two different tracks.
// Keeping the LATER application (2026-09-06, Robotics, partiraspberry1@) as
// his most recent stated preference, and dropping the earlier one so he is
// not admitted twice or mailed two links. Swap these if you decide otherwise.
const EXCLUDE = new Set(['choib2007@gmail.com']);

/** RFC 4180 enough for our own exports: quoted fields, doubled quotes. */
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => v !== ''));
}

const csvPath = process.argv[2];
if (!csvPath) {
  console.error('usage: node scripts/build-compose-page.mjs <export.csv> [out.html]');
  process.exit(1);
}
const outPath = process.argv[3] || resolve(HERE, '..', 'waitlist-send.html');

const letter = readFileSync(resolve(HERE, 'waitlist-emails.txt'), 'utf8');
const m = letter.match(/^Subject:\s*(.+)\n\n([\s\S]*)$/);
if (!m) throw new Error('waitlist-emails.txt must start with "Subject: ..." then a blank line.');
const SUBJECT = m[1].trim();
const BODY = m[2].replace(/\s+$/, '');

const allow = new Set(
  readFileSync(resolve(HERE, 'waitlist-recipients.txt'), 'utf8')
    .split('\n').map((s) => s.trim().toLowerCase()).filter(Boolean),
);

const rows = parseCsv(readFileSync(csvPath, 'utf8'));
const header = rows[0].map((h) => h.trim());
const idx = (name) => {
  const i = header.indexOf(name);
  if (i === -1) throw new Error(`export has no "${name}" column; found: ${header.join(', ')}`);
  return i;
};
const iFirst = idx('first_name'), iEmail = idx('email'), iUrl = idx('status_url');

const people = [], problems = [];
const seen = new Set();
for (const r of rows.slice(1)) {
  const email = (r[iEmail] || '').trim();
  const key = email.toLowerCase();
  if (!allow.has(key) || EXCLUDE.has(key)) continue;
  const first = (r[iFirst] || '').trim();
  const url = (r[iUrl] || '').trim();
  if (!first) problems.push(`${email}: blank first_name`);
  if (!/^https:\/\/www\.utwat\.ca\/apply\/status\/[0-9a-f-]{36}$/.test(url)) {
    problems.push(`${email}: bad status_url "${url}"`);
  }
  if (seen.has(key)) { problems.push(`${email}: duplicate row in export`); continue; }
  seen.add(key);
  people.push({ first, email, url });
}

const missing = [...allow].filter((e) => !seen.has(e) && !EXCLUDE.has(e));

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const composeUrl = (p) => {
  const body = BODY.replaceAll('{{first_name}}', p.first).replaceAll('{{status_url}}', p.url);
  return `https://mail.google.com/mail/u/${AUTHUSER}/?view=cm&fs=1&tf=1`
    + `&to=${encodeURIComponent(p.email)}`
    + `&su=${encodeURIComponent(SUBJECT)}`
    + `&body=${encodeURIComponent(body)}`;
};

const items = people.map((p, i) => `
  <li>
    <a href="${esc(composeUrl(p))}" target="_blank" rel="noreferrer"
       onclick="this.closest('li').classList.add('done')">
      <span class="n">${i + 1}</span>
      <span class="who"><b>${esc(p.first)}</b> ${esc(p.email)}</span>
    </a>
    <code>${esc(p.url.replace('https://www.utwat.ca/apply/status/', ''))}</code>
  </li>`).join('');

writeFileSync(outPath, `<!doctype html><meta charset="utf-8">
<title>Send waitlist promotions (${people.length})</title>
<style>
 body{font:14px/1.5 system-ui,sans-serif;margin:0;padding:24px;background:#0c0e17;color:#e8eaf2}
 h1{font-size:18px;margin:0 0 4px}p{color:#98a0b8;margin:0 0 16px}
 ol{list-style:none;padding:0;margin:0;max-width:760px}
 li{display:flex;align-items:center;gap:10px;border-bottom:1px solid #1e2334;padding:2px 0}
 li.done{opacity:.35}
 a{flex:1;display:flex;gap:10px;align-items:center;padding:8px;color:inherit;text-decoration:none;border-radius:8px}
 a:hover{background:#161b2b}
 .n{color:#5a6480;font-variant-numeric:tabular-nums;min-width:26px;text-align:right}
 .who b{color:#7dd3a8} code{color:#5a6480;font-size:11px}
 .warn{background:#3a1f1f;border:1px solid #6b2b2b;padding:12px;border-radius:8px;margin-bottom:16px;color:#ffb4b4}
</style>
<h1>Waitlist promotions: ${people.length} to send</h1>
<p>Each link opens a pre-filled Gmail compose. Check it, press Send, close the tab.
Clicked rows dim so you can keep your place. Reloading resets the dimming, not the sending.</p>
${problems.length || missing.length ? `<div class="warn"><b>Check these before sending:</b><br>${
  [...problems, ...missing.map((e) => `${e}: on the waitlist but NOT in the export (not admitted yet?)`)]
    .map(esc).join('<br>')}</div>` : ''}
<ol>${items}</ol>
`);

console.log(`wrote ${outPath}`);
console.log(`recipients: ${people.length}`);
if (problems.length) console.log(`problems:\n  ${problems.join('\n  ')}`);
if (missing.length) console.log(`on waitlist but missing from export (${missing.length}):\n  ${missing.join('\n  ')}`);
