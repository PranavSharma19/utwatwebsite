import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatRsvpDeadline, portalConfig } from './portalConfig';
import { emptyRsvpForm, validateRsvp } from './rsvpValidation';
import { RSVP_ERROR_COPY } from './statusView';

const inputClass =
  'w-full rounded-xl border border-primary/10 bg-surface-container-lowest/90 px-4 py-3 text-sm text-white outline-none placeholder:text-outline focus:border-primary/50';

function Field({ id, label, error, children }) {
  return (
    <label className="block" htmlFor={id}>
      <span className="mb-2 block font-mono text-[10px] font-bold uppercase tracking-widest text-outline">
        {label}
      </span>
      {children}
      {error && <span className="mt-2 block text-xs text-rose-300">{error}</span>}
    </label>
  );
}

/**
 * One shot, like the application itself. `onSubmit(form)` is expected to
 * reject with an ApplicationError: fieldErrors land on the fields, anything
 * else is mapped through RSVP_ERROR_COPY or shown as-is.
 */
export default function RsvpForm({ application, onSubmit }) {
  const [form, setForm] = useState(emptyRsvpForm);
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const set = (field) => (event) => {
    const value =
      event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setForm((current) => ({ ...current, [field]: value }));
  };

  const choose = (attending) => () => {
    setForm((current) => ({ ...current, attending }));
    setErrors({});
    setBanner('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const found = validateRsvp(form);
    setErrors(found);
    setBanner('');
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    try {
      await onSubmit(form);
    } catch (error) {
      if (error?.fieldErrors && Object.keys(error.fieldErrors).length > 0) {
        setErrors(error.fieldErrors);
        setBanner(error.message);
      } else {
        setBanner(RSVP_ERROR_COPY[error?.message] || error?.message || 'Something went wrong.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const choiceClass = (active) =>
    `rounded-full border px-6 py-3 font-mono text-[10px] font-bold uppercase tracking-widest transition-colors ${
      active
        ? 'border-primary bg-primary/20 text-white'
        : 'border-white/10 bg-white/5 text-on-surface-variant hover:text-white'
    }`;

  return (
    <form className="mt-8 space-y-6" noValidate onSubmit={handleSubmit}>
      <div>
        <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-outline">
          RSVP by {formatRsvpDeadline(application.rsvp_deadline)}
        </div>
        <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
          Are you attending {portalConfig.eventName} on {portalConfig.eventDateRange}?
          You can answer once, so make it the real answer.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
          Read the{' '}
          <Link className="text-primary hover:underline" target="_blank" to={portalConfig.policyLinks.waiver}>
            Participant Waiver
          </Link>{' '}
          before you answer; saying yes means accepting it.
        </p>
        <div className="mt-4 flex gap-3">
          <button
            aria-pressed={form.attending === true}
            className={choiceClass(form.attending === true)}
            onClick={choose(true)}
            type="button"
          >
            Yes, I&apos;m coming
          </button>
          <button
            aria-pressed={form.attending === false}
            className={choiceClass(form.attending === false)}
            onClick={choose(false)}
            type="button"
          >
            No, I can&apos;t
          </button>
        </div>
        {errors.attending && (
          <p className="mt-2 text-xs text-rose-300">{errors.attending}</p>
        )}
      </div>

      {form.attending === true && (
        <div className="space-y-5 border-t border-white/10 pt-6">
          <Field id="rsvp-dietary" label="Dietary restrictions (optional)" error={errors.dietary_restrictions}>
            <input
              className={inputClass}
              id="rsvp-dietary"
              onChange={set('dietary_restrictions')}
              placeholder="Vegetarian, halal, nut allergy..."
              value={form.dietary_restrictions}
            />
          </Field>

          <Field id="rsvp-contact-name" label="Emergency contact name" error={errors.emergency_contact_name}>
            <input
              className={inputClass}
              id="rsvp-contact-name"
              onChange={set('emergency_contact_name')}
              value={form.emergency_contact_name}
            />
          </Field>

          <Field id="rsvp-contact-phone" label="Emergency contact phone" error={errors.emergency_contact_phone}>
            <input
              className={inputClass}
              id="rsvp-contact-phone"
              inputMode="tel"
              onChange={set('emergency_contact_phone')}
              value={form.emergency_contact_phone}
            />
          </Field>

          <label className="flex items-start gap-3 text-sm text-on-surface-variant">
            <input
              checked={form.waiver_accepted}
              className="mt-1"
              onChange={set('waiver_accepted')}
              type="checkbox"
            />
            <span>I have read and agree to the Participant Waiver.</span>
          </label>
          {errors.waiver_accepted && (
            <p className="-mt-3 text-xs text-rose-300">{errors.waiver_accepted}</p>
          )}

          <label className="flex items-start gap-3 text-sm text-on-surface-variant">
            <input
              checked={form.roster_opt_in}
              className="mt-1"
              onChange={set('roster_opt_in')}
              type="checkbox"
            />
            <span>
              Show my first name, last initial, and school on the public participants list.
            </span>
          </label>
        </div>
      )}

      {banner && (
        <div className="rounded-2xl border border-rose-400/20 bg-rose-950/20 p-4 text-sm text-rose-100">
          {banner}
        </div>
      )}

      {form.attending !== null && (
        <button
          className="w-full rounded-full bg-gradient-to-r from-cyber-blue to-primary-container px-6 py-3 font-mono text-[10px] font-bold uppercase tracking-widest text-white shadow-glow-blue disabled:cursor-not-allowed disabled:opacity-60"
          disabled={submitting}
          type="submit"
        >
          {submitting ? 'Sending...' : 'Send RSVP'}
        </button>
      )}
    </form>
  );
}
