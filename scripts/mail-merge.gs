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
 *   2. File -> Import the CSV into a new Google Sheet, "Replace spreadsheet".
 *   3. Extensions -> Apps Script, paste this file over Code.gs, Save.
 *   4. Pick a TEMPLATE below, leave MODE as 'draft', and Run -> sendMerge.
 *      Authorise when prompted (it asks for Gmail send + Sheets access).
 *   5. Read the drafts in Gmail. Click a status link in one of them and
 *      confirm it loads a real application.
 *   6. Set MODE to 'send' and Run -> sendMerge again. The drafts made in
 *      step 4 are NOT sent -- delete them, they were only for reading.
 *
 * SAFETY
 *   Every sent row gets a timestamp written into a `sent_at` column before
 *   the script moves on. Re-running skips those rows, so a script that dies
 *   at row 60 -- quota, a network blip, a closed tab -- is resumed by simply
 *   running it again. Nobody gets the email twice. That column is the reason
 *   this script exists instead of an add-on: a duplicate decision email to
 *   ninety-nine people is not a mistake you can take back.
 */

// ---------------------------------------------------------------- settings

/** 'draft' writes Gmail drafts and sends nothing. 'send' sends for real. */
const MODE = 'draft';

/** Which letter to send. See TEMPLATES below. */
const TEMPLATE = 'admitted';

/** Reply-to, and the name applicants see in their inbox. */
const FROM_NAME = 'Battle of the Schools';
const REPLY_TO = 'r342shar@uwaterloo.ca';

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

Questions: r342shar@uwaterloo.ca

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

function sendMerge() {
  const template = TEMPLATES[TEMPLATE];
  if (!template) throw new Error(`No template named "${TEMPLATE}".`);
  if (MODE !== 'draft' && MODE !== 'send') {
    throw new Error(`MODE must be 'draft' or 'send', not "${MODE}".`);
  }

  const sheet = SpreadsheetApp.getActiveSheet();
  const values = sheet.getDataRange().getValues();
  const header = values[0].map(String);

  const col = (name) => {
    const i = header.indexOf(name);
    if (i === -1) throw new Error(`The sheet has no "${name}" column.`);
    return i;
  };
  const iEmail = col('email');
  const iFirst = col('first_name');
  const iUrl = col('status_url');

  // Add the bookkeeping column on first run.
  let iSent = header.indexOf('sent_at');
  if (iSent === -1) {
    iSent = header.length;
    sheet.getRange(1, iSent + 1).setValue('sent_at');
  }

  const pending = [];
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    if (!String(row[iEmail] || '').trim()) continue;
    if (String(row[iSent] || '').trim()) continue; // already done
    pending.push({ r: r + 1, row });
  }

  if (pending.length === 0) {
    SpreadsheetApp.getUi().alert('Nothing to do — every row already has a sent_at.');
    return;
  }

  const quota = MailApp.getRemainingDailyQuota();
  if (MODE === 'send' && quota < pending.length) {
    throw new Error(
      `${pending.length} rows to send but only ${quota} left in today's Gmail quota. ` +
        'Sending part of a decision batch splits people across two days. ' +
        'Wait for the quota to reset, or send from an account with a bigger one.',
    );
  }

  const batch = pending.slice(0, MAX_PER_RUN);
  let done = 0;

  batch.forEach(({ r, row }) => {
    const fill = (text) =>
      text
        .replace(/\{\{first_name\}\}/g, String(row[iFirst] || '').trim())
        .replace(/\{\{status_url\}\}/g, String(row[iUrl] || '').trim());

    const options = { name: FROM_NAME, replyTo: REPLY_TO };
    const to = String(row[iEmail]).trim();
    const subject = fill(template.subject);
    const body = fill(template.body);

    if (MODE === 'draft') {
      GmailApp.createDraft(to, subject, body, options);
    } else {
      GmailApp.sendEmail(to, subject, body, options);
      // Written per row, and flushed, so a crash mid-run loses nothing:
      // re-running resumes exactly where this stopped.
      sheet.getRange(r, iSent + 1).setValue(new Date().toISOString());
      SpreadsheetApp.flush();
    }
    done++;
  });

  const verb = MODE === 'draft' ? 'Drafted' : 'Sent';
  const left = pending.length - done;
  SpreadsheetApp.getUi().alert(
    `${verb} ${done} "${TEMPLATE}" email${done === 1 ? '' : 's'}.` +
      (left > 0 ? `\n\n${left} still pending — run again.` : '') +
      (MODE === 'draft'
        ? '\n\nNothing was sent. Read the drafts, click a status link to check it ' +
          'loads a real application, then delete the drafts and set MODE to "send".'
        : ''),
  );
}
