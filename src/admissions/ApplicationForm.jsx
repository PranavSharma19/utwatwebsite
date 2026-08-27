import { useRef, useState } from "react";
import { FileText, Trash2, Upload } from "lucide-react";
import { portalConfig } from "./portalConfig";

function Field({
  label,
  name,
  type = "text",
  value,
  onChange,
  error,
  disabled,
  placeholder,
  required = false,
}) {
  return (
    <label className="block">
      <span className="mb-2 block font-mono text-[10px] font-bold uppercase tracking-widest text-outline">
        {label}
        {required ? <span className="text-primary"> *</span> : null}
      </span>
      <input
        className={`w-full rounded-xl border bg-surface-container-lowest/90 px-4 py-3 text-sm text-white outline-none transition-all placeholder:text-outline focus:border-primary/50 ${
          error ? "border-rose-400/50" : "border-primary/10"
        } ${disabled ? "cursor-not-allowed opacity-70" : ""}`}
        disabled={disabled}
        name={name}
        onChange={onChange}
        placeholder={placeholder}
        type={type}
        value={value || ""}
      />
      {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}
    </label>
  );
}

function SelectField({
  label,
  name,
  value,
  onChange,
  error,
  disabled,
  options,
  required = false,
}) {
  return (
    <label className="block">
      <span className="mb-2 block font-mono text-[10px] font-bold uppercase tracking-widest text-outline">
        {label}
        {required ? <span className="text-primary"> *</span> : null}
      </span>
      <select
        className={`w-full rounded-xl border bg-surface-container-lowest/90 px-4 py-3 text-sm text-white outline-none transition-all focus:border-primary/50 ${
          error ? "border-rose-400/50" : "border-primary/10"
        } ${disabled ? "cursor-not-allowed opacity-70" : ""}`}
        disabled={disabled}
        name={name}
        onChange={onChange}
        value={value || ""}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}
    </label>
  );
}

function TextAreaField({
  label,
  name,
  value,
  onChange,
  error,
  disabled,
  placeholder,
  required = false,
  rows = 5,
}) {
  return (
    <label className="block">
      <span className="mb-2 block font-mono text-[10px] font-bold uppercase tracking-widest text-outline">
        {label}
        {required ? <span className="text-primary"> *</span> : null}
      </span>
      <textarea
        className={`w-full rounded-xl border bg-surface-container-lowest/90 px-4 py-3 text-sm leading-relaxed text-white outline-none transition-all placeholder:text-outline focus:border-primary/50 ${
          error ? "border-rose-400/50" : "border-primary/10"
        } ${disabled ? "cursor-not-allowed opacity-70" : ""}`}
        disabled={disabled}
        name={name}
        onChange={onChange}
        placeholder={placeholder}
        rows={rows}
        value={value || ""}
      />
      {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}
    </label>
  );
}

function CheckboxField({ label, name, checked, onChange, error, disabled }) {
  return (
    <label className="flex gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm leading-relaxed text-on-surface-variant">
      <input
        checked={Boolean(checked)}
        className="mt-1 h-4 w-4 rounded border-primary/30 bg-surface-container-lowest accent-primary"
        disabled={disabled}
        name={name}
        onChange={onChange}
        type="checkbox"
      />
      <span>
        {label}
        {error && (
          <span className="mt-2 block text-xs text-rose-300">{error}</span>
        )}
      </span>
    </label>
  );
}

function FormSection({ kicker, title, children }) {
  return (
    <section className="glass-panel rounded-3xl border border-primary/10 bg-surface-container-lowest/80 p-6 backdrop-blur-2xl sm:p-8">
      <div className="mb-6">
        <div className="font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-primary">
          {kicker}
        </div>
        <h2 className="mt-2 font-display text-2xl font-black uppercase text-white">
          {title}
        </h2>
      </div>
      <div className="grid gap-5">{children}</div>
    </section>
  );
}

export default function ApplicationForm({
  formData,
  errors,
  readOnly,
  deadlinePassed,
  submitting,
  uploadingResume,
  resumePath,
  onChange,
  onSubmit,
  onResumeUpload,
  onResumeRemove,
  // Rendered by the page, which owns the token because both submitting and
  // uploading a resume need one. Kept out of this component so it stays
  // presentational, the way every other control here is.
  captcha = null,
  captchaReady = true,
}) {
  const [fileError, setFileError] = useState("");
  const fileInputRef = useRef(null);

  const handleChange = (event) => {
    const { name, type, checked, value } = event.target;
    onChange({
      ...formData,
      [name]: type === "checkbox" ? checked : value,
    });
  };

  const handleResumeChange = async (event) => {
    setFileError("");
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (file.type !== "application/pdf") {
      setFileError("Resume must be a PDF.");
      event.target.value = "";
      return;
    }

    if (file.size > portalConfig.maxResumeBytes) {
      setFileError("Resume must be 10 MB or smaller.");
      event.target.value = "";
      return;
    }

    await onResumeUpload(file);
    event.target.value = "";
  };

  const disabled = readOnly || deadlinePassed;

  return (
    <form className="space-y-8" onSubmit={onSubmit}>
      <FormSection kicker="01 // Eligibility" title="Identity">
        <div className="grid gap-5 md:grid-cols-2">
          <Field
            disabled={disabled}
            error={errors.first_name}
            label="First Name"
            name="first_name"
            onChange={handleChange}
            required
            value={formData.first_name}
          />
          <Field
            disabled={disabled}
            error={errors.last_name}
            label="Last Name"
            name="last_name"
            onChange={handleChange}
            required
            value={formData.last_name}
          />
          {/*
            Typed, not displayed. This used to be a disabled mirror of the
            signed-in account's address, because applying required an account.
            It no longer does -- university mail systems were refusing or
            burying the sign-in link, which stopped eligible students from
            applying at all -- so the address is now something the applicant
            enters, and the only handle the admissions team has on them.
          */}
          <Field
            disabled={disabled}
            error={errors.email}
            label="Email"
            name="email"
            onChange={handleChange}
            placeholder="you@example.com"
            required
            type="email"
            value={formData.email}
          />
          <Field
            disabled={disabled}
            error={errors.phone}
            label="Phone"
            name="phone"
            onChange={handleChange}
            placeholder="+1 647 555 0100"
            required
            value={formData.phone}
          />
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <SelectField
            disabled={disabled}
            error={errors.school}
            label="School"
            name="school"
            onChange={handleChange}
            options={portalConfig.allowedSchools}
            required
            value={formData.school}
          />
          <Field
            disabled={disabled}
            error={errors.program}
            label="Program / Major"
            name="program"
            onChange={handleChange}
            required
            value={formData.program}
          />
          <SelectField
            disabled={disabled}
            error={errors.level_of_study}
            label="Level of Study"
            name="level_of_study"
            onChange={handleChange}
            options={portalConfig.levelsOfStudy}
            required
            value={formData.level_of_study}
          />
          <SelectField
            disabled={disabled}
            error={errors.graduation_year}
            label="Graduation Year"
            name="graduation_year"
            onChange={handleChange}
            options={portalConfig.graduationYears}
            required
            value={formData.graduation_year}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <CheckboxField
            checked={formData.over_18}
            disabled={disabled}
            error={errors.over_18}
            label="I confirm I will be 18 or older by the event."
            name="over_18"
            onChange={handleChange}
          />
          <CheckboxField
            checked={formData.can_attend_in_person}
            disabled={disabled}
            error={errors.can_attend_in_person}
            label={`I can attend in person for ${portalConfig.eventDateRange}.`}
            name="can_attend_in_person"
            onChange={handleChange}
          />
        </div>
      </FormSection>

      <FormSection kicker="02 // Experience" title="Builder Profile">
        <div className="grid gap-5 md:grid-cols-2">
          <SelectField
            disabled={disabled}
            label="ML Skill Level"
            name="ml_skill_level"
            onChange={handleChange}
            options={[
              "Beginner",
              "Intermediate",
              "Advanced",
              "Expert",
              "Master",
            ]}
            value={formData.ml_skill_level}
          />
          <SelectField
            disabled={disabled}
            label="Hackathons Attended"
            name="hackathon_count"
            onChange={handleChange}
            options={["0", "1", "2", "3", "4", "5+"]}
            value={formData.hackathon_count}
          />
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <Field
            disabled={disabled}
            error={errors.github_url}
            label="GitHub URL"
            name="github_url"
            onChange={handleChange}
            placeholder="https://github.com/..."
            value={formData.github_url}
          />
          <Field
            disabled={disabled}
            error={errors.linkedin_url}
            label="LinkedIn URL"
            name="linkedin_url"
            onChange={handleChange}
            placeholder="https://linkedin.com/in/..."
            value={formData.linkedin_url}
          />
          <Field
            disabled={disabled}
            error={errors.portfolio_url}
            label="Portfolio URL"
            name="portfolio_url"
            onChange={handleChange}
            placeholder="https://..."
            value={formData.portfolio_url}
          />
          <Field
            disabled={disabled}
            error={errors.devpost_url}
            label="Devpost URL"
            name="devpost_url"
            onChange={handleChange}
            placeholder="https://devpost.com/..."
            value={formData.devpost_url}
          />
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-outline">
                Optional PDF Resume
              </div>
              <p className="mt-2 text-sm text-on-surface-variant">
                {resumePath
                  ? "Resume attached."
                  : "Upload a PDF resume, 10 MB max."}
              </p>
              {fileError && (
                <p className="mt-2 text-xs text-rose-300">{fileError}</p>
              )}
            </div>
            <div className="flex flex-wrap gap-3">
              <input
                accept="application/pdf"
                className="hidden"
                disabled={disabled}
                onChange={handleResumeChange}
                ref={fileInputRef}
                type="file"
              />
              <button
                className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={disabled || uploadingResume}
                onClick={() => fileInputRef.current?.click()}
                type="button"
              >
                <Upload size={14} />
                {uploadingResume ? "Uploading..." : "Upload"}
              </button>
              {resumePath && (
                <button
                  className="inline-flex items-center gap-2 rounded-full border border-rose-400/20 bg-rose-950/10 px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-rose-300 transition-colors hover:bg-rose-950/20 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={disabled || uploadingResume}
                  onClick={onResumeRemove}
                  type="button"
                >
                  <Trash2 size={14} />
                  Remove
                </button>
              )}
            </div>
          </div>
        </div>
      </FormSection>

      <FormSection kicker="03 // BOTS" title="Event Fit">
        <div className="grid gap-5 md:grid-cols-2">
          <SelectField
            disabled={disabled}
            error={errors.preferred_track}
            label="Preferred Track"
            name="preferred_track"
            onChange={handleChange}
            options={portalConfig.tracks}
            required
            value={formData.preferred_track}
          />
          <SelectField
            disabled={disabled}
            label="Team Intent"
            name="team_intent"
            onChange={handleChange}
            options={[
              "Applying solo",
              "Applying with a team",
              "Looking for teammates",
              "Not sure yet",
            ]}
            value={formData.team_intent}
          />
        </div>
        <Field
          disabled={disabled}
          error={errors.teammate_emails}
          label="Teammate Emails"
          name="teammate_emails"
          onChange={handleChange}
          placeholder="Separate emails with commas. Everyone should apply individually."
          value={formData.teammate_emails}
        />
      </FormSection>

      <FormSection kicker="04 // Short Answers" title="Application Questions">
        <TextAreaField
          disabled={disabled}
          error={errors.why_bots}
          label="Why do you want to join Battle of the Schools?"
          name="why_bots"
          onChange={handleChange}
          required
          value={formData.why_bots}
        />
        <TextAreaField
          disabled={disabled}
          error={errors.project_story}
          label="Tell us about a project you enjoyed working on."
          name="project_story"
          onChange={handleChange}
          required
          value={formData.project_story}
        />
        <TextAreaField
          disabled={disabled}
          error={errors.future_build}
          label="What are you bullish about?"
          name="future_build"
          onChange={handleChange}
          required
          value={formData.future_build}
        />
        <TextAreaField
          disabled={disabled}
          label="Anything else we should know?"
          name="anything_else"
          onChange={handleChange}
          value={formData.anything_else}
        />
        <TextAreaField
          disabled={disabled}
          error={errors.joke}
          label="Tell us a joke! (optional)"
          name="joke"
          onChange={handleChange}
          rows={3}
          value={formData.joke}
        />
      </FormSection>

      <FormSection kicker="05 // Agreements" title="Final Checks">
        <CheckboxField
          checked={formData.agree_privacy}
          disabled={disabled}
          error={errors.agree_privacy}
          label={
            <>
              I consent to the organizers storing and reviewing my application
              data for admissions and event operations, as described in the{' '}
              {/* New tab, and the click is stopped from reaching the
                  surrounding <label>: following it in place would abandon an
                  unsaved draft, and letting it bubble would tick the box the
                  applicant was only trying to read about. */}
              <a
                href={portalConfig.policyLinks.privacy}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(event) => event.stopPropagation()}
                className="text-accent underline underline-offset-2 hover:text-ink"
              >
                Privacy Policy
              </a>
              .
            </>
          }
          name="agree_privacy"
          onChange={handleChange}
        />
        <CheckboxField
          checked={formData.agree_accuracy}
          disabled={disabled}
          error={errors.agree_accuracy}
          label="I confirm the information in this application is accurate."
          name="agree_accuracy"
          onChange={handleChange}
        />
      </FormSection>

      <div className="sticky bottom-4 z-20 rounded-3xl border border-primary/10 bg-background/90 p-4 shadow-2xl shadow-black/30 backdrop-blur-xl">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3 text-sm text-on-surface-variant">
            <FileText size={18} className="mt-0.5 shrink-0 text-primary" />
            <span>
              {readOnly
                ? "Your submitted application is locked."
                : deadlinePassed
                  ? "The application deadline has passed."
                  : "Submitting is final -- there is no editing afterwards. Your answers stay in this browser until you do."}
            </span>
          </div>
          <div className="flex flex-col items-stretch gap-3 sm:items-end">
            {captcha}
            <button
              className="rounded-full bg-gradient-to-r from-cyber-blue to-primary-container px-8 py-3 font-mono text-[10px] font-bold uppercase tracking-widest text-white shadow-glow-blue transition-all hover:scale-[1.01] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={disabled || submitting || !captchaReady}
              type="submit"
            >
              {submitting ? "Submitting..." : "Submit Application"}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
