-- One-time pre-launch reset.
--
-- Everything in `applications` and `faction_cheers` on 2026-08-29 came from our
-- own testing: form walkthroughs, the deployed-portal stress test, and poll
-- clicks. Applications open to real people tonight, so the tables start empty.
--
-- Nothing is dropped outright. Both tables are copied into `archive` first, so
-- a row deleted here can be put back with a plain insert ... select. `archive`
-- is not in the PostgREST exposed schemas and grants nothing to anon or
-- authenticated, so the copies are reachable only with the service role.
--
-- Re-running this on a fresh database is a no-op: the copies are `if not
-- exists` and the deletes hit empty tables.

create schema if not exists archive;
revoke all on schema archive from anon, authenticated;

create table if not exists archive.applications_prelaunch_20260829 as
  select * from public.applications;

create table if not exists archive.faction_cheers_prelaunch_20260829 as
  select * from public.faction_cheers;

alter table archive.applications_prelaunch_20260829 enable row level security;
alter table archive.faction_cheers_prelaunch_20260829 enable row level security;

do $$
declare
  archived_applications bigint;
  archived_cheers bigint;
begin
  select count(*) into archived_applications
    from archive.applications_prelaunch_20260829;
  select count(*) into archived_cheers
    from archive.faction_cheers_prelaunch_20260829;
  raise notice 'archived % applications and % faction cheers',
    archived_applications, archived_cheers;
end
$$;

delete from public.applications;
delete from public.faction_cheers;
