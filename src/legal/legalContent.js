import { portalConfig, formatDeadline } from '../admissions/portalConfig';

/**
 * The privacy policy and terms, as data rather than markup.
 *
 * Written against what this codebase actually does, not from a template: the
 * field list below is the one in portalConfig.emptyApplicationForm, the
 * processors are the ones the site really talks to, and the vote section
 * describes the hashing in supabase/functions/faction-cheer. Anything stated
 * here that stops being true should fail a test in legalContent.test.js.
 *
 * Contact details and dates come from portalConfig so a policy cannot quietly
 * outlive the deadline it cites -- the same failure that left a July deadline
 * advertised into late August.
 */

/** Bumped by hand whenever the substance changes, not on every edit. */
export const LAST_UPDATED = '2026-08-26';

export const ORGANIZERS =
  'the University of Toronto Machine Intelligence Student Team (UTMIST) and WAT.ai at the University of Waterloo';

export const privacyPolicy = {
  slug: 'privacy',
  title: 'Privacy Policy',
  updated: LAST_UPDATED,
  intro: [
    `Battle of the Schools ("BOTS", "we") is a student-run hackathon organised by ${ORGANIZERS}. This policy explains what we collect through utwat.ca, why, where it goes, and what you can ask us to do about it.`,
    'We are students, not a company. We collect what we need to run an admissions process and an event, and nothing else.',
  ],
  sections: [
    {
      heading: 'What we collect',
      paragraphs: [
        'If you only browse the site, we do not ask you for anything. One thing is stored in your own browser and never sent to us: which school you picked in the poll, so the page can remember your side. You can clear it by clearing site data.',
        'If you apply, you give us the following, all of it directly from the form:',
      ],
      bullets: [
        'Your name, email address, and phone number.',
        'Your school, program, level of study, and expected graduation year.',
        'Your machine-learning experience, how many hackathons you have attended, and the track you prefer.',
        'Your written answers about why you want to attend, a project you have built, and what you would like to build.',
        'Optional links you choose to share: GitHub, LinkedIn, a portfolio, or Devpost.',
        'An optional résumé file.',
        'Your confirmations that you are 18 or older, that you can attend in person, and that your answers are accurate.',
        'The email addresses of teammates, if you name any.',
      ],
    },
    {
      heading: 'Teammate email addresses',
      paragraphs: [
        'If you list teammates, you are giving us someone else\'s personal information. Please only enter an address for someone who knows you are doing so. We use those addresses solely to connect applications from the same intended team, and we do not add them to any mailing list.',
      ],
    },
    {
      heading: 'The school poll',
      paragraphs: [
        'Voting in the UofT versus Waterloo poll does not require an account and does not identify you.',
        'We record only which school was picked and when. No identifier of any kind is stored against a vote -- not your IP address, not a hash of it, not a cookie. Your browser remembers your own choice so the page can show it back to you; that never leaves your device.',
        'Cloudflare Turnstile runs on the vote and sign-in forms to distinguish people from bots. Cloudflare receives your IP address and basic browser information as part of that check, under their own privacy terms. Our own server sees your IP address for the length of the request, to pass to that check and to limit floods, and does not store it.',
      ],
    },
    {
      heading: 'What we do not do',
      paragraphs: [
        'This site carries no analytics, no advertising, no tracking pixels, and no third-party marketing scripts of any kind. We do not sell, rent, or trade your information, and we do not share it with sponsors. Sponsors receive aggregate figures such as how many people applied, never anyone\'s details.',
        'We do not use your application to make any automated decision about you. Admissions are read by human organisers.',
      ],
    },
    {
      heading: 'Who processes it, and where',
      paragraphs: [
        'We use a small number of service providers to run the site. They process data on our behalf:',
      ],
      bullets: [
        'Supabase — the database, sign-in, and résumé storage. Our project is hosted in Canada (ca-central-1).',
        'Vercel — website hosting and content delivery. Vercel handles the request logs that any web host necessarily sees.',
        'Cloudflare — Turnstile bot protection on forms, as described above.',
        'Google Fonts — the site loads its typefaces from Google, which means Google receives your IP address when a page loads.',
      ],
    },
    {
      heading: 'How we sign you in',
      paragraphs: [
        'The applicant portal has no passwords. You enter your email address and we send a single-use link that signs you in. Those links expire and can only be opened once. We store your email address so we can recognise you when you come back to finish a draft.',
      ],
    },
    {
      heading: 'How long we keep it',
      paragraphs: [
        `Applications, including résumés, are kept for twelve months after the event (which runs ${portalConfig.eventDateRange}) so that organisers can handle follow-up questions, then deleted. Poll records hold no personal information and may be kept indefinitely as an aggregate count.`,
        'If you ask us to delete your application earlier, we will, subject to anything we are required to keep.',
      ],
    },
    {
      heading: 'Your rights',
      paragraphs: [
        'Canadian privacy law (PIPEDA) gives you the right to ask what personal information we hold about you, to get a copy of it, to have mistakes corrected, and to withdraw your consent and have it deleted. Withdrawing consent while your application is open means we can no longer consider it.',
        `Write to ${portalConfig.contactEmail} and a human organiser will answer. We aim to respond within thirty days.`,
      ],
    },
    {
      heading: 'Security',
      paragraphs: [
        'Applications are protected so that you can only ever read and edit your own; the rules that enforce this live in the database itself rather than only in the website. Résumés are held in a private bucket that is not publicly reachable. Organiser access is restricted to a named list of accounts.',
        'No system is perfect. Please do not put information in a free-text answer that you would not want an organiser to read.',
      ],
    },
    {
      heading: 'Under 18',
      paragraphs: [
        'The event is for participants aged 18 and over, and the application asks you to confirm this. We do not knowingly collect information from anyone under 18. If you believe a minor has applied, contact us and we will remove it.',
      ],
    },
    {
      heading: 'Changes',
      paragraphs: [
        'If we change this policy we will update the date at the top of this page. If a change is significant and affects applicants, we will email people who have applied.',
      ],
    },
  ],
};

export const termsOfService = {
  slug: 'terms',
  title: 'Terms of Use',
  updated: LAST_UPDATED,
  intro: [
    `These terms cover the use of utwat.ca and applying to Battle of the Schools, run by ${ORGANIZERS}. Using the site means you accept them.`,
  ],
  sections: [
    {
      heading: 'Who can apply',
      paragraphs: [
        `Applicants must be 18 or older and able to attend in person on ${portalConfig.eventDateRange}. Applications close on ${formatDeadline()}.`,
        'Applying is not an offer of a place. Capacity is limited, organisers review every application, and we may decline any application without giving reasons.',
      ],
    },
    {
      heading: 'Your application',
      paragraphs: [
        'You agree that what you tell us is true, that the work you describe is yours, and that you have permission to share any teammate\'s email address you enter. Applications found to contain deliberate misrepresentation may be withdrawn at any point, including during the event.',
        'You may edit your draft until you submit it, and until the deadline passes.',
      ],
    },
    {
      heading: 'What you build stays yours',
      paragraphs: [
        'You keep all ownership of the code, designs, and other work you create at the event. Neither the organisers nor the sponsors acquire any right to it.',
        'By taking part you allow us to name you and your team and to show your project publicly when we announce results and recap the event. Tell us in advance if you would rather not be named and we will respect that.',
      ],
    },
    {
      heading: 'Conduct',
      paragraphs: [
        'Everyone at the event and in its online spaces is expected to behave decently: no harassment, discrimination, intimidation, or deliberate disruption. Organisers may remove anyone from the event for behaviour that makes it worse for others, without a refund of anything.',
        'Judging decisions are final.',
      ],
    },
    {
      heading: 'Using this site',
      paragraphs: [
        'Please do not attempt to break, overload, or gain unauthorised access to the site or its database, and do not attempt to manipulate the school poll through automated or repeated voting. The poll is a bit of fun between two schools; treating it as a target spoils it.',
        'We may suspend access for anyone doing these things.',
      ],
    },
    {
      heading: 'The event may change',
      paragraphs: [
        'This is a volunteer-run student event. Dates, format, tracks, prizes, venue, and sponsors may change, and the event may be postponed or cancelled. We will tell applicants by email if something significant changes.',
      ],
    },
    {
      heading: 'No warranty, and limits',
      paragraphs: [
        'The site and the event are provided as they are. We do not promise the site will always be available or error-free.',
        'To the extent the law allows, the organisers, their student clubs, and their universities are not liable for indirect or consequential loss arising from the site or the event. Nothing here limits liability that cannot lawfully be limited.',
      ],
    },
    {
      heading: 'Governing law',
      paragraphs: [
        'These terms are governed by the laws of the Province of Ontario and the federal laws of Canada that apply there.',
      ],
    },
    {
      heading: 'Contact',
      paragraphs: [
        `Questions about these terms go to ${portalConfig.contactEmail}.`,
      ],
    },
  ],
};

export const legalDocuments = [privacyPolicy, termsOfService];
