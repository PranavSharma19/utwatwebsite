// Every CSV the console produces. Moved out of AdmissionsAdminPage so the
// formula-injection guard has one home and each export can be tested as a
// string rather than by clicking a button.

export function csvEscape(value) {
  let text = value == null ? '' : String(value);
  // Neutralize spreadsheet formula injection: a leading =, +, -, @, tab, or CR
  // can execute when the export is opened in Excel/Sheets.
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  return `"${text.replaceAll('"', '""')}"`;
}

export function toCsv(headers, rows) {
  return [headers.join(','), ...rows.map((row) => row.map(csvEscape).join(','))].join('\n');
}

const byName = (a, b) =>
  (a.last_name || '').localeCompare(b.last_name || '') ||
  (a.first_name || '').localeCompare(b.first_name || '');

const pick = (headers) => (application) => headers.map((h) => application[h]);

const APPLICATION_HEADERS = [
  'email', 'status', 'first_name', 'last_name', 'school', 'program',
  'preferred_track', 'submitted_at', 'admin_notes',
];

/** The general export the console has always had; whatever is filtered in. */
export function buildApplicationsCsv(applications) {
  return toCsv(APPLICATION_HEADERS, applications.map(pick(APPLICATION_HEADERS)));
}

/**
 * Mail-merge input: one row per admitted applicant with their personal status
 * link. `origin` is window.location.origin at click time, so exporting from
 * production yields production links.
 */
export function buildAdmittedCsv(applications, origin) {
  const headers = ['first_name', 'last_name', 'email', 'school', 'status_url'];
  const rows = applications
    .filter((a) => a.status === 'admitted')
    .sort(byName)
    .map((a) => [
      a.first_name, a.last_name, a.email, a.school,
      `${origin}/apply/status/${a.status_token}`,
    ]);
  return toCsv(headers, rows);
}

/** The day-of sheet and, printed, the door clipboard. Sorted by last name. */
export function buildAttendingCsv(applications) {
  const headers = [
    'last_name', 'first_name', 'email', 'school', 'preferred_track',
    'dietary_restrictions', 'emergency_contact_name', 'emergency_contact_phone',
    'checked_in_at',
  ];
  const rows = applications
    .filter((a) => a.rsvp_status === 'attending')
    .sort(byName)
    .map(pick(headers));
  return toCsv(headers, rows);
}

export function downloadCsv(filename, csv) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
