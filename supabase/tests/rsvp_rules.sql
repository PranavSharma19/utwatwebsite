-- Exercises rules 1-5 from the spec against a real Postgres. Manual: run it
-- after `supabase db reset` on a local stack. It creates one row, tries each
-- forbidden transition inside a savepoint, and asserts the error. Rolls back.
begin;

insert into public.applications (email, status, first_name, last_name, school, over_18, submitted_at)
values ('rsvp-test@example.com', 'submitted', 'Test', 'Person', 'University of Waterloo', true, now());

-- Rule 1: cannot RSVP while merely submitted.
do $$
begin
  begin
    update public.applications set rsvp_status = 'declined', rsvp_at = now()
    where email = 'rsvp-test@example.com';
    raise exception 'FAIL rule 1: RSVP accepted on a submitted application';
  exception when others then
    if sqlerrm not like 'RSVP fields can only change%' then raise; end if;
  end;
end $$;

update public.applications set status = 'admitted', decided_at = now(), decided_by = 'admin@example.com'
where email = 'rsvp-test@example.com';

-- Rule 3: attending without waiver/contact is refused by the CHECK.
do $$
begin
  begin
    update public.applications set rsvp_status = 'attending', rsvp_at = now()
    where email = 'rsvp-test@example.com';
    raise exception 'FAIL rule 3: attending without waiver accepted';
  exception when check_violation then null;
  end;
end $$;

-- Rule 4: cannot check in while pending.
do $$
begin
  begin
    update public.applications set checked_in_at = now(), checked_in_by = 'door@example.com'
    where email = 'rsvp-test@example.com';
    raise exception 'FAIL rule 4: checked in while RSVP pending';
  exception when check_violation then null;
  end;
end $$;

-- A complete attending RSVP is accepted.
update public.applications set
  rsvp_status = 'attending', rsvp_at = now(),
  emergency_contact_name = 'Parent', emergency_contact_phone = '6475550100',
  waiver_accepted_at = now(), waiver_version = '2026-09-08', roster_opt_in = true
where email = 'rsvp-test@example.com';

-- Rule 2: editing after the fact is refused.
do $$
begin
  begin
    update public.applications set dietary_restrictions = 'changed my mind'
    where email = 'rsvp-test@example.com';
    raise exception 'FAIL rule 2: RSVP edited after submission';
  exception when others then
    if sqlerrm not like 'An RSVP is final%' then raise; end if;
  end;
end $$;

-- Check-in works on an attending row.
update public.applications set checked_in_at = now(), checked_in_by = 'door@example.com'
where email = 'rsvp-test@example.com';

-- Rule 2 (reset path): the full reset is allowed and clears check-in too.
update public.applications set
  rsvp_status = 'pending', rsvp_at = null, dietary_restrictions = null,
  emergency_contact_name = null, emergency_contact_phone = null,
  waiver_accepted_at = null, waiver_version = null, roster_opt_in = false
where email = 'rsvp-test@example.com';

do $$
declare r record;
begin
  select checked_in_at, checked_in_by into r from public.applications where email = 'rsvp-test@example.com';
  if r.checked_in_at is not null or r.checked_in_by is not null then
    raise exception 'FAIL rule 2: reset did not clear check-in';
  end if;
end $$;

-- Rule 5: reverting the decision wipes everything.
update public.applications set
  rsvp_status = 'declined', rsvp_at = now()
where email = 'rsvp-test@example.com';
update public.applications set status = 'waitlisted'
where email = 'rsvp-test@example.com';

do $$
declare r record;
begin
  select rsvp_status, rsvp_at into r from public.applications where email = 'rsvp-test@example.com';
  if r.rsvp_status <> 'pending' or r.rsvp_at is not null then
    raise exception 'FAIL rule 5: reverting the decision left an RSVP behind';
  end if;
end $$;

select 'rsvp_rules: all assertions passed' as result;
rollback;
