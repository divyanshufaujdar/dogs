-- Campus Dogs — MVP schema (Phases 2–4)
-- Paste the whole file into the Supabase Dashboard → SQL Editor and Run.
-- Safe to re-run: uses IF NOT EXISTS / CREATE OR REPLACE / ON CONFLICT throughout.
-- RLS is enabled on every table as required by the spec.

-- ---------------------------------------------------------------------------
-- profiles — public mirror of auth.users
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text,
  display_name text,
  is_admin     boolean not null default false,
  created_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles are readable by everyone" on public.profiles;
create policy "profiles are readable by everyone"
  on public.profiles for select using (true);

drop policy if exists "users insert their own profile" on public.profiles;
create policy "users insert their own profile"
  on public.profiles for insert with check (id = auth.uid());

drop policy if exists "users update their own profile" on public.profiles;
create policy "users update their own profile"
  on public.profiles for update using (id = auth.uid());

-- True when the current user is an admin. Defined after profiles exists
-- because a SQL function's body is validated against referenced tables at
-- creation time. SECURITY DEFINER so it reads profiles without tripping RLS.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- Auto-create a profile row when a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, split_part(new.email, '@', 1))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- dogs
-- ---------------------------------------------------------------------------
create table if not exists public.dogs (
  id          uuid primary key default gen_random_uuid(),
  created_by  uuid not null references public.profiles(id),
  status      text not null default 'active' check (status in ('active','hidden','merged')),
  merged_into uuid references public.dogs(id),
  created_at  timestamptz not null default now()
);

alter table public.dogs enable row level security;

drop policy if exists "active dogs are readable by everyone" on public.dogs;
create policy "active dogs are readable by everyone"
  on public.dogs for select using (status = 'active' or public.is_admin());

drop policy if exists "authenticated users create dogs" on public.dogs;
create policy "authenticated users create dogs"
  on public.dogs for insert to authenticated with check (created_by = auth.uid());

drop policy if exists "owners or admins update dogs" on public.dogs;
create policy "owners or admins update dogs"
  on public.dogs for update using (created_by = auth.uid() or public.is_admin());

drop policy if exists "owners or admins delete dogs" on public.dogs;
create policy "owners or admins delete dogs"
  on public.dogs for delete using (created_by = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- photos
-- ---------------------------------------------------------------------------
create table if not exists public.photos (
  id           uuid primary key default gen_random_uuid(),
  dog_id       uuid not null references public.dogs(id) on delete cascade,
  storage_path text not null,
  uploaded_by  uuid not null references public.profiles(id),
  is_primary   boolean not null default false,
  created_at   timestamptz not null default now()
);

create index if not exists photos_dog_id_idx on public.photos(dog_id);

alter table public.photos enable row level security;

drop policy if exists "photos of active dogs are readable" on public.photos;
create policy "photos of active dogs are readable"
  on public.photos for select using (
    exists (
      select 1 from public.dogs d
      where d.id = dog_id and (d.status = 'active' or public.is_admin())
    )
  );

drop policy if exists "authenticated users add photos" on public.photos;
create policy "authenticated users add photos"
  on public.photos for insert to authenticated with check (uploaded_by = auth.uid());

drop policy if exists "owners or admins update photos" on public.photos;
create policy "owners or admins update photos"
  on public.photos for update using (uploaded_by = auth.uid() or public.is_admin());

drop policy if exists "owners or admins delete photos" on public.photos;
create policy "owners or admins delete photos"
  on public.photos for delete using (uploaded_by = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- name_suggestions
-- ---------------------------------------------------------------------------
create table if not exists public.name_suggestions (
  id           uuid primary key default gen_random_uuid(),
  dog_id       uuid not null references public.dogs(id) on delete cascade,
  name         text not null check (char_length(trim(name)) between 1 and 40),
  suggested_by uuid not null references public.profiles(id),
  created_at   timestamptz not null default now()
);

-- No duplicate names per dog (case-insensitive).
create unique index if not exists name_suggestions_dog_lower_name_uidx
  on public.name_suggestions (dog_id, lower(name));

alter table public.name_suggestions enable row level security;

drop policy if exists "name suggestions of active dogs are readable" on public.name_suggestions;
create policy "name suggestions of active dogs are readable"
  on public.name_suggestions for select using (
    exists (
      select 1 from public.dogs d
      where d.id = dog_id and (d.status = 'active' or public.is_admin())
    )
  );

drop policy if exists "authenticated users suggest names" on public.name_suggestions;
create policy "authenticated users suggest names"
  on public.name_suggestions for insert to authenticated with check (suggested_by = auth.uid());

drop policy if exists "owners or admins delete suggestions" on public.name_suggestions;
create policy "owners or admins delete suggestions"
  on public.name_suggestions for delete using (suggested_by = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- name_votes — one vote per user per suggestion
-- ---------------------------------------------------------------------------
create table if not exists public.name_votes (
  id            uuid primary key default gen_random_uuid(),
  suggestion_id uuid not null references public.name_suggestions(id) on delete cascade,
  user_id       uuid not null references public.profiles(id),
  created_at    timestamptz not null default now(),
  unique (suggestion_id, user_id)
);

create index if not exists name_votes_suggestion_id_idx on public.name_votes(suggestion_id);

alter table public.name_votes enable row level security;

drop policy if exists "name votes are readable by everyone" on public.name_votes;
create policy "name votes are readable by everyone"
  on public.name_votes for select using (true);

drop policy if exists "authenticated users cast name votes" on public.name_votes;
create policy "authenticated users cast name votes"
  on public.name_votes for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "users remove their own name votes" on public.name_votes;
create policy "users remove their own name votes"
  on public.name_votes for delete using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Views (security_invoker so RLS of the querying user applies)
-- ---------------------------------------------------------------------------

-- Per-suggestion vote tallies.
create or replace view public.name_suggestion_counts
with (security_invoker = true) as
select
  s.id           as suggestion_id,
  s.dog_id,
  s.name,
  s.suggested_by,
  s.created_at,
  count(v.id)    as votes
from public.name_suggestions s
left join public.name_votes v on v.suggestion_id = s.id
group by s.id;

-- One row per active dog with everything the grid card needs.
create or replace view public.dog_cards
with (security_invoker = true) as
select
  d.id,
  d.created_at,
  d.created_by,
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
  (select count(*) from public.name_suggestions s where s.dog_id = d.id) as name_count
from public.dogs d
where d.status = 'active';

-- ---------------------------------------------------------------------------
-- Storage bucket for dog photos (public read; authenticated write)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('dog-photos', 'dog-photos', true)
on conflict (id) do nothing;

drop policy if exists "anyone can view dog photos" on storage.objects;
create policy "anyone can view dog photos"
  on storage.objects for select using (bucket_id = 'dog-photos');

drop policy if exists "authenticated can upload dog photos" on storage.objects;
create policy "authenticated can upload dog photos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'dog-photos');

drop policy if exists "uploaders can delete their dog photos" on storage.objects;
create policy "uploaders can delete their dog photos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'dog-photos' and owner = auth.uid());
