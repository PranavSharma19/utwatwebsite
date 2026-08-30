-- Tracks went from five to three in 5c40bac. Two applications had already
-- arrived by then, and one of them named a track that no longer runs. That
-- answer is remapped to 'Web Agents' so no application is left pointing at a
-- track nobody can be placed in.
--
-- The original answers are copied into `archive` first, so the remap is
-- reversible with an update ... from. `archive` is not PostgREST-exposed and
-- grants nothing to anon or authenticated.
--
-- Deliberately keyed on "not one of the three that run" rather than on the
-- literal 'Machine Learning': any retired name is caught, and re-running this
-- on a database where every answer is already valid changes nothing.

create schema if not exists archive;
revoke all on schema archive from anon, authenticated;

create table if not exists archive.track_before_remap_20260829 as
  select id, email, preferred_track, submitted_at
    from public.applications
   where coalesce(preferred_track, '') <> ''
     and preferred_track not in ('Healthcare', 'Hardware', 'Web Agents');

alter table archive.track_before_remap_20260829 enable row level security;

update public.applications
   set preferred_track = 'Web Agents'
 where coalesce(preferred_track, '') <> ''
   and preferred_track not in ('Healthcare', 'Hardware', 'Web Agents');

-- Exact counts, not reltuples guesses, for the tables this touched.
analyze archive.track_before_remap_20260829;
analyze archive.applications_prelaunch_20260829;
analyze archive.faction_cheers_prelaunch_20260829;
analyze public.applications;
