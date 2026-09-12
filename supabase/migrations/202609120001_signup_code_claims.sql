-- Signup-code claims for Battle of the Schools 2026.
--
-- Anthropic supplies a fixed pool of platform.claude.com signup codes -- each an
-- offer link an attendee redeems for credits. This hands exactly one unused code
-- to each *attending* applicant, identified by the same status_token that gates
-- RSVP: no new credential, no account, nothing emailed. The pool is finite; when
-- it is empty a claim reports 'exhausted' rather than handing out nothing.
--
-- Deliberately its OWN table, not columns on public.applications: that table's
-- enforce_application_rules() trigger governs status/RSVP/check-in transitions
-- and would need a special case for anything added here. The browser holds no
-- grant on this table (RLS on, no policies); the claim-key Edge Function reaches
-- it with the service role, exactly as submit-application does for applications.

create table if not exists public.event_signup_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  signup_link text not null,
  claimed_by_email text,
  claimed_by_token uuid,
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.event_signup_codes enable row level security;

-- One code per person, enforced atomically. Two concurrent claims for the same
-- token each try to stamp a *different* free row with the same email; the second
-- trips this partial unique index and is caught in claim_signup_code(), which
-- then returns the first claim. Idempotency by construction, not check-then-act.
create unique index if not exists event_signup_codes_claimed_email_uniq
  on public.event_signup_codes (claimed_by_email)
  where claimed_by_email is not null;

-- Makes "find one free code" an index scan.
create index if not exists event_signup_codes_unclaimed_idx
  on public.event_signup_codes (id)
  where claimed_at is null;

-- Service role does all IO from the Edge Function; RLS (no policies) keeps
-- anon/authenticated out regardless of these grants.
grant all on public.event_signup_codes to service_role;

-- Claims one code for the person a status_token names, if and only if they are
-- admitted AND attending. Returns an outcome plus the link (null unless the
-- outcome carries one). SECURITY DEFINER so it can read applications; callable
-- only by service_role.
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
    update public.event_signup_codes
      set claimed_by_email = v_email,
          claimed_by_token = p_token,
          claimed_at = now()
      where id = (
        select ec.id from public.event_signup_codes ec
        where ec.claimed_at is null
        order by ec.id
        for update skip locked
        limit 1
      )
      returning signup_link into v_link;
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
