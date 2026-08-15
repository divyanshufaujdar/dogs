-- Campus Dogs — Phase 5 (sightings) + Phase 6 (temperament) schema
-- Paste into Supabase → SQL Editor → Run. Safe to re-run.

-- ---------------------------------------------------------------------------
-- sightings — append-only log of where a dog was seen
-- ---------------------------------------------------------------------------
create table if not exists public.sightings (
  id         uuid primary key default gen_random_uuid(),
  dog_id     uuid not null references public.dogs(id) on delete cascade,
  lat        double precision not null,
  lng        double precision not null,
  user_id    uuid not null references public.profiles(id),
  note       text,
  created_at timestamptz not null default now()
);

create index if not exists sightings_dog_id_created_idx
  on public.sightings(dog_id, created_at desc);

alter table public.sightings enable row level security;

drop policy if exists "sightings of active dogs are readable" on public.sightings;
create policy "sightings of active dogs are readable"
  on public.sightings for select using (
    exists (select 1 from public.dogs d
            where d.id = dog_id and (d.status = 'active' or public.is_admin()))
  );

drop policy if exists "authenticated users add sightings" on public.sightings;
create policy "authenticated users add sightings"
  on public.sightings for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "owners or admins delete sightings" on public.sightings;
create policy "owners or admins delete sightings"
  on public.sightings for delete using (user_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- personality_votes — many traits per user per dog
-- ---------------------------------------------------------------------------
create table if not exists public.personality_votes (
  id         uuid primary key default gen_random_uuid(),
  dog_id     uuid not null references public.dogs(id) on delete cascade,
  user_id    uuid not null references public.profiles(id),
  trait      text not null,
  created_at timestamptz not null default now(),
  unique (dog_id, user_id, trait)
);

create index if not exists personality_votes_dog_idx on public.personality_votes(dog_id);

alter table public.personality_votes enable row level security;

drop policy if exists "personality votes readable" on public.personality_votes;
create policy "personality votes readable"
  on public.personality_votes for select using (true);

drop policy if exists "authenticated cast personality votes" on public.personality_votes;
create policy "authenticated cast personality votes"
  on public.personality_votes for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "users remove their personality votes" on public.personality_votes;
create policy "users remove their personality votes"
  on public.personality_votes for delete using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- safety_votes — one level per user per dog
-- ---------------------------------------------------------------------------
create table if not exists public.safety_votes (
  id         uuid primary key default gen_random_uuid(),
  dog_id     uuid not null references public.dogs(id) on delete cascade,
  user_id    uuid not null references public.profiles(id),
  level      text not null check (level in ('friendly','chases','bites')),
  created_at timestamptz not null default now(),
  unique (dog_id, user_id)
);

create index if not exists safety_votes_dog_idx on public.safety_votes(dog_id);

alter table public.safety_votes enable row level security;

drop policy if exists "safety votes readable" on public.safety_votes;
create policy "safety votes readable"
  on public.safety_votes for select using (true);

drop policy if exists "authenticated cast safety votes" on public.safety_votes;
create policy "authenticated cast safety votes"
  on public.safety_votes for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "users update their safety vote" on public.safety_votes;
create policy "users update their safety vote"
  on public.safety_votes for update using (user_id = auth.uid());

drop policy if exists "users remove their safety vote" on public.safety_votes;
create policy "users remove their safety vote"
  on public.safety_votes for delete using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Aggregate views (security_invoker so RLS applies)
-- ---------------------------------------------------------------------------
create or replace view public.personality_trait_counts
with (security_invoker = true) as
select dog_id, trait, count(*) as votes
from public.personality_votes
group by dog_id, trait;

create or replace view public.safety_level_counts
with (security_invoker = true) as
select dog_id, level, count(*) as votes
from public.safety_votes
group by dog_id, level;

-- Most-recent sighting per dog (the "last found" spot).
create or replace view public.dog_latest_sighting
with (security_invoker = true) as
select distinct on (dog_id)
  dog_id, lat, lng, note, created_at
from public.sightings
order by dog_id, created_at desc;
