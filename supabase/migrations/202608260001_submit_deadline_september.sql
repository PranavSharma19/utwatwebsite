-- ---------------------------------------------------------------------------
-- Move the server-side submission deadline to the real one.
--
-- The event moved to September 12-13 and the deadline to September 8, and
-- portalConfig.applicationDeadlineIso was updated to match. This copy was not.
-- Because `submit_application` is the *only* path that can set status to
-- 'submitted' (applicants hold no UPDATE on status/submitted_at), a stale
-- deadline here does not merely disagree with the UI -- it rejects every
-- submission outright. From 16 July onwards the portal advertised an open
-- application period, accepted a fully completed form, and then failed on the
-- final click with 'The application deadline has passed.'
--
-- The two values still have to be kept in sync by hand, so
-- src/admissions/portalConfig.test.js now reads this file and fails if they
-- drift again.
-- ---------------------------------------------------------------------------
create or replace function public.submit_application(p_application_id uuid)
returns public.applications
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  deadline timestamptz := '2026-09-08T23:59:00-04:00';
  result public.applications;
begin
  if uid is null then
    raise exception 'Authentication required.';
  end if;

  if now() > deadline then
    raise exception 'The application deadline has passed.';
  end if;

  update public.applications
  set status = 'submitted',
      submitted_at = now()
  where id = p_application_id
    and user_id = uid
    and status = 'incomplete'
  returning * into result;

  if not found then
    raise exception
      'Application not found, not owned by you, or already submitted.';
  end if;

  return result;
end;
$$;

revoke all on function public.submit_application(uuid) from public;
grant execute on function public.submit_application(uuid) to authenticated;
