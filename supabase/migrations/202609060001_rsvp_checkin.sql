-- ---------------------------------------------------------------------------
-- Post-admission state: RSVP, waiver acceptance, and door check-in.
--
-- All of it lives on the application row. There is no account behind an
-- applicant, so the status_token that already identifies a row is also what
-- identifies an RSVP; a separate table would only add a join with nothing to
-- key it on. Every column is additive with a default, so this applies to the
-- live table without touching existing rows.
--
-- Two kinds of rule:
--   * CHECK constraints for anything expressible on one row (an attending RSVP
--     carries a waiver and an emergency contact; nobody is checked in who is
--     not attending).
--   * The existing enforce_application_rules() trigger for transitions, which
--     need OLD alongside NEW: RSVP only while admitted, RSVP frozen once given
--     except for an admin reset, and everything wiped if a decision is reverted.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'rsvp_status') then
    create type public.rsvp_status as enum ('pending', 'attending', 'declined');
  end if;
end
$$;

alter table public.applications
  add column if not exists rsvp_status public.rsvp_status not null default 'pending',
  add column if not exists rsvp_at timestamptz,
  add column if not exists dietary_restrictions text,
  add column if not exists emergency_contact_name text,
  add column if not exists emergency_contact_phone text,
  add column if not exists waiver_accepted_at timestamptz,
  add column if not exists waiver_version text,
  add column if not exists roster_opt_in boolean not null default false,
  add column if not exists checked_in_at timestamptz,
  add column if not exists checked_in_by text;

-- Same caps the edge function enforces, so an oversized value is a field error
-- there rather than a constraint violation here.
alter table public.applications
  add constraint applications_dietary_len
    check (dietary_restrictions is null or char_length(dietary_restrictions) <= 500),
  add constraint applications_emergency_name_len
    check (emergency_contact_name is null or char_length(emergency_contact_name) <= 200),
  add constraint applications_emergency_phone_len
    check (emergency_contact_phone is null or char_length(emergency_contact_phone) <= 50),
  add constraint applications_waiver_version_len
    check (waiver_version is null or char_length(waiver_version) <= 50),
  add constraint applications_checked_in_by_len
    check (checked_in_by is null or char_length(checked_in_by) <= 320),
  -- Rule 3: attending means the waiver was accepted and a contact was given.
  add constraint applications_attending_complete
    check (
      rsvp_status <> 'attending'
      or (
        waiver_accepted_at is not null
        and waiver_version is not null
        and emergency_contact_name is not null
        and emergency_contact_phone is not null
      )
    ),
  -- Rule 4: only an attending person can be checked in.
  add constraint applications_checkin_requires_attending
    check (checked_in_at is null or rsvp_status = 'attending');

create index if not exists applications_rsvp_status_idx
  on public.applications (rsvp_status);

-- Rules 1, 2 and 5 compare OLD with NEW, so they live in the trigger. The
-- identity and link logic below is unchanged from 202608260003.
create or replace function public.enforce_application_rules()
returns trigger
language plpgsql
as $$
declare
  uid uuid := auth.uid();
  claim_email text;
  link_value text;
  rsvp_changed boolean;
  rsvp_cleared boolean;
begin
  if uid is not null then
    if tg_op = 'INSERT' then
      new.user_id := uid;
      claim_email :=
        nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email';
      if claim_email is not null then
        new.email := claim_email;
      end if;
    end if;

    if new.resume_path is not null
       and position((uid::text || '/') in new.resume_path) <> 1 then
      raise exception 'resume_path must be within your own folder';
    end if;
  end if;

  if new.links is not null then
    for link_value in select value from jsonb_each_text(new.links)
    loop
      if link_value is not null
         and length(btrim(link_value)) > 0
         and lower(btrim(link_value)) !~ '^https?://' then
        raise exception
          'Links must be empty or start with http:// or https://';
      end if;
    end loop;
  end if;

  -- ---- RSVP / check-in transitions ----------------------------------------
  if tg_op = 'INSERT' then
    -- A brand-new application cannot arrive already answered or checked in.
    if new.rsvp_status <> 'pending' or new.checked_in_at is not null then
      raise exception 'A new application cannot carry an RSVP or check-in';
    end if;
    return new;
  end if;

  rsvp_changed :=
    new.rsvp_status is distinct from old.rsvp_status
    or new.rsvp_at is distinct from old.rsvp_at
    or new.dietary_restrictions is distinct from old.dietary_restrictions
    or new.emergency_contact_name is distinct from old.emergency_contact_name
    or new.emergency_contact_phone is distinct from old.emergency_contact_phone
    or new.waiver_accepted_at is distinct from old.waiver_accepted_at
    or new.waiver_version is distinct from old.waiver_version
    or new.roster_opt_in is distinct from old.roster_opt_in;

  -- Rule 5: a decision that is reverted takes the RSVP and check-in with it.
  -- Someone who is no longer admitted has no RSVP, whatever the caller sent.
  if old.status = 'admitted' and new.status <> 'admitted' then
    new.rsvp_status := 'pending';
    new.rsvp_at := null;
    new.dietary_restrictions := null;
    new.emergency_contact_name := null;
    new.emergency_contact_phone := null;
    new.waiver_accepted_at := null;
    new.waiver_version := null;
    new.roster_opt_in := false;
    new.checked_in_at := null;
    new.checked_in_by := null;
    return new;
  end if;

  if rsvp_changed then
    -- Rule 1: nobody RSVPs who is not admitted.
    if new.status <> 'admitted' then
      raise exception 'RSVP fields can only change on an admitted application';
    end if;

    -- Rule 2: an RSVP is final. The one way out is the admin reset, which
    -- puts every field back to its default -- and clears check-in with it,
    -- since a pending RSVP cannot be checked in (see the CHECK above).
    if old.rsvp_status <> 'pending' then
      rsvp_cleared :=
        new.rsvp_status = 'pending'
        and new.rsvp_at is null
        and new.dietary_restrictions is null
        and new.emergency_contact_name is null
        and new.emergency_contact_phone is null
        and new.waiver_accepted_at is null
        and new.waiver_version is null
        and new.roster_opt_in = false;
      if not rsvp_cleared then
        raise exception 'An RSVP is final once submitted; reset it first';
      end if;
      new.checked_in_at := null;
      new.checked_in_by := null;
    end if;
  end if;

  return new;
end;
$$;
