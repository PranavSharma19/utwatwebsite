-- Fix: claim_signup_code() threw "column reference signup_link is ambiguous" on
-- every real claim. The function's OUT parameter is named signup_link and so is
-- the table column, so the unqualified `returning signup_link` in the claim
-- branch could not be resolved. The not_found / not_attending / already_claimed
-- branches never reach that line, which is why it went unnoticed until a real
-- attending token hit the UPDATE.
--
-- Only the claim UPDATE changes: the target is aliased `t` and the RETURNING is
-- qualified `t.signup_link`. Everything else is identical to 202609120001.

create or replace function public.claim_signup_code(p_token uuid)
returns table (outcome text, signup_link text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email  text;
  v_status public.application_status;
  v_rsvp   public.rsvp_status;
  v_link   text;
begin
  select lower(email), status, rsvp_status
    into v_email, v_status, v_rsvp
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

  -- Already claimed? Hand back the same link (idempotent).
  select ec.signup_link into v_link
    from public.event_signup_codes ec
    where ec.claimed_by_email = v_email
    limit 1;
  if found then
    return query select 'already_claimed'::text, v_link;
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
    -- A concurrent claim for this same person won; return theirs.
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
