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

-- One cheer per visitor. Server-side dedup; a client-side guard is not a defence.
create unique index faction_cheers_visitor_uniq
  on public.faction_cheers (visitor_hash);

create index faction_cheers_faction_idx
  on public.faction_cheers (faction);

alter table public.faction_cheers enable row level security;

-- Intentionally no policies: nothing reaches this table with the anon key.

revoke all on public.faction_cheers from anon, authenticated;
