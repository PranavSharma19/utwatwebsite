-- The Hardware track is now Robotics. The option lists in portalConfig.js and
-- submit-application's ALLOWED_OPTIONS carry the new name; this brings the
-- applications that already answered 'Hardware' along so they keep pointing at
-- a track that exists.
--
-- Same shape as 202608290002_remap_retired_track.sql: the original answers are
-- copied into `archive` first so the rename is reversible with an
-- update ... from, and re-running on a database with no 'Hardware' rows
-- changes nothing.

create table if not exists archive.track_before_robotics_rename_20260831 as
  select id, email, preferred_track, submitted_at
    from public.applications
   where preferred_track = 'Hardware';

alter table archive.track_before_robotics_rename_20260831 enable row level security;

update public.applications
   set preferred_track = 'Robotics'
 where preferred_track = 'Hardware';

-- Exact counts, not reltuples guesses, for the tables this touched.
analyze archive.track_before_robotics_rename_20260831;
analyze public.applications;
