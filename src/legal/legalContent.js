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
        'Cloudflare Turnstile runs on the vote and application forms to distinguish people from bots. Cloudflare receives your IP address and basic browser information as part of that check, under their own privacy terms. Our own server sees your IP address for the length of the request, to pass to that check and to limit floods, and does not store it.',
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
        'Supabase — the database and résumé storage. Our project is hosted in Canada (ca-central-1).',
        'Vercel — website hosting and content delivery. Vercel handles the request logs that any web host necessarily sees.',
        'Cloudflare — Turnstile bot protection on forms, as described above.',
        'Google Fonts — the site loads its typefaces from Google, which means Google receives your IP address when a page loads.',
      ],
    },
    {
      heading: 'There is no account',
      paragraphs: [
        'Applying does not create an account and does not involve a password or a sign-in link. You fill in the form and submit it. We ask for your email address because it is how the organisers reach you about a decision, not because it signs you in.',
        'While you are still filling the form in, your answers are held in your own browser and are not sent to us. That means an unfinished application stays on the device you started it on, and clearing your browser data clears it. Nothing reaches our server until you press Submit.',
        'When you submit, we give you a private status link. Your browser also remembers it, so returning to the application page on the same browser brings you back without it; the link is what lets you check from a different device. Anyone holding it can see the status of that application, which is why it is unguessable and why we suggest keeping it rather than sharing it.',
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
        'Your browser cannot read, write, or change an application directly. Every submission goes through a single server-side endpoint that checks it first, and the database grants the website no access of its own — the rules live in the database rather than only in the page. Résumés are held in a private bucket that is not publicly reachable. Organiser access is restricted to a named list of accounts and does require signing in.',
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
        'You may change your answers freely until you press Submit. Submitting is final: there is no account to sign back into and no way to edit afterwards. If something is wrong in a submitted application, write to the organisers and ask.',
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

/**
 * The participant waiver an admitted applicant accepts when they RSVP.
 *
 * `placeholder` is a real switch, not a note: while it is true the status page
 * shows "RSVP opens shortly" instead of the form (src/admissions/statusView.js),
 * which is the code-level form of the rule that no decision email goes out
 * before the waiver is live. It is false now that the wording below is final.
 * If the wording changes again after anyone has accepted it, bump `version` in
 * all three places (here, portalConfig.waiverVersion, and WAIVER_VERSION in
 * supabase/functions/submit-application/rsvp.ts) so each stored acceptance
 * still names the text that was actually accepted.
 *
 * There is deliberately no parent/guardian consent section. The event is 18+
 * and that is enforced, not advisory: deriveStatusView returns 'underage' for
 * an applicant whose over_18 is not true, and the rsvp action in rsvp.ts
 * refuses their RSVP outright. A guardian block would be text no one can ever
 * reach, implying a path into the event that does not exist.
 */
export const participantWaiver = {
  slug: 'waiver',
  title: 'Participant Waiver',
  updated: portalConfig.waiverVersion,
  version: portalConfig.waiverVersion,
  placeholder: false,
  intro: [
    `This is the agreement you accept when you RSVP to ${portalConfig.eventName} ${portalConfig.eventYear} (${portalConfig.eventDateRange}), referred to below as the Event. The Event is organised by UTWAT together with UTMIST.`,
    `You accept it digitally: there is nothing to print, sign, or scan. On your status page you tick "I have read and agree to the Participant Waiver" and submit your RSVP, and that submission is your signature. See "How you sign this" below for exactly what gets recorded.`,
    `Questions about the waiver can be sent to ${portalConfig.contactEmail} before you accept it.`,
  ],
  sections: [
    {
      heading: 'Eligibility',
      paragraphs: [
        `Participation is open to admitted applicants who are ${portalConfig.minimumAge} or over on the first day of the Event. You confirmed your age on your application, and the RSVP form will not accept a response from an applicant recorded as under ${portalConfig.minimumAge}. If your date of birth was recorded incorrectly, email ${portalConfig.contactEmail} rather than RSVPing.`,
      ],
    },
    {
      heading: 'Assumption of risk',
      paragraphs: [
        'I understand that participation in the Event may involve risks, including but not limited to travel to and from the Event, prolonged periods of computer use, physical activity, working in a shared environment, equipment use, food and beverage consumption, and other foreseeable or unforeseeable risks associated with attending a hackathon. I voluntarily assume these risks and agree to take reasonable care of myself and others while participating.',
      ],
    },
    {
      heading: 'Participant conduct',
      paragraphs: [
        'I agree to follow all Event rules, applicable laws, venue policies, and instructions provided by the organisers, volunteers, staff, and venue personnel. I will behave respectfully toward other participants, organisers, mentors, sponsors, and guests.',
        'The organisers reserve the right to remove any participant whose conduct is unsafe, disruptive, discriminatory, harassing, or otherwise inappropriate, without refund or compensation where applicable.',
      ],
    },
    {
      heading: 'Health and emergencies',
      paragraphs: [
        'I understand that I am responsible for managing my own health and personal needs during the Event. In the event of an emergency, I authorise Event organisers or their representatives to contact emergency services and/or the emergency contact I gave on my RSVP form when reasonably necessary. I understand that organisers are not responsible for providing medical treatment.',
        'The emergency contact name and phone number collected with this waiver are used for that purpose and for nothing else. Tell that person you have listed them.',
      ],
    },
    {
      heading: 'Personal property and equipment',
      paragraphs: [
        'I am responsible for my own belongings, including laptops, phones, chargers, and other personal equipment. I understand that the organisers, venue, sponsors, volunteers, and affiliated individuals are not responsible for loss, theft, or damage to personal property, except where such responsibility cannot legally be excluded.',
      ],
    },
    {
      heading: 'Release of liability',
      paragraphs: [
        'To the fullest extent permitted by applicable law, I release and hold harmless UTWAT, UTMIST, the Event organisers, volunteers, staff, sponsors, venue, and their respective officers, directors, employees, and representatives from claims arising from my participation in the Event, including claims relating to personal injury, illness, property damage, or loss, except to the extent caused by their gross negligence, wilful misconduct, or where such limitation is prohibited by law.',
      ],
    },
    {
      heading: 'Photography and media',
      paragraphs: [
        'I understand that photographs, video, and other recordings may be taken during the Event. By participating, I grant the organisers permission to use my image, likeness, and/or voice in photographs, videos, promotional materials, social media, websites, and other communications relating to the Event, without additional compensation.',
        `If you would rather not appear, email ${portalConfig.contactEmail} before the Event or tell any organiser while you are there, and we will keep you out of what we capture and publish. You do not have to give a reason, and opting out does not affect your participation.`,
      ],
    },
    {
      heading: 'Projects and intellectual property',
      paragraphs: [
        'I understand that I retain ownership of intellectual property that I create during the Event, subject to any separate competition rules, sponsor requirements, or agreements that I have expressly accepted. I am responsible for ensuring that my project complies with applicable laws and does not infringe the intellectual property or other rights of third parties.',
      ],
    },
    {
      heading: 'How you sign this',
      paragraphs: [
        'Ticking the waiver checkbox on your status page and submitting your RSVP has the same effect as signing this document by hand. There is no paper copy and no separate signature step.',
        `When you submit, we store against your application: that you accepted the waiver, the date and time you accepted it, and the version of this text you accepted (version ${portalConfig.waiverVersion}). Your name, email address, and school are already on your application and identify the acceptance. This page always shows the current version, so if the wording is ever revised after you accept, the record still names the wording you agreed to.`,
        'Listing your first name, last initial, and school on the public participants list is a separate, optional checkbox on the same form. It is not part of this waiver, and leaving it unticked changes nothing about your participation.',
      ],
    },
    {
      heading: 'Acknowledgement',
      paragraphs: [
        `I confirm that I have read and understood this Waiver and Release and have had the opportunity to ask questions before participating. I voluntarily agree to its terms and understand that I am responsible for my own participation and conduct throughout the Event.`,
      ],
    },
  ],
};

export const legalDocuments = [privacyPolicy, termsOfService, participantWaiver];
