-- Restrict code claims to people who are physically here: admitted, attending,
-- AND checked in at the door. The pool (200) matches the checked-in count, not
-- the full attending count (263), so an ungated claim would let 63 people who
-- RSVP'd but haven't arrived drain codes meant for those present.
--
-- New outcome 'not_checked_in' for an attendee who hasn't checked in yet, so the
-- page can tell them to check in rather than showing the generic refusal. The
-- already-claimed check runs BEFORE the check-in gate so a code, once claimed,
-- is always returned idempotently regardless of later state.

create or replace function public.claim_signup_code(p_token uuid)
returns table (outcome text, signup_link text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email      text;
  v_status     public.application_status;
  v_rsvp       public.rsvp_status;
  v_checked_in boolean;
  v_link       text;
begin
  select lower(email), status, rsvp_status, (checked_in_at is not null)
    into v_email, v_status, v_rsvp, v_checked_in
    from public.applications
    where status_token = p_token;

  if not found then
    return query select 'not_found'::text, null::text;
    return;
  end if;

  if v_status <> 'admitted' or v_rsvp <> 'attending' then
    return query select 'not_attending'::text, null::text;
    return;
  end if;

  -- Already claimed? Hand back the same link (idempotent), regardless of
  -- current check-in state.
  select ec.signup_link into v_link
    from public.event_signup_codes ec
    where ec.claimed_by_email = v_email
    limit 1;
  if found then
    return query select 'already_claimed'::text, v_link;
    return;
  end if;

  -- Must be here to claim.
  if not v_checked_in then
    return query select 'not_checked_in'::text, null::text;
    return;
  end if;

  -- Take one free code. SKIP LOCKED lets concurrent claimants grab different
  -- rows without blocking; the partial unique index is the one-per-person guard.
  begin
    update public.event_signup_codes as t
      set claimed_by_email = v_email,
          claimed_by_token = p_token,
          claimed_at = now()
      where t.id = (
        select ec.id from public.event_signup_codes ec
        where ec.claimed_at is null
        order by ec.id
        for update skip locked
        limit 1
      )
      returning t.signup_link into v_link;
  exception when unique_violation then
    select ec.signup_link into v_link
      from public.event_signup_codes ec
      where ec.claimed_by_email = v_email
      limit 1;
    return query select 'already_claimed'::text, v_link;
    return;
  end;

  if v_link is null then
    return query select 'exhausted'::text, null::text;
    return;
  end if;

  return query select 'claimed'::text, v_link;
end;
$$;

revoke all on function public.claim_signup_code(uuid) from public, anon, authenticated;
grant execute on function public.claim_signup_code(uuid) to service_role;
