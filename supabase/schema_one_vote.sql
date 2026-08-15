-- Campus Dogs — one name SUGGESTION and one name VOTE per user per dog.
-- Paste into Supabase → SQL Editor → Run. Safe to re-run. Dedupes existing rows
-- (keeping the earliest) before adding the constraints.

-- ---------------------------------------------------------------------------
-- 1) One suggestion per user per dog
-- ---------------------------------------------------------------------------
delete from public.name_suggestions s
using public.name_suggestions s2
where s.dog_id = s2.dog_id
  and s.suggested_by = s2.suggested_by
  and (s.created_at > s2.created_at
       or (s.created_at = s2.created_at and s.id > s2.id));

create unique index if not exists name_suggestions_dog_user_uidx
  on public.name_suggestions (dog_id, suggested_by);

-- ---------------------------------------------------------------------------
-- 2) One vote per user per dog (add dog_id to name_votes, backfill, dedupe)
-- ---------------------------------------------------------------------------
alter table public.name_votes
  add column if not exists dog_id uuid references public.dogs(id) on delete cascade;

update public.name_votes v
set dog_id = s.dog_id
from public.name_suggestions s
where v.suggestion_id = s.id and v.dog_id is null;

-- Any votes whose suggestion vanished (shouldn't happen) — drop them.
delete from public.name_votes where dog_id is null;

-- Keep only the earliest vote per (dog_id, user_id).
delete from public.name_votes v
using public.name_votes v2
where v.dog_id = v2.dog_id
  and v.user_id = v2.user_id
  and (v.created_at > v2.created_at
       or (v.created_at = v2.created_at and v.id > v2.id));

alter table public.name_votes alter column dog_id set not null;

create unique index if not exists name_votes_dog_user_uidx
  on public.name_votes (dog_id, user_id);
