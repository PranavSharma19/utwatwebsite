import { describe, it, expect } from 'vitest';
import { emptyRsvpForm, validateRsvp } from './rsvpValidation';

const attending = (overrides = {}) => ({
  ...emptyRsvpForm,
  attending: true,
  emergency_contact_name: 'Byron Lovelace',
  emergency_contact_phone: '647 555 0100',
  waiver_accepted: true,
  ...overrides,
});

describe('validateRsvp (client)', () => {
  it('starts undecided, so the applicant has to pick yes or no', () => {
    expect(emptyRsvpForm.attending).toBeNull();
    expect(validateRsvp(emptyRsvpForm).attending).toBeTruthy();
  });

  it('accepts a complete yes', () => {
    expect(validateRsvp(attending())).toEqual({});
  });

  it('accepts a bare no', () => {
    expect(validateRsvp({ ...emptyRsvpForm, attending: false })).toEqual({});
  });

  it('requires contact and waiver for a yes', () => {
    const errors = validateRsvp({ ...emptyRsvpForm, attending: true });
    expect(Object.keys(errors).sort()).toEqual([
      'emergency_contact_name',
      'emergency_contact_phone',
      'waiver_accepted',
    ]);
  });

  it('mirrors the server phone and length rules', () => {
    expect(validateRsvp(attending({ emergency_contact_phone: '12345' })).emergency_contact_phone).toBeTruthy();
    expect(validateRsvp(attending({ dietary_restrictions: 'x'.repeat(501) })).dietary_restrictions).toBeTruthy();
    expect(validateRsvp(attending({ emergency_contact_name: 'x'.repeat(201) })).emergency_contact_name).toBeTruthy();
  });
});
