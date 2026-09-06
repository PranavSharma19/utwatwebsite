/**
 * Decision-email mail merge for Battle of the Schools 2026.
 *
 * This is Google Apps Script, not part of the site build. It runs inside the
 * Google account that sends the mail (Extensions -> Apps Script from the
 * sheet). It lives in the repo so the copy that actually went out to
 * applicants is on the record next to the code that generated their links.
 *
 * SETUP
 *   1. Export the roster from the admin console on https://www.utwat.ca --
 *      Export Admitted, or Export All + Links for the waitlist/rejection
 *      batches. Exporting from localhost puts localhost URLs in the merge.
 *   2. File -> Import the CSV into a Google Sheet. First time: "Replace
 *      spreadsheet". For a later wave: open the SAME spreadsheet, select
 *      the roster tab, and import with "Replace current sheet" so the
 *      sent_log tab beside it survives.
 *   3. script.google.com -> New project, paste this file over Code.gs, put
 *      the spreadsheet's id in SPREADSHEET_ID below, and Save. A standalone
 *      project rather than a container-bound one: Extensions -> Apps Script
 *      fails outright when several Google accounts are signed in to the same
 *      browser, which is the normal state of an organiser's laptop.
 *   4. Pick a TEMPLATE below, leave MODE as 'draft', and Run -> sendMerge.
 *      Authorise when prompted (it asks for Gmail send + Sheets access).
 *   5. Read the drafts in Gmail. Click a status link in one of them and
 *      confirm it loads a real application.
 *   6. Set MODE to 'send' and Run -> sendMerge again. The drafts made in
 *      step 4 are NOT sent -- delete them, they were only for reading.
 *
 * SAFETY -- how it knows who it already mailed
 *   Admissions happen in waves. You send to 99 today, admit 30 more on
 *   Wednesday, and export again -- and that second export contains all 129,
 *   including the 99 who already have the email. Re-sending a decision to
 *   someone who has already RSVP'd is confusing at best and looks like a
 *   reversal at worst.
 *
 *   So the record of who has been mailed does NOT live in the roster sheet.
 *   It lives in a separate `sent_log` tab that this script creates and
 *   appends to, one row per email actually sent. Before each run the script
 *   reads that log and skips anyone already there for the same template.
 *
 *   That means you can re-import a fresh export over the roster tab as often
 *   as you like -- File -> Import -> "Replace current sheet" on the roster
 *   tab -- and the log is untouched. An earlier version of this script kept
 *   a `sent_at` column in the roster itself, which a re-import silently
 *   wiped: every previously-mailed applicant looked unsent, and the next run
 *   would have mailed all of them a second time.
 *
 *   The key is (email, template), so someone who got `admitted` on Tuesday
 *   still receives `reminder` on Wednesday. Only the same letter to the same
 *   person is suppressed.
 *
 *   The log is also crash recovery: it is appended and flushed after every
 *   single send, so a run that dies at row 60 -- quota, a network blip, a
 *   closed tab -- is resumed by running it again.
 */

// ---------------------------------------------------------------- settings

/**
 * The spreadsheet the roster lives in, and the tab inside it. Taken from the
 * sheet URL: docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/edit
 */
const SPREADSHEET_ID = '166_Za2FmXlGUBF0uMyPb04RCmkV5g7HUFBkTWHZLACs';
const SHEET_NAME = 'bots-admitted-mail-merge';

/** 'draft' writes Gmail drafts and sends nothing. 'send' sends for real. */
const MODE = 'draft';

/** Which letter to send. See TEMPLATES below. */
const TEMPLATE = 'admitted';

/**
 * Reply-to, and the name applicants see in their inbox. Same address the
 * script sends from, which is where replies go anyway whatever the header
 * says -- and it matches portalConfig.contactEmail on the site.
 */
const FROM_NAME = 'Battle of the Schools';
const REPLY_TO = 'utwat.bots@gmail.com';

/**
 * Rows to process in one run. Gmail's daily quota is per account (typically
 * 100/day on a consumer account, 1500 on Workspace) and the script refuses to
 * start if the remaining quota is below the number of rows left to send.
 */
const MAX_PER_RUN = 200;

// --------------------------------------------------------------- templates

const TEMPLATES = {
  admitted: {
    subject:
      "You're in — Battle of the Schools, Sept 12–13. RSVP by Wed the 10th.",
    body: `Hi {{first_name}},

You've been admitted to Battle of the Schools 2026, September 12–13 at the Bahen Centre, University of Toronto.

Confirm your spot here. This link is yours — please don't forward it:
{{status_url}}

It takes about a minute. You'll tell us whether you're coming, give us an emergency contact and any dietary restrictions, and accept the participant waiver (utwat.ca/waiver). Once you're done, that same link becomes your ticket: a QR code you show at the door. Screenshot it or bookmark it.

RSVP by Wednesday, September 10 at 11:59 p.m. Eastern. After that we release your spot to the waitlist.

Two things worth knowing:

- The event is 18+. If you'll be under 18 on September 12, reply to this email instead of RSVPing and we'll sort it out.
- If you can't make it, say so at the link anyway. It takes ten seconds and it moves someone off the waitlist.

Questions: utwat.bots@gmail.com

— the Battle of the Schools team`,
  },

  waitlisted: {
    subject: "Battle of the Schools — you're on the waitlist",
    body: `Hi {{first_name}},

You're on the waitlist for Battle of the Schools 2026. We had more strong applications than seats, and yours was one we genuinely didn't want to turn down.

Here's how it actually works. Admitted applicants have until Wednesday, September 10 to confirm. Every one who declines or doesn't answer frees a seat, and we work down the waitlist in order as that happens — so most movement will be on the 10th and 11th, and some of it could be the day before the event.

If a seat opens for you we'll email you at this address, and you'll have 24 hours to confirm. It's worth keeping an eye on your inbox through Friday the 11th.

You can check where you stand any time:
{{status_url}}

We know waiting is the worst answer to get. Thanks for applying.

— the Battle of the Schools team`,
  },

  rejected: {
    subject: 'Battle of the Schools 2026 — our decision',
    body: `Hi {{first_name}},

We aren't able to offer you a spot at Battle of the Schools 2026. We had far more applications than the venue holds, and a lot of good ones didn't make it through.

This isn't a judgement on you as a builder, and it doesn't affect any future event we run. If you'd like to come to the next one, we'd be glad to see your name again.

Thanks for the time you put into applying.

— the Battle of the Schools team`,
  },

  // For anyone admitted AFTER the global RSVP deadline. rsvp.ts gives them
  // LATE_ADMIT_GRACE_MS -- 24 hours from the moment Admit was pressed, not a
  // date. Sending them the `admitted` letter would point at a deadline that
  // has already passed; sendMerge() refuses that combination outright.
  promotion: {
    subject:
      'A spot opened up — Battle of the Schools, confirm within 24 hours',
    body: `Hi {{first_name}},

A spot has opened up and it's yours if you want it. Battle of the Schools 2026, September 12–13 at the Bahen Centre, U of T.

Because we're close to the event, this one is time-boxed: you have 24 hours from right now to confirm, then the link stops accepting answers and we offer the seat to the next person.

{{status_url}}

You'll answer yes or no, give us an emergency contact and any dietary restrictions, and accept the participant waiver (utwat.ca/waiver). Then that link becomes your QR ticket for the door.

If you can't make it, telling us no is genuinely useful — it lets us reach the next person tonight rather than tomorrow.

Questions, or the 24 hours won't work for you: utwat.bots@gmail.com

— the Battle of the Schools team`,
  },

  reminder: {
    subject: 'Last day to RSVP — Battle of the Schools closes tonight at 11:59',
    body: `Hi {{first_name}},

Your spot at Battle of the Schools is still unconfirmed, and RSVPs close tonight, Wednesday September 10, at 11:59 p.m. Eastern.

One minute, one link:
{{status_url}}

If you can't make it, tell us that at the same link. A decline right now gets someone off the waitlist while there's still time for them to plan around it.

After tonight the link stops accepting answers and we release the seat.

— the Battle of the Schools team`,
  },
};

// ------------------------------------------------------------------ script

/** Mirrors RSVP_DEADLINE in supabase/functions/submit-application/rsvp.ts. */
const RSVP_DEADLINE = new Date('2026-09-10T23:59:00-04:00');

const LOG_SHEET = 'sent_log';
const LOG_HEADER = ['sent_at', 'template', 'email', 'status_url'];

/**
 * The tab that remembers who has been mailed. Deliberately separate from the
 * roster, which gets replaced wholesale every time a new export is imported.
 */
function getLogSheet(ss) {
  let log = ss.getSheetByName(LOG_SHEET);
  if (!log) {
    log = ss.insertSheet(LOG_SHEET);
    log.appendRow(LOG_HEADER);
    log.setFrozenRows(1);
  }
  return log;
}

/** Set of "template\temail" pairs already sent. */
function alreadySent(log) {
  const rows = log.getDataRange().getValues();
  const keys = {};
  for (let r = 1; r < rows.length; r++) {
    const template = String(rows[r][1] || '').trim();
    const email = String(rows[r][2] || '').trim().toLowerCase();
    if (email) keys[template + '\t' + email] = true;
  }
  return keys;
}

function sendMerge() {
  const template = TEMPLATES[TEMPLATE];
  if (!template) throw new Error(`No template named "${TEMPLATE}".`);
  if (MODE !== 'draft' && MODE !== 'send') {
    throw new Error(`MODE must be 'draft' or 'send', not "${MODE}".`);
  }

  // The one mistake that cannot be fixed by re-running: telling someone the
  // deadline is Wednesday when Wednesday has been and gone. Late admits get
  // the `promotion` letter, which says 24 hours instead of a date.
  if (TEMPLATE === 'admitted' && new Date() > RSVP_DEADLINE) {
    throw new Error(
      'The RSVP deadline has passed, so the "admitted" letter would point at ' +
        'a date in the past. Anyone admitted now gets 24 hours from the moment ' +
        'you pressed Admit — use TEMPLATE = "promotion" instead.',
    );
  }

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    throw new Error(
      `No tab named "${SHEET_NAME}" in that spreadsheet. Tabs found: ` +
        ss.getSheets().map((t) => t.getName()).join(', '),
    );
  }

  const values = sheet.getDataRange().getValues();
  const header = values[0].map(String);
  const col = (name) => {
    const i = header.indexOf(name);
    if (i === -1) throw new Error(`The "${sheet.getName()}" tab has no "${name}" column.`);
    return i;
  };
  const iEmail = col('email');
  const iFirst = col('first_name');
  const iUrl = col('status_url');

  const log = getLogSheet(ss);
  const sent = alreadySent(log);

  const pending = [];
  let skipped = 0;
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const email = String(row[iEmail] || '').trim();
    if (!email) continue;
    if (sent[TEMPLATE + '\t' + email.toLowerCase()]) {
      skipped++;
      continue;
    }
    pending.push({ email, first: String(row[iFirst] || '').trim(), url: String(row[iUrl] || '').trim() });
  }

  if (pending.length === 0) {
    return report(
      `Nothing to send. All ${skipped} row(s) on this tab have already had ` +
        `the "${TEMPLATE}" email.`,
    );
  }

  const quota = MailApp.getRemainingDailyQuota();
  if (MODE === 'send' && quota < pending.length) {
    throw new Error(
      `${pending.length} to send but only ${quota} left in today's Gmail quota. ` +
        'Sending part of a decision batch splits people across two days, and the ' +
        'RSVP deadline does not move. Wait for the reset, or send from an ' +
        'account with a bigger quota.',
    );
  }

  const batch = pending.slice(0, MAX_PER_RUN);
  let done = 0;

  batch.forEach((p) => {
    const fill = (text) =>
      text
        .replace(/\{\{first_name\}\}/g, p.first)
        .replace(/\{\{status_url\}\}/g, p.url);

    const options = { name: FROM_NAME, replyTo: REPLY_TO };
    const subject = fill(template.subject);
    const body = fill(template.body);

    if (MODE === 'draft') {
      GmailApp.createDraft(p.email, subject, body, options);
    } else {
      GmailApp.sendEmail(p.email, subject, body, options);
      // Logged and flushed per send, so a crash loses nothing and a re-run
      // resumes here rather than starting over.
      log.appendRow([new Date().toISOString(), TEMPLATE, p.email, p.url]);
      SpreadsheetApp.flush();
    }
    done++;
  });

  const left = pending.length - done;
  return report(
    `${MODE === 'draft' ? 'DRAFTED' : 'SENT'} ${done} "${TEMPLATE}" email(s). ` +
      `Skipped ${skipped} already sent. ${left} still pending. ` +
      `Gmail quota remaining after this run: ${MailApp.getRemainingDailyQuota()}.` +
      (MODE === 'draft'
        ? ' Nothing was sent and nothing was logged — read the drafts, click a ' +
          'status link to check it loads a real application, then delete the ' +
          'drafts and set MODE to "send".'
        : ''),
  );
}

/** Standalone scripts have no SpreadsheetApp.getUi(); the log is the output. */
function report(message) {
  Logger.log(message);
  return message;
}

/** Run this first. Sends nothing, touches nothing, prints what it can see. */
function preflight() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    return report(
      `No tab named "${SHEET_NAME}". Tabs: ` +
        ss.getSheets().map((t) => t.getName()).join(', '),
    );
  }
  const values = sheet.getDataRange().getValues();
  const header = values[0].map(String);
  const missing = ['first_name', 'email', 'status_url'].filter(
    (c) => header.indexOf(c) === -1,
  );
  const rows = values.length - 1;
  const quota = MailApp.getRemainingDailyQuota();
  return report(
    `Sheet "${SHEET_NAME}" — ${rows} data row(s). ` +
      `Columns: ${header.join(', ')}. ` +
      (missing.length ? `MISSING: ${missing.join(', ')}. ` : 'All required columns present. ') +
      `Sending as: ${Session.getActiveUser().getEmail()}. ` +
      `Gmail recipients left today: ${quota}` +
      (quota < rows ? ` — NOT ENOUGH for ${rows} rows.` : ' — enough.'),
  );
}
