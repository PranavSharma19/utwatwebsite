export const portalConfig = {
  eventName: 'Battle of the Schools',
  eventYear: '2026',
  eventDateRange: 'September 12-13, 2026',
  // Machine-readable twins of eventDateRange. They exist so the deadline
  // can be checked against the event rather than trusted to agree with a
  // prose string somebody edits by hand -- see portalConfig.test.js. Dates
  // only, no times: the schedule is not settled to the hour.
  eventStartIso: '2026-09-12',
  eventEndIso: '2026-09-13',
  applicationDeadlineIso: '2026-09-08T23:59:00-04:00',
  contactEmail: 'contact@botu.ca',
  sponsorEmail: 'sponsors@botu.ca',
  resumeBucket: 'resumes',
  maxResumeBytes: 10 * 1024 * 1024,
  adminFunctionName: 'admin-applications',
  allowedSchools: [
    'University of Toronto St. George',
    'University of Toronto Mississauga',
    'University of Toronto Scarborough',
    'University of Waterloo',
  ],
  levelsOfStudy: [
    'Undergraduate',
    'Graduate',
    'Recent graduate',
  ],
  graduationYears: ['2026', '2027', '2028', '2029', '2030', '2031+'],
  tracks: [
    'Machine Learning',
    'Health and Life Sciences',
    'Scientific ML and Simulations',
    'Edge AI and Robotics',
    'Open Innovation',
  ],
  statuses: {
    incomplete: {
      label: 'Incomplete',
      tone: 'text-outline border-white/10 bg-white/5',
    },
    submitted: {
      label: 'Submitted',
      tone: 'text-primary border-primary/30 bg-primary/10',
    },
    admitted: {
      label: 'Admitted',
      tone: 'text-emerald-300 border-emerald-400/30 bg-emerald-400/10',
    },
    waitlisted: {
      label: 'Waitlisted',
      tone: 'text-secondary-fixed border-secondary-fixed/30 bg-secondary-fixed/10',
    },
    rejected: {
      label: 'Rejected',
      tone: 'text-rose-300 border-rose-400/30 bg-rose-400/10',
    },
  },
  policyLinks: {
    codeOfConduct: '',
    privacy: '',
    terms: '',
  },
};

export const emptyApplicationForm = {
  first_name: '',
  last_name: '',
  phone: '',
  school: portalConfig.allowedSchools[0],
  program: '',
  level_of_study: portalConfig.levelsOfStudy[0],
  graduation_year: portalConfig.graduationYears[1],
  over_18: false,
  can_attend_in_person: false,
  ml_skill_level: 'Intermediate',
  hackathon_count: '0',
  github_url: '',
  linkedin_url: '',
  portfolio_url: '',
  devpost_url: '',
  preferred_track: portalConfig.tracks[0],
  team_intent: 'Looking for teammates',
  teammate_emails: '',
  why_bots: '',
  project_story: '',
  future_build: '',
  anything_else: '',
  joke: '',
  agree_code_of_conduct: false,
  agree_privacy: false,
  agree_accuracy: false,
};

export const requiredApplicationFields = [
  'first_name',
  'last_name',
  'phone',
  'school',
  'program',
  'level_of_study',
  'graduation_year',
  'preferred_track',
  'why_bots',
  'project_story',
  'future_build',
];

export const requiredApplicationBooleans = [
  'over_18',
  'can_attend_in_person',
  'agree_privacy',
  'agree_accuracy',
];

export function isDeadlinePassed(now = new Date()) {
  return now > new Date(portalConfig.applicationDeadlineIso);
}

export function formatDeadline() {
  return new Intl.DateTimeFormat('en-CA', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'America/Toronto',
  }).format(new Date(portalConfig.applicationDeadlineIso));
}
