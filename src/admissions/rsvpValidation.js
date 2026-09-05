// Client copy of the rules in supabase/functions/submit-application/rsvp.ts.
// Same keys, same limits: the server re-runs every one of these and its field
// errors land on this form, so the two have to agree on names.

export const emptyRsvpForm = {
  attending: null,
  dietary_restrictions: '',
  emergency_contact_name: '',
  emergency_contact_phone: '',
  waiver_accepted: false,
  roster_opt_in: false,
};

export const RSVP_LIMITS = {
  dietary_restrictions: 500,
  emergency_contact_name: 200,
  emergency_contact_phone: 50,
  minPhoneDigits: 7,
};

const text = (value) => (typeof value === 'string' ? value.trim() : '');

export function validateRsvp(form) {
  const errors = {};

  if (typeof form.attending !== 'boolean') {
    errors.attending = 'Tell us whether you are attending.';
  }
  if (form.attending !== true) return errors;

  const name = text(form.emergency_contact_name);
  if (!name) errors.emergency_contact_name = 'This field is required.';
  else if (name.length > RSVP_LIMITS.emergency_contact_name) {
    errors.emergency_contact_name = `Must be ${RSVP_LIMITS.emergency_contact_name} characters or fewer.`;
  }

  const phone = text(form.emergency_contact_phone);
  const digits = phone.replace(/\D/g, '').length;
  if (!phone) errors.emergency_contact_phone = 'This field is required.';
  else if (phone.length > RSVP_LIMITS.emergency_contact_phone) {
    errors.emergency_contact_phone = `Must be ${RSVP_LIMITS.emergency_contact_phone} characters or fewer.`;
  } else if (digits < RSVP_LIMITS.minPhoneDigits) {
    errors.emergency_contact_phone = 'Enter a phone number with at least 7 digits.';
  }

  if (text(form.dietary_restrictions).length > RSVP_LIMITS.dietary_restrictions) {
    errors.dietary_restrictions = `Must be ${RSVP_LIMITS.dietary_restrictions} characters or fewer.`;
  }

  if (form.waiver_accepted !== true) {
    errors.waiver_accepted = 'You must accept the waiver to attend.';
  }

  return errors;
}
