-- Campus Dogs — Phase 7: dog duplicate detection + red-flag danger alerts
-- Paste into Supabase → SQL Editor → Run. Safe to re-run.
--
-- Also run supabase/enable_bits_restriction.sql (the DB-level BITS email gate)
-- if it hasn't been applied yet — it is required, not optional, once Google
-- OAuth is enabled, since app-level checks can be bypassed via the API.

-- ---------------------------------------------------------------------------
-- Extensions: pgvector for photo embeddings, cube+earthdistance for the
-- campus-scale distance math (home ranges + proximity alerts).
-- ---------------------------------------------------------------------------
create extension if not exists vector with schema extensions;
create extension if not exists cube with schema extensions;
create extension if not exists earthdistance with schema extensions;

-- ---------------------------------------------------------------------------
-- photos.embedding — one vector per photo (a dog is matched against ALL of its
-- photos, so this lives on photos, not dogs). 512 dims = CLIP ViT-B/32.
-- ---------------------------------------------------------------------------
alter table public.photos
  add column if not exists embedding extensions.vector(512);

create index if not exists photos_embedding_idx
  on public.photos using hnsw (embedding extensions.vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- dog_home_range — each active dog's recent-sighting centroid. Recent = the
-- last 20 sightings, so a dog that shifts territory ages out old spots.
-- ---------------------------------------------------------------------------
create or replace view public.dog_home_range
with (security_invoker = true) as
select
  dog_id,
  avg(lat) as centroid_lat,
  avg(lng) as centroid_lng,
  count(*) as sighting_count,
  max(created_at) as last_seen_at
from (
  select *, row_number() over (partition by dog_id order by created_at desc) as rn
  from public.sightings
) recent
where rn <= 20
group by dog_id;

-- ---------------------------------------------------------------------------
-- find_similar_dogs — per-dog nearest-neighbor lookup for a fresh embedding,
-- with the distance from each dog's home range when a location is provided.
-- The visual/spatial blending happens in app code (easier to tune).
-- ---------------------------------------------------------------------------
create or replace function public.find_similar_dogs(
  query_embedding extensions.vector(512),
  query_lat double precision default null,
  query_lng double precision default null,
  match_limit int default 5
)
returns table (
  dog_id uuid,
  visual_distance double precision,
  home_range_meters double precision,
  photo_path text,
  top_name text
)
language sql
stable
as $$
  select
    p.dog_id,
    min(p.embedding operator(extensions.<=>) query_embedding)::double precision
      as visual_distance,
    case
      when query_lat is null or query_lng is null or hr.dog_id is null then null
      else extensions.earth_distance(
        extensions.ll_to_earth(hr.centroid_lat, hr.centroid_lng),
        extensions.ll_to_earth(query_lat, query_lng)
      )
    end as home_range_meters,
    dc.photo_path,
    dc.top_name
  from public.photos p
  join public.dogs d on d.id = p.dog_id and d.status = 'active'
  join public.dog_cards dc on dc.id = p.dog_id
  left join public.dog_home_range hr on hr.dog_id = p.dog_id
  where p.embedding is not null
  group by p.dog_id, hr.dog_id, hr.centroid_lat, hr.centroid_lng,
           dc.photo_path, dc.top_name
  order by visual_distance asc
  limit match_limit;
$$;

-- ---------------------------------------------------------------------------
-- possible_duplicate_pairs — unresolved likely-duplicate dog pairs for the
-- /nimbooz admin panel (pairs nobody caught at upload time).
-- ---------------------------------------------------------------------------
create or replace function public.possible_duplicate_pairs(
  max_distance double precision default 0.22,
  pair_limit int default 20
)
returns table (
  dog_a uuid,
  dog_b uuid,
  visual_distance double precision
)
language sql
stable
as $$
  select
    a.dog_id as dog_a,
    b.dog_id as dog_b,
    min(a.embedding operator(extensions.<=>) b.embedding)::double precision
      as visual_distance
  from public.photos a
  join public.photos b on a.dog_id < b.dog_id
  join public.dogs da on da.id = a.dog_id and da.status = 'active'
  join public.dogs db on db.id = b.dog_id and db.status = 'active'
  where a.embedding is not null and b.embedding is not null
  group by a.dog_id, b.dog_id
  having min(a.embedding operator(extensions.<=>) b.embedding) < max_distance
  order by visual_distance asc
  limit pair_limit;
$$;

-- ---------------------------------------------------------------------------
-- merge_dogs — fold `source_id` into `target_id` (admin-confirmed, never
-- automatic). Re-parents photos/sightings/votes, dedupes names by lower(name)
-- summing votes across both sides, then marks the source as merged.
-- ---------------------------------------------------------------------------
create or replace function public.merge_dogs(source_id uuid, target_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if source_id = target_id then
    raise exception 'Cannot merge a dog into itself.';
  end if;
  if not exists (select 1 from public.dogs where id = target_id and status = 'active') then
    raise exception 'Target dog is not active.';
  end if;

  -- Photos: the target keeps its own primary photo.
  update public.photos
    set dog_id = target_id, is_primary = false
    where dog_id = source_id;

  update public.sightings set dog_id = target_id where dog_id = source_id;

  -- Favourites: unique(user_id) means one row per user — safe to re-point.
  update public.dog_favourites set dog_id = target_id where dog_id = source_id;

  -- Personality votes: drop source rows that would collide on (dog,user,trait).
  delete from public.personality_votes pv
    where pv.dog_id = source_id
      and exists (select 1 from public.personality_votes t
                  where t.dog_id = target_id
                    and t.user_id = pv.user_id
                    and t.trait = pv.trait);
  update public.personality_votes set dog_id = target_id where dog_id = source_id;

  -- Safety votes: one per (dog,user) — a user who rated both keeps the target's.
  delete from public.safety_votes sv
    where sv.dog_id = source_id
      and exists (select 1 from public.safety_votes t
                  where t.dog_id = target_id and t.user_id = sv.user_id);
  update public.safety_votes set dog_id = target_id where dog_id = source_id;

  -- Names, step 1: for names present on BOTH dogs, move the source
  -- suggestion's votes onto the target's same-named suggestion (summing the
  -- two tallies), then drop the now-empty source suggestion.
  update public.name_votes v
    set suggestion_id = t.id, dog_id = target_id
    from public.name_suggestions s
    join public.name_suggestions t
      on t.dog_id = target_id and lower(t.name) = lower(s.name)
    where s.dog_id = source_id
      and v.suggestion_id = s.id
      -- a user with a vote on each dog keeps only their target-side vote
      and not exists (select 1 from public.name_votes tv
                      where tv.dog_id = target_id and tv.user_id = v.user_id);
  delete from public.name_suggestions s
    where s.dog_id = source_id
      and exists (select 1 from public.name_suggestions t
                  where t.dog_id = target_id and lower(t.name) = lower(s.name));

  -- Names, step 2: a user may only suggest one name per dog — drop source
  -- suggestions from users who already suggested on the target (their votes
  -- cascade away with the row).
  delete from public.name_suggestions s
    where s.dog_id = source_id
      and exists (select 1 from public.name_suggestions t
                  where t.dog_id = target_id and t.suggested_by = s.suggested_by);

  -- Names, step 3: votes that would give a user two votes on the target dog
  -- are dropped (target side wins), then everything left moves across.
  delete from public.name_votes v
    where v.dog_id = source_id
      and exists (select 1 from public.name_votes t
                  where t.dog_id = target_id and t.user_id = v.user_id);
  update public.name_votes set dog_id = target_id where dog_id = source_id;
  update public.name_suggestions set dog_id = target_id where dog_id = source_id;

  update public.dogs
    set status = 'merged', merged_into = target_id
    where id = source_id;
end;
$$;

-- Admin-only: merges are invoked with the service-role key from /nimbooz.
revoke execute on function public.merge_dogs(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Red flags — absolute, campus-wide danger status (not a majority vote).
-- ---------------------------------------------------------------------------
alter table public.dogs
  add column if not exists red_flagged boolean not null default false,
  add column if not exists red_flagged_at timestamptz,
  add column if not exists red_flagged_by uuid references public.profiles(id), -- null = auto
  -- true once an admin has manually flagged/downgraded — /nimbooz uses a
  -- password gate (no Supabase session), so this, not red_flagged_by, is the
  -- reliable "a human reviewed this" marker.
  add column if not exists red_flag_reviewed boolean not null default false;

-- Auto-flag once 3 distinct users have voted 'bites'. A trigger (not app
-- code) so no future write path can skip it. Deliberately auto — a false
-- negative here risks someone getting bitten; admins can downgrade false
-- positives in /nimbooz. Once a human has reviewed the flag, the machine
-- stops overriding their call.
create or replace function public.auto_red_flag()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  bite_count int;
begin
  -- safety_votes is unique on (dog_id, user_id), so count(*) = distinct users.
  select count(*) into bite_count
    from public.safety_votes
    where dog_id = new.dog_id and level = 'bites';
  if bite_count >= 3 then
    update public.dogs
      set red_flagged = true, red_flagged_at = now()
      where id = new.dog_id
        and red_flagged = false
        and not red_flag_reviewed;
  end if;
  return new;
end;
$$;

drop trigger if exists auto_red_flag_trg on public.safety_votes;
create trigger auto_red_flag_trg
  after insert or update on public.safety_votes
  for each row execute function public.auto_red_flag();

-- dog_cards gains red_flagged so the home grid can show the 🚩 badge.
-- (create or replace: new column is appended, existing columns unchanged.)
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
  (select count(*) from public.name_suggestions s where s.dog_id = d.id) as name_count,
  d.red_flagged
from public.dogs d
where d.status = 'active';

-- ---------------------------------------------------------------------------
-- nearby_danger_alerts — "am I near a recent sighting of a red-flagged dog?"
-- Stateless: coordinates are checked live and never stored. Returns the most
-- recent qualifying sighting per flagged dog.
-- ---------------------------------------------------------------------------
create or replace function public.nearby_danger_alerts(
  query_lat double precision,
  query_lng double precision,
  radius_meters double precision default 150,
  max_age_hours int default 48
)
returns table (
  dog_id uuid,
  sighting_id uuid,
  top_name text,
  lat double precision,
  lng double precision,
  distance_meters double precision,
  last_seen_at timestamptz
)
language sql
stable
as $$
  select distinct on (s.dog_id)
    s.dog_id,
    s.id as sighting_id,
    dc.top_name,
    s.lat,
    s.lng,
    extensions.earth_distance(
      extensions.ll_to_earth(s.lat, s.lng),
      extensions.ll_to_earth(query_lat, query_lng)
    ) as distance_meters,
    s.created_at as last_seen_at
  from public.sightings s
  join public.dogs d on d.id = s.dog_id and d.red_flagged and d.status = 'active'
  left join public.dog_cards dc on dc.id = s.dog_id
  where s.created_at > now() - make_interval(hours => max_age_hours)
    and extensions.earth_distance(
      extensions.ll_to_earth(s.lat, s.lng),
      extensions.ll_to_earth(query_lat, query_lng)
    ) < radius_meters
  order by s.dog_id, s.created_at desc;
$$;
