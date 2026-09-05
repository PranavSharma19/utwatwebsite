-- ---------------------------------------------------------------------------
-- Remove two trial applications submitted after launch.
--
-- `rishabh2003sharma@gmail.com` and `fakeapp@gmail.com` are ours: a walkthrough
-- of the live form and a throwaway. Neither is a real applicant, and each one
-- currently holds an address hostage -- applications_email_uniq is on
-- lower(email), so while these rows exist neither address can submit again.
--
-- Nothing is dropped outright. Matching rows are copied into `archive` first,
-- so anything deleted here goes back with a plain insert ... select. `archive`
-- was created by 202608290001, is not in the PostgREST exposed schemas, and
-- grants nothing to anon or authenticated.
--
-- The delete is pinned to exact lower(email) equality against a two-address
-- list -- never a status filter, never a LIKE on the domain -- and aborts if it
-- somehow matches more rows than there are addresses. Applications have been
-- open to real people since 2026-08-29; a loose predicate here would take real
-- submissions with it.
--
-- Resume PDFs are deliberately NOT removed here. Deleting from storage.objects
-- drops the metadata row and leaves the bytes orphaned in the bucket, so the
-- notice below prints each resume_path and those objects are removed through
-- the storage API separately.
--
-- Re-running this is a no-op: the copy is `if not exists` and the delete hits
-- rows that are already gone.
-- ---------------------------------------------------------------------------

create schema if not exists archive;
revoke all on schema archive from anon, authenticated;

create table if not exists archive.applications_trial_20260905 as
  select * from public.applications
   where lower(email) in ('rishabh2003sharma@gmail.com', 'fakeapp@gmail.com');

alter table archive.applications_trial_20260905 enable row level security;

do $$
declare
  targets constant text[] :=
    array['rishabh2003sharma@gmail.com', 'fakeapp@gmail.com'];
  matched bigint;
  doomed record;
begin
  select count(*) into matched
    from public.applications
   where lower(email) = any (targets);

  if matched > array_length(targets, 1) then
    raise exception 'refusing to delete: % rows matched % addresses',
      matched, array_length(targets, 1);
  end if;

  for doomed in
    select email, first_name, last_name, status, resume_path, submitted_at
      from public.applications
     where lower(email) = any (targets)
     order by email
  loop
    raise notice 'deleting % -- % % / status % / resume % / submitted %',
      doomed.email,
      coalesce(doomed.first_name, '?'),
      coalesce(doomed.last_name, '?'),
      doomed.status,
      coalesce(doomed.resume_path, '(none)'),
      coalesce(doomed.submitted_at::text, '(never)');
  end loop;

  raise notice '% trial application(s) archived to archive.applications_trial_20260905',
    matched;
end
$$;

delete from public.applications
 where lower(email) in ('rishabh2003sharma@gmail.com', 'fakeapp@gmail.com');
