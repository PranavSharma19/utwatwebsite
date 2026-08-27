-- ---------------------------------------------------------------------------
-- Remove the account requirement from applying.
--
-- Why: applying required receiving a magic link, and university mail systems
-- do not reliably deliver them. Waterloo's gateway refuses mail from shared
-- sending pools outright ('550 #5.7.1'); Microsoft accepts it and files it
-- somewhere the applicant never sees; and Defender Safe Links fetches URLs to
-- scan them, which can spend a single-use token before the human clicks it.
-- Every one of those failures happens *outside* anything this project can fix,
-- and each one stops an eligible student from applying at all.
--
-- So email stops being a credential and becomes a form field. After this
-- migration the browser has NO write access to public.applications at all --
-- not even authenticated write access. The sole writer is the
-- `submit-application` edge function, which holds the service role, verifies
-- Turnstile, and enforces the deadline. That is strictly less public write
-- surface than before, not more.
--
-- Identity/ownership is replaced by two things:
--   * unique (lower(email))  -- one application per address, as before it was
--                               one per account
--   * status_token           -- an unguessable uuid handed back on submit and
--                               used for the bookmarkable status page, so an
--                               applicant can check their result without
--                               receiving any mail from us
-- ---------------------------------------------------------------------------

-- 1. Applications no longer belong to an auth user. Existing rows keep theirs;
--    nothing is deleted. NULLs do not collide under a UNIQUE constraint in
--    Postgres, so applications_one_per_user can stay exactly as it is and
--    still protect the legacy rows.
alter table public.applications
  alter column user_id drop not null;

-- 2. One application per email address. This replaces the per-account
--    uniqueness that user_id used to give us. Deliberately on lower(email):
--    addresses are case-insensitive in practice and 'A@x.ca' must not buy a
--    second slot over 'a@x.ca'.
--
--    If this fails with a uniqueness violation, the table already contains
--    duplicate addresses -- resolve those by hand rather than weakening the
--    index; a silent duplicate here is a person applying twice.
create unique index if not exists applications_email_uniq
  on public.applications (lower(email));

-- 3. The capability that replaces "sign in to see your status". Unguessable,
--    issued once at submit, and the only thing the status endpoint accepts.
alter table public.applications
  add column if not exists status_token uuid not null default gen_random_uuid();

create unique index if not exists applications_status_token_uniq
  on public.applications (status_token);

-- 4. Close the applicant write path entirely.
--    These policies and grants described a browser that authenticates. No such
--    browser exists any more on the applicant side, and leaving them in place
--    would leave a writable surface that nothing uses -- the worst kind.
--    service_role bypasses RLS, so the edge function is unaffected.
drop policy if exists "Applicants can read their own application" on public.applications;
drop policy if exists "Applicants can create their own draft" on public.applications;
drop policy if exists "Applicants can update drafts before submission" on public.applications;

revoke insert, update on public.applications from authenticated;

-- Storage likewise: resumes are uploaded through a signed URL that the edge
-- function issues after it has verified a Turnstile token. No browser holds a
-- standing grant on the bucket.
drop policy if exists "Applicants can read their own resumes" on storage.objects;
drop policy if exists "Applicants can upload their own resumes" on storage.objects;
drop policy if exists "Applicants can replace their own resumes" on storage.objects;
drop policy if exists "Applicants can remove their own resumes" on storage.objects;

-- 5. The submission RPC required auth.uid() and is now unreachable. The
--    deadline it guarded moves into the edge function, which is the only
--    writer left. src/admissions/portalConfig.test.js follows it there.
drop function if exists public.submit_application(uuid);

-- 6. Keep the XSS guard on the path that still exists.
--    enforce_application_rules() returned early whenever auth.uid() was null,
--    treating "no JWT" as "trusted backend". That was true when the only
--    no-JWT writer was the admin function. It is not true now: every applicant
--    insert arrives with no JWT. Link validation therefore has to run for
--    every writer, or de-authing the form would silently drop the
--    javascript:/data: check that keeps the admin console safe to click
--    through. Only the identity assignment stays JWT-gated, because only a
--    JWT can supply an identity.
create or replace function public.enforce_application_rules()
returns trigger
language plpgsql
as $$
declare
  uid uuid := auth.uid();
  claim_email text;
  link_value text;
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

  -- Runs for every writer, service_role included. An applicant-supplied link
  -- renders as an anchor in the admin console; a javascript: or data: URL
  -- there is stored XSS against a reviewer.
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

  return new;
end;
$$;

-- 7. Email is now applicant-supplied rather than copied from a verified JWT
--    claim, so it needs the same length cap every other free-text column has.
alter table public.applications
  add constraint applications_email_len
    check (char_length(email) <= 320);
