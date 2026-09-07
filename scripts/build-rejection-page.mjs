#!/usr/bin/env node
// Renders the compose URLs from build-rejection-drafts.mjs as a click-through
// page: one row per recipient, each opening a Gmail compose window already
// filled in. Nothing here sends -- the human presses Send.
//
//   node scripts/build-rejection-drafts.mjs <rejected.tsv> > drafts.json
//   node scripts/build-rejection-page.mjs drafts.json [out.html]
//
// The `DONE` set is for recipients who already have a saved Gmail draft, so
// the page can mark them and nobody gets two rejection emails.
import { readFileSync, writeFileSync } from 'node:fs';

const [, , jsonPath, outPath = 'rejections-send.html'] = process.argv;
const people = JSON.parse(readFileSync(jsonPath, 'utf8'));

const DONE = new Set([
  'max89343@outlook.com',
  'clement.li@mail.utoronto.ca',
  'yilin.hou@mail.utoronto.ca',
  'fazli.alghani@mail.utoronto.com',
  'samario.liu@mail.utoronto.ca',
  'jy42chen@uwaterloo.ca',
  'bobby.xiao@mail.utoronto.ca',
  'belindatang423@outlook.com',
  'yunwoo.chung@mail.utoronto.ca',
]);

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const rows = people.map((p, i) => {
  const done = DONE.has(p.email.toLowerCase());
  return `<li class="${done ? 'has-draft' : ''}">
    <a href="${esc(p.url)}" target="_blank" rel="noreferrer">
      <span class="name">${esc(p.first)}</span>
      <span class="email">${esc(p.email)}</span>
    </a>
    ${done ? '<span class="tag">already a draft in Gmail</span>' : ''}
  </li>`;
}).join('\n');

const html = `<!doctype html>
<meta charset="utf-8">
<title>BOTS 2026 rejections (${people.length})</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; padding: 32px; background: #0c0e17; color: #e7e9f3;
         font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  p.sub { margin: 0 0 24px; color: #8b90a8; }
  ol { list-style: none; counter-reset: r; margin: 0; padding: 0; max-width: 760px; }
  li { counter-increment: r; display: flex; align-items: center; gap: 12px;
       border-bottom: 1px solid #1c2030; }
  li::before { content: counter(r); width: 32px; text-align: right;
               color: #565c78; font-variant-numeric: tabular-nums; }
  a { flex: 1; display: flex; gap: 12px; align-items: baseline;
      padding: 12px 8px; color: inherit; text-decoration: none; border-radius: 6px; }
  a:hover { background: #161a28; }
  /* :visited is the whole point -- it is how you keep your place across
     46 sends without a checkbox to tick or any state to lose. */
  a:visited .name { color: #565c78; text-decoration: line-through; }
  a:visited .email { color: #3d4258; }
  .name { font-weight: 600; min-width: 130px; }
  .email { color: #8b90a8; font-size: 13px; }
  .tag { font-size: 11px; color: #f0b429; padding-right: 8px; white-space: nowrap; }
  .has-draft a { opacity: .55; }
</style>
<h1>Battle of the Schools 2026 &mdash; rejections</h1>
<p class="sub">${people.length} recipients. Click a name: Gmail opens with the email already written. Read it, press Send, come back. Names you have opened go grey, so you keep your place.</p>
<ol>
${rows}
</ol>
`;

writeFileSync(outPath, html);
console.log(`wrote ${outPath} (${people.length} recipients, ${people.filter((p) => DONE.has(p.email.toLowerCase())).length} already drafted)`);
