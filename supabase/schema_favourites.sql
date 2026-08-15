-- Campus Dogs — favourite-dog vote + leaderboard
-- Paste into Supabase → SQL Editor → Run. Safe to re-run.

-- One favourite dog per user (campus-wide popularity vote).
create table if not exists public.dog_favourites (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  dog_id     uuid not null references public.dogs(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id)
);

create index if not exists dog_favourites_dog_idx on public.dog_favourites(dog_id);

alter table public.dog_favourites enable row level security;

drop policy if exists "favourites are readable by everyone" on public.dog_favourites;
create policy "favourites are readable by everyone"
  on public.dog_favourites for select using (true);

drop policy if exists "users set their favourite" on public.dog_favourites;
create policy "users set their favourite"
  on public.dog_favourites for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "users change their favourite" on public.dog_favourites;
create policy "users change their favourite"
  on public.dog_favourites for update using (user_id = auth.uid());

drop policy if exists "users clear their favourite" on public.dog_favourites;
create policy "users clear their favourite"
  on public.dog_favourites for delete using (user_id = auth.uid());

-- Per-dog favourite tallies.
create or replace view public.dog_favourite_counts
with (security_invoker = true) as
select dog_id, count(*) as favourites
from public.dog_favourites
group by dog_id;

-- Leaderboard rows: active dogs with photo, top name, favourite + name counts.
create or replace view public.dog_leaderboard
with (security_invoker = true) as
select
  d.id,
  d.created_at,
  (
    select p.storage_path from public.photos p
    where p.dog_id = d.id
    order by p.is_primary desc, p.created_at asc
    limit 1
  ) as photo_path,
  (
    select c.name from public.name_suggestion_counts c
    where c.dog_id = d.id
    order by c.votes desc, c.created_at asc
    limit 1
  ) as top_name,
  coalesce(
    (select count(*) from public.dog_favourites f where f.dog_id = d.id), 0
  ) as favourites
from public.dogs d
where d.status = 'active';
