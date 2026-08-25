-- Cheer tally for the Battle of the Schools faction split.
--
-- The browser never reaches this table. RLS is on with NO anon policies;
-- all access goes through the faction-cheer Edge Function under the service
-- role, which is also where Turnstile verification and IP hashing happen.

create table public.faction_cheers (
  id           uuid primary key default gen_random_uuid(),
  faction      text not null check (faction in ('utmist', 'watai')),
  visitor_hash text not null,
  created_at   timestamptz not null default now()
);

-- visitor_hash is derived by the Edge Function from (ip, UTC day, salt) — see
-- faction-cheer/index.ts. This index therefore enforces one cheer per IP per
-- UTC day, accumulating into an all-time tally — NOT one cheer per visitor
-- forever. That's deliberate: dropping the day would cap an entire campus
-- behind NAT at a single vote for the whole campaign. The daily rotation lets
-- a campus contribute once per day while bounding per-IP inflation, which
-- rate limiting and Turnstile then blunt further. Server-side dedup either
-- way; a client-side guard is not a defence.
create unique index faction_cheers_visitor_uniq
  on public.faction_cheers (visitor_hash);

create index faction_cheers_faction_idx
  on public.faction_cheers (faction);

alter table public.faction_cheers enable row level security;

-- Intentionally no policies: nothing reaches this table with the anon key.

revoke all on public.faction_cheers from anon, authenticated;
