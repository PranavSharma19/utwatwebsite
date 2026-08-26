-- ---------------------------------------------------------------------------
-- Stop deduplicating cheers by IP address.
--
-- faction_cheers.visitor_hash held SHA-256(ip | UTC day | salt) under a unique
-- index, so the poll allowed one vote per IP per day. Behind NAT that is not
-- one vote per person -- it is one vote per household, per phone sharing a
-- wifi network, per residence, per campus. The second person to vote from an
-- address had their cheer dropped on a 23505 that the Edge Function swallowed,
-- so the request still returned 200 with a tally and the page still themed
-- itself, congratulated them, and fired confetti. A vote that does not count
-- and does not say so is worse than one that is refused out loud.
--
-- The trade is deliberate and was asked for: a determined person can now vote
-- more than once. Turnstile still gates every submission, and the browser
-- still holds the one-vote-per-person rule for anyone not actively working
-- around it. For a between-two-schools poll that is the right balance.
--
-- Dropping the column rather than merely the index: with no uniqueness to
-- enforce it has no remaining purpose, and keeping an IP-derived value we do
-- not use would be storing personal data for nothing. The privacy policy now
-- states that the poll records no identifier at all, which this makes true.
-- ---------------------------------------------------------------------------
drop index if exists public.faction_cheers_visitor_uniq;

alter table public.faction_cheers
  drop column if exists visitor_hash;
