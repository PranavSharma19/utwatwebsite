import { describe, it, expect } from 'vitest';
import {
  buildAdmittedCsv,
  buildApplicationsCsv,
  buildAttendingCsv,
  csvEscape,
  toCsv,
} from './exports';

const app = (overrides = {}) => ({
  id: 'a1',
  email: 'ada@uwaterloo.ca',
  status: 'admitted',
  first_name: 'Ada',
  last_name: 'Lovelace',
  school: 'University of Waterloo',
  program: 'CS',
  preferred_track: 'Robotics',
  submitted_at: '2026-09-01T12:00:00Z',
  admin_notes: '',
  status_token: '11111111-1111-1111-1111-111111111111',
  rsvp_status: 'pending',
  dietary_restrictions: null,
  emergency_contact_name: null,
  emergency_contact_phone: null,
  checked_in_at: null,
  ...overrides,
});

describe('csvEscape', () => {
  it('quotes and doubles quotes', () => {
    expect(csvEscape('a "b"')).toBe('"a ""b"""');
  });

  // A leading =, +, -, @ runs as a formula in Excel/Sheets.
  it('neutralises formula prefixes', () => {
    expect(csvEscape('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvEscape('+1 647')).toBe(`"'+1 647"`);
  });

  it('renders null as empty', () => {
    expect(csvEscape(null)).toBe('""');
  });
});

describe('toCsv', () => {
  it('joins headers and rows with newlines, headers escaped like any other cell', () => {
    expect(toCsv(['a', 'b'], [['1', '2']])).toBe('"a","b"\n"1","2"');
  });
});

describe('buildApplicationsCsv', () => {
  it('keeps the original column order', () => {
    const [header] = buildApplicationsCsv([app()]).split('\n');
    expect(header).toBe(
      '"email","status","first_name","last_name","school","program","preferred_track","submitted_at","admin_notes"',
    );
  });
});

describe('buildAdmittedCsv', () => {
  it('includes only admitted rows, with a full status URL for the mail merge', () => {
    const csv = buildAdmittedCsv(
      [app(), app({ id: 'a2', status: 'waitlisted', email: 'x@y.ca' })],
      'https://utwat.ca',
    );
    const lines = csv.split('\n');
    expect(lines[0]).toBe('"first_name","last_name","email","school","status_url"');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('"https://utwat.ca/apply/status/11111111-1111-1111-1111-111111111111"');
  });

  it('sorts by last name then first name', () => {
    const csv = buildAdmittedCsv(
      [app({ last_name: 'Zuse', first_name: 'Konrad' }), app({ id: 'b', email: 'b@b.ca', last_name: 'Babbage', first_name: 'Charles' })],
      'https://utwat.ca',
    );
    expect(csv.split('\n')[1]).toContain('Babbage');
  });
});

describe('buildAttendingCsv', () => {
  it('includes only attending rows with door and catering columns', () => {
    const csv = buildAttendingCsv([
      app({ rsvp_status: 'attending', dietary_restrictions: 'vegan', emergency_contact_name: 'B', emergency_contact_phone: '1', checked_in_at: null }),
      app({ id: 'a2', email: 'no@no.ca', rsvp_status: 'declined' }),
    ]);
    const lines = csv.split('\n');
    expect(lines[0]).toBe(
      '"last_name","first_name","email","school","preferred_track","dietary_restrictions","emergency_contact_name","emergency_contact_phone","checked_in_at"',
    );
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('vegan');
  });
});
