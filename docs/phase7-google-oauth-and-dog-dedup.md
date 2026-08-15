# Phase 7 design doc: Google OAuth, dog duplicate detection, danger alerts

This covers the open Phase 7 items from the README build spec —
**"BITS-only signups"** and **"duplicate merge"** — plus two extensions on
top of the duplicate-detection idea: using **location, not just looks**, to
tell apart visually similar dogs, and a **red-flag rating for dangerous
dogs with proximity alerts** built on the same sightings data.

Status: **implemented** (August 2026) — see the Phase 7 changelog entry in the
README. Remaining manual steps: run `supabase/schema_phase7.sql` +
`supabase/enable_bits_restriction.sql` in the SQL Editor, and set up the
Google OAuth credentials (README → "Google OAuth setup"). Section 3's push
notification v2 is deliberately not built, per the rollout guidance below.

---

## 1. Google OAuth for BITS Pilani emails only

### Where things stand today

Login is **not** OAuth. `src/app/login/actions.ts` derives a deterministic
password from the email (`sha256(email + secret)`), and silently creates a
pre-confirmed Supabase user via the Admin API on first visit
(`createAdminClient().auth.admin.createUser`). The BITS-domain check
(`src/lib/bits.ts`, `checkSignupEmail`) only runs in that server action —
it's app-level, not DB-level. `RESTRICT_TO_BITS` is already `true`, and
`supabase/enable_bits_restriction.sql` (a Postgres trigger on
`auth.users`) exists but is a **manual, unrun** migration — it's not clear
if it's been applied to the live project.

This works, but it's a password scheme wearing a passwordless costume: it
depends on a shared secret (`BITS_AUTH_SECRET`) never leaking, and it does
nothing to verify the email is real — anyone who knows (or guesses) a
BITS-shaped address can sign in as it. Real Google OAuth fixes that: it
proves the person controls that Google account, and gives us a verified
`email_verified` claim.

### Target flow

1. **Supabase Auth → Providers → Google.** Create OAuth credentials in
   Google Cloud Console (OAuth consent screen + Web application client),
   set the authorized redirect URI to the Supabase project's callback
   (`https://<project-ref>.supabase.co/auth/v1/callback`), and paste the
   Client ID/Secret into Supabase.
2. **Login page** (`src/app/login/page.tsx`): replace the email-only form
   with a "Continue with Google" button that calls
   `supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: "<origin>/auth/callback", queryParams: { hd: "bits-pilani.ac.in" } } })`.
   The `hd` (hosted domain) param is a UX hint to Google's account chooser
   — it pre-filters to that Workspace domain if BITS's Google Workspace is
   configured with it as the primary domain. **It is not enforcement** —
   Google does not reliably restrict to the domain for pass-through
   subdomains (`pilani.bits-pilani.ac.in` etc. aren't the same as
   `hd=bits-pilani.ac.in`), and a user can still pick a different Google
   account in the same browser. Treat it as a nicety, not a gate.
3. **`src/app/auth/callback/route.ts` becomes the real gate.** After
   `exchangeCodeForSession`, read the session's user email and run it
   through `isBitsEmail()` (already in `src/lib/bits.ts`, reused as-is —
   the multi-campus domain list already covers pilani/goa/hyderabad/dubai).
   If it fails, immediately `supabase.auth.signOut()` and redirect to
   `/login?error=domain`, with a message explaining only BITS emails are
   allowed. Login page reads that query param to show the error (same
   pattern the callback route already uses for `?error=auth`).
4. **DB-level enforcement stays required, not optional.** Actually run
   `supabase/enable_bits_restriction.sql` against the live project (confirm
   with whoever owns the Supabase project — it's destructive to any
   existing non-BITS test accounts, since new inserts from those domains
   will start failing). This is the layer that matters: app-level checks
   can be bypassed by anyone hitting Supabase's REST/GoTrue API directly,
   the DB trigger can't be.
5. **Retire the password-derivation login**, or keep it behind a feature
   flag for local dev only (Google OAuth requires a real Google Cloud
   project + redirect URI, which is annoying for `localhost` — a "dev
   login" fallback gated by `NODE_ENV !== "production"` is reasonable if
   the team wants to keep testing without Google credentials). Don't ship
   both as user-facing options in production — one gate is easier to
   reason about than two.
6. **Migration for existing users:** anyone who already has an account via
   the current password scheme keeps their `profiles` row (keyed by
   `auth.users.id`); Google sign-in creates a *new* `auth.users` row with a
   different id even for the same email, since it's a different provider
   identity. That means existing users would appear to "lose" their dogs/
   votes/favourites unless profiles are matched by email and merged, or the
   switch happens before the app has real user data. Worth deciding
   explicitly: hard cutover (acceptable pre-launch, wipes test data) vs. an
   email-based account-linking step (more work, only worth it if there's
   real data to preserve).

### Why not rely on `hd` alone

BITS Pilani's Google Workspace setup (if any) isn't something this repo can
verify — and even a correctly configured `hd` restricts the Google
*account picker*, not the actual token issuance in all configurations.
Treat OAuth as "prove they own a Google account with this email"; treat the
domain allow-list (app + DB trigger) as the actual authorization boundary.
Same reasoning `src/lib/bits.ts`'s comments already lay out for the current
scheme — it carries over unchanged.

### Files touched

- `src/app/login/page.tsx` — swap form for Google button.
- `src/app/login/actions.ts` — remove or dev-flag the password scheme.
- `src/app/auth/callback/route.ts` — add post-exchange domain check + signout-on-reject.
- `supabase/enable_bits_restriction.sql` — actually run it.
- Supabase dashboard — enable Google provider, add credentials.
- Google Cloud Console — OAuth consent screen + credentials (someone with a
  Google account needs to own this; consider a project-shared account
  rather than one person's personal Google Cloud project).

---

## 2. Dog duplicate detection ("dog recognition")

### The problem

Multiple students will photograph the same campus dog independently and
each hit "Add to the pack," creating N `dogs` rows for one real dog. The
schema already half-anticipates this — `dogs.status` has a `'merged'`
value and `dogs.merged_into` (`src/lib/types.ts`) — but nothing populates
or reads them yet: no merge UI, no action, no query filters out merged
dogs from `dog_cards`. That scaffolding is the right shape to build on.

### Recommended approach: embeddings + nearest-neighbor search, human-confirmed

Don't try to auto-merge. Auto-merging two dogs is a wrong-and-hard-to-undo
action — it fuses sightings, name votes, and favourites from two possibly
different animals into one page. The recognition system's job is to
**surface likely duplicates and let a person decide**, not to make the
merge decision itself. Two places for a person to decide:

- **At upload time** (soft prompt): after picking a photo in
  `AddDogForm`, before submitting, show "this looks like it might already
  be [Bruno] — is this the same dog?" with a thumbnail, and a choice
  between "Yes, add this photo to Bruno" (adds a `photos` row to the
  existing dog) or "No, it's a different dog" (proceeds to `createDog` as
  today). This is the highest-leverage moment — it prevents the duplicate
  from ever being created, and the uploader is the one person who's
  actually looking at both photos side by side.
- **In `/nimbooz`** (admin merge): a "possible duplicates" panel listing
  dog pairs above a similarity threshold that nobody resolved at upload
  time (e.g. the uploader said "no" but was wrong, or two dogs were
  created minutes apart before either had a chance to see the other). An
  admin action sets the newer dog's `status = 'merged'` and
  `merged_into = <canonical id>`, and re-points its `photos` rows to the
  canonical `dog_id` (so the survivor gets every photo). `dog_cards` and
  any other query need a `status = 'active'` filter, which they already
  have.

### What "recognizing a dog face" actually means here

There isn't a production-ready, off-the-shelf "dog face recognition" model
the way there is for humans (huge labeled datasets, decades of research).
For a single-campus population of maybe 30–150 dogs, don't aim for a
literal facial-landmark recognizer — aim for **visual similarity search**:
turn each photo into an embedding vector, and treat "close in embedding
space" as "possibly the same dog." Two viable options, in order of how
much they buy for the effort:

1. **General-purpose image embedding model** (recommended to start).
   Something like a small CLIP variant or MobileNet feature vector. Not
   trained specifically on dogs, but for telling apart ~50 distinct
   animals by coat color/pattern/build/ear shape, a strong general
   embedding is usually good enough, and it's something you can run
   without training anything yourself.
2. **Animal re-identification model** (e.g. approaches like MegaDescriptor,
   trained via metric learning on wildlife/pet re-ID datasets). Better
   accuracy, particularly for visually similar dogs (same breed/color),
   but heavier to integrate and mostly distributed as Python/PyTorch
   research code — meaningfully more infra work for a campus project at
   this scale.

Start with (1). It's the difference between "ships this semester" and
"someone's thesis." Revisit (2) only if false-negatives (same dog, not
flagged) turn out to be a real problem in practice.

Optionally, run a lightweight dog detector/cropper first (e.g. a small
YOLO model) to crop to the dog's bounding box before embedding — reduces
noise from background/other people in frame. Worth adding once the basic
pipeline works, not a blocker for v1.

### The "dataset" is just the photos already uploaded — nothing gets trained

Worth being precise about this, since "recognition" and "dataset" both
imply a training step that isn't actually there. The embedding model
(CLIP or similar) is **pretrained once, elsewhere, on generic images, and
never touched again** — it ships as a fixed, frozen model file. Nothing in
this app trains or fine-tunes it. What grows over time is the *index* new
uploads get compared against: every photo anyone uploads gets embedded and
its vector saved to `photos.embedding`, and that accumulating table — not
a curated dataset, just every photo that's ever been uploaded — is the
entire reference set a new photo gets searched against. It's retrieval
(nearest-neighbor search), not classification.

Two consequences worth designing around:

- **A dog with 1 photo is harder to match than one with 10.** More angles
  of the same dog means a new upload is more likely to land close to *one*
  of its existing vectors, even if it's not close to all of them. A
  brand-new dog with a single photo is the weakest case — expect it to
  produce fewer/weaker candidate matches for anyone photographing it next,
  purely because there's less to compare against yet, not because
  anything's broken.
- **No retraining pipeline, ever, regardless of how big the photo library
  gets.** Adding more photos is just adding more rows to search — it never
  requires touching or redeploying the model. That's most of why this stays
  cheap to run indefinitely.

### Where to run inference

This is the actual design decision the user asked about, and both sides
are genuinely viable at this project's scale — the difference is what each
one buys you, not whether it works at all.

| | Client-side (browser) | Server-side |
|---|---|---|
| **Authoritative** | No — a user (or a bug) can skip it; can't be trusted for dedup logic that other users' data depends on | Yes — every upload goes through the same code path regardless of client |
| **Model/runtime** | Ships a model bundle to every visitor, several MB, downloaded and run on students' phones over campus wifi/data | Runs once per upload, on infra you control |
| **Device variance** | Low-end Android phones (likely, for a student body) will be slow/inconsistent running a CNN in WASM/WebGL; battery cost | Consistent latency regardless of uploader's device |
| **Iteration** | Changing the model/threshold means a redeploy of client code, and old cached bundles until users reload | Change the model or threshold once, applies to every upload retroactively (can even re-embed old photos) |
| **This app's constraints** | — | Already on Vercel (serverless Node) + Supabase — no new hosting to stand up if the model is small enough |

Recommendation stays: **server-side is the authoritative check; client-side
is an optional instant-feedback layer on top of it, never a replacement
for it.**

#### Running it client-side — viable as a UX layer, not as the source of truth

Genuinely doable, and worth naming concretely rather than hand-waving:
[transformers.js](https://github.com/xenova/transformers.js) can run a
small CLIP model (e.g. `Xenova/clip-vit-base-patch32`, quantized) fully
in-browser via ONNX Runtime Web, no server round-trip needed to get the
vector. First load downloads the model (tens of MB); the browser caches it
after that, so it's a one-time cost per device, not per upload.

Comparison can happen client-side too, and at this project's scale it's
trivial: fetch the existing dogs' embeddings as a plain JSON array (a few
hundred vectors of 512 floats each — a few hundred KB) and brute-force
loop computing cosine similarity in JS. No index structure (HNSW, pgvector,
etc.) is needed client-side — that only starts to matter in the thousands-
to-millions-of-vectors range, nowhere near a single campus's dog
population. Concretely: user picks a photo → `transformers.js` embeds it →
a JS loop compares it against the fetched vector list → "this might be
Bruno" shows up before the photo has even finished uploading.

What this doesn't solve: it's skippable (dev tools, a client bug, a user
who denies whatever triggers it) and it trusts whatever copy of the
reference set the browser fetched. Fine for a fast prompt; not sufficient
on its own if the actual goal is reliably preventing duplicate `dogs` rows
from ever existing — that guarantee still needs the same computation to
happen server-side, at minimum as a background check that can flag missed
duplicates for `/nimbooz` review even when the client-side prompt got
skipped or dismissed.

#### Running it server-side — concretely viable, here's how

Also genuinely viable, and the piece worth being specific about is *where*
exactly it runs, since "server-side" isn't one thing on this stack:

- **Use a regular Vercel Node.js serverless function, not Vercel's Edge
  Runtime.** Edge Runtime is a V8 isolate with no native Node APIs and a
  bundle limit of a few MB — nowhere near enough for an ONNX model file.
  Standard Node functions allow much larger bundles (up to roughly 250MB
  unzipped per deployment) and native dependencies like `onnxruntime-node`.
- **Pick a quantized model, not a full-precision one.** A full CLIP model
  is ~350MB; an int8-quantized visual encoder (or a MobileNet-class
  extractor) lands around 10–50MB — comfortably inside the bundle budget.
  `onnxruntime-node`'s own native binary adds some weight on top of the
  model file itself — check the actual deployed function size after adding
  it; that's more likely to hit a limit than the model.
- **Cold starts, not raw compute, are the real cost.** Inference on one
  image with a lean model is sub-second once the model's loaded; loading
  it from cold is the slower part (roughly 0.5–2s). For a low-traffic
  student project most invocations will be cold, since Vercel spins idle
  functions down — fine for "upload a photo, wait a beat, see a possible-
  duplicate prompt," not fine if instant response was the assumption.
  Keep the loaded model in a module-level variable outside the handler so
  warm invocations within a burst of traffic reuse it.
- **Alternative: Supabase Edge Function** (Deno) using `onnxruntime-web`'s
  WASM backend instead of the native Node one. Keeps the code next to the
  DB it's writing to, no new hosting account. WASM inference runs somewhat
  slower than native but still sub-2s for one image; Supabase's own
  memory/CPU ceilings for Edge Functions are worth checking against
  current docs before committing, since they've moved over time.
- **Fallback if self-hosting the model gets annoying:** call a hosted
  inference endpoint (e.g. HuggingFace's Inference API, which has a free
  tier for small models) over plain HTTP from the server action instead of
  bundling the model at all. Trades a small per-call latency and a new
  external dependency for zero bundle-size/cold-start engineering. Worth
  trying the self-hosted-in-function route first, since it fits well within
  either platform's limits — reach for a hosted API only if that turns out
  worse in practice than expected.

Don't stand up a separate Python microservice (FastAPI/Flask + PyTorch)
unless the team already has somewhere free to run it continuously — that's
real infra to keep alive (cold starts, uptime, a second deploy pipeline)
for a project currently running on just Vercel + Supabase, and neither of
the two options above requires it.

### Location as a second matching signal

Looks alone will misfire in exactly the way you'd expect on a campus with
multiple black dogs, multiple brown dogs, etc.: two dogs that resemble each
other in a generic embedding (similar coat color, similar build) but that
students would never actually confuse, because everyone who's been on
campus a week knows "the library dog" is a different animal from "the
girls' hostel dog." That local knowledge is exactly what's missing from a
pure visual-similarity score — and campus dogs are territorial enough that
*where* a photo was taken is almost as identifying as what the dog looks
like. So location should be a second signal in the matching score, not an
afterthought: a new black-dog photo near the girls' hostel should barely
raise the "might be the lib dog" candidate at all, even if the raw
embedding distance looks close, because the lib dog is essentially never
seen there.

**What "where a dog is usually seen" means concretely:** each active dog
already accumulates a location history via `sightings` (dropped pins on
the dog's page) — that's a home range, we just haven't used it yet. Define
each dog's home range as the centroid of its last N sightings (say, the
most recent 20, or all within the last 60 days, whichever's fewer — recent
sightings should count for more than a stale one from last semester, since
dogs do shift territory) plus a spread/radius. A new photo's location is
then scored by how far it falls from that centroid, with the score decaying
smoothly with distance rather than a hard cutoff (dogs do wander — the lib
dog can absolutely be seen 80m from the library sometimes; the point is a
sighting 600m away at the girls' hostel should count against the match).

**One real gap this exposes:** `createDog` doesn't currently capture
*any* location — only the separate "log a sighting" flow on the dog's page
does (`SightingMapInner` / `addSighting`). For location to help at the
moment that matters most (someone about to create what might be a
duplicate), the upload flow itself needs a location. Concretely:
`AddDogForm` should request the browser's geolocation
(`navigator.geolocation.getCurrentPosition`) at upload time, same
permission model the sightings map already relies on, and either (a) treat
it as the dog's first `sightings` row on creation (no schema change — a
new dog already gets photo + name rows on creation, this just adds one
more insert), or (b) fall back gracefully with visual-only matching if the
user declines the location permission (don't block dog creation on it —
it's a matching signal, not a requirement).

**Combining the two signals:** don't hard-filter on location (a genuinely
moved-territory dog would become unmatchable), and don't hard-filter on
embedding distance either — blend them into one ranking score, computed
in the same query that already does the pgvector nearest-neighbor lookup:

```sql
create extension if not exists cube;
create extension if not exists earthdistance;

-- Each active dog's recent-sighting centroid ("home range").
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
```

```sql
-- Combined visual + spatial candidate score for a new photo at ($lat, $lng)
-- with embedding $vec. Distance in meters via earthdistance.
select
  p.dog_id,
  min(p.embedding <=> $vec)                                   as visual_distance,
  earth_distance(
    ll_to_earth(hr.centroid_lat, hr.centroid_lng),
    ll_to_earth($lat, $lng)
  )                                                            as home_range_meters
from public.photos p
join public.dogs d on d.id = p.dog_id and d.status = 'active'
left join public.dog_home_range hr on hr.dog_id = p.dog_id
group by p.dog_id, hr.centroid_lat, hr.centroid_lng
order by visual_distance asc
limit 10;
```

Do the distance-to-score blending in application code (`findPossibleDuplicates`,
below), not raw SQL, since it's easier to tune two weighted terms and a
decay curve in TypeScript than in a single SQL expression:
`score = visualSimilarity * spatialWeight(home_range_meters)`, where
`spatialWeight` is close to 1 for a home range within ~50–100m, decays
through the ~150–300m range, and floors out (but doesn't zero out — a dog
that moved territory is rare but real) somewhere past that. Campus-scale
distances are small enough that this doesn't need anything fancier than
`earthdistance`'s flat-earth approximation (same reasoning `isInCampus()`
in `src/lib/constants.ts` already uses a plain bounding box for — no need
for PostGIS on a single small campus).

A dog with no sighting history yet (just created, no `dog_home_range` row)
should fall back to visual-only scoring — don't let a missing location
history suppress a real match.

### Data model changes

```sql
create extension if not exists vector;

alter table public.photos
  add column embedding vector(512); -- dimension depends on chosen model

create index photos_embedding_idx
  on public.photos using hnsw (embedding vector_cosine_ops);
```

(plus the `cube`/`earthdistance` extensions and `dog_home_range` view from
the section above)

- Embedding stored per-`photos` row (not per-`dogs`), since a dog
  accumulates multiple photos over time and you want to match against all
  of them, not just the primary one.
- Base visual-only query for a freshly-computed embedding `$1` (what
  `dog_home_range` joins onto, per the section above):
  ```sql
  select dog_id, min(embedding <=> $1) as distance
  from public.photos
  where dog_id in (select id from public.dogs where status = 'active')
  group by dog_id
  order by distance asc
  limit 5;
  ```
  (cosine distance via pgvector's `<=>` operator; `min` per dog picks each
  dog's closest photo, since any one matching photo is enough to flag it).
- A distance-to-similarity threshold needs empirical tuning — there's no
  correct number a priori. Plan to hand-build a small labeled set (e.g. 15
  pairs of "definitely the same dog, different photos" and 15 "definitely
  different dogs") from real campus dog photos once the pipeline runs, and
  pick a threshold that clears that set, biased toward fewer false
  positives (a missed duplicate costs an admin a manual merge later; a
  false-positive prompt annoys the uploader immediately). Once location is
  in the mix, tune the two together — the labeled set should include a few
  "similar-looking but different territory" pairs specifically, since
  that's the failure mode location is meant to fix.

### New server actions (`src/app/dogs/actions.ts`)

- `findPossibleDuplicates(embedding: number[], location?: { lat: number; lng: number }): Promise<{ dogId, score, visualDistance, homeRangeMeters, photoPath, topName }[]>`
  — called after the client uploads to storage but before `createDog`
  commits, so `AddDogForm` can show the confirm-or-new prompt. Runs the
  pgvector query, joins `dog_home_range`, blends the two into `score` as
  described above. `location` is optional — omitted, it degrades to
  visual-only ranking.
- `addPhotoToExistingDog(dogId, storagePath, location?)` — the "yes, it's
  this dog" path; inserts into `photos` with the new embedding, skips
  creating a new `dogs` row, and (if location was captured) logs it as a
  `sightings` row too so the dog's home range stays current.
- `mergeDogs(sourceId, targetId)` (admin-only, called from `/nimbooz`) —
  sets `sourceId`'s `status = 'merged'`, `merged_into = targetId`,
  re-parents its `photos`/`sightings`/`personality_votes`/`safety_votes`
  rows to `targetId` (name suggestions are trickier — same name suggested
  on both dogs would collide with the existing unique index on
  `(dog_id, lower(name))`; dedupe by name before re-parenting, summing
  votes for names that exist on both sides).

### Suggested rollout order

1. Ship the schema change + embedding computation on upload (write-only:
   just start populating `photos.embedding`, no UI yet). Cheap, reversible,
   and lets you accumulate embeddings for dogs already in the system before
   any matching logic depends on them existing.
2. Add the nearest-neighbor query + upload-time confirm prompt, visual-only
   (no location yet) — get the core flow working first.
3. Add geolocation capture to `AddDogForm`, the `dog_home_range` view, and
   blend location into `findPossibleDuplicates`'s scoring. Do this as a
   distinct follow-up rather than bundling with step 2 — it's much easier
   to tell whether the spatial signal is actually helping (vs. just adding
   noise) when you can compare against the visual-only baseline from step 2.
4. Add the `/nimbooz` possible-duplicates panel + `mergeDogs` action, using
   real data from steps 1–3 to see how noisy the matches are before
   building a polished merge UI.

### Why this over the alternatives

- **No embeddings, admin eyeballs every upload:** what `/nimbooz` already
  half does (shows every upload in a grid). Doesn't scale much past the
  current handful of dogs, but is worth keeping as the fallback — the
  embedding system is there to reduce how often an admin has to do this,
  not replace it entirely on day one.
- **Perceptual hashing (pHash) instead of ML embeddings:** far cheaper to
  run (no model at all), but only catches near-identical images (crops,
  filters, compression) — it won't recognize the same dog from a different
  angle or lighting, which is the actual case that matters here (different
  people photographing the same dog on different days). Not sufficient on
  its own.

---

## 3. Red-flag rating for dangerous dogs + proximity alerts

### What exists today vs. what this adds

`safety_votes` (Phase 6) already lets any user rate a dog
friendly/chases/bites, and `SafetyControl.tsx` shows a red banner on the
dog's own page when **bites** is the crowd's majority vote. Two things
that's missing: it's a *relative* signal (majority among however many
people voted — 2 "bites" out of 3 votes counts the same as 20 out of 30),
and it only surfaces on that one dog's page — you have to already be
looking at the right dog to see the warning. "Red flag" should be an
*absolute*, campus-wide-visible status: a small, fixed number of
independent bite reports is worth taking seriously regardless of how many
other votes exist, and it should be visible on the grid and the map, not
just the dog's own page. Then, since sightings already carry a location,
the natural extension is warning people who are physically near a recent
sighting of a red-flagged dog — not just people who happen to click into
its page.

### Red-flag status: absolute threshold, not majority

Add to `dogs`:

```sql
alter table public.dogs
  add column red_flagged boolean not null default false,
  add column red_flagged_at timestamptz,
  add column red_flagged_by uuid references public.profiles(id); -- null = auto
```

Auto-set `red_flagged = true` (via a trigger on `safety_votes` insert, or a
check inside `setSafety` in `src/app/dogs/actions.ts` — the trigger is
safer since it can't be bypassed by a future code path that writes
`safety_votes` directly) once a dog crosses a fixed threshold of **distinct
users** voting `bites` — e.g. 3. Distinct users specifically, since
`safety_votes` already has a `unique (dog_id, user_id)` constraint, so
`count(*)` in `safety_level_counts` is already a distinct-user count, not
just a raw vote count — no extra work needed there.

This is the one place in the whole doc where auto-action beats
human-confirm-first, deliberately reversing the stance taken on merges
above: for duplicate dogs, a false positive costs someone an annoying
prompt; for a dangerous dog, a false *negative* (a genuinely dangerous dog
not flagged because nobody's gotten around to reviewing it) risks someone
getting bitten before a human ever looks at it. So flag immediately and
automatically on the threshold, and let admins **downgrade** false
positives in `/nimbooz` (e.g. someone brigading votes on a harmless dog) —
correcting a wrongly-flagged dog is a much smaller cost than the reverse.
`red_flagged_by` stays `null` for auto-flags and gets set for both manual
admin flags and manual admin downgrades, so `/nimbooz` can show which
dogs were machine-flagged vs. human-reviewed.

### Making it visible outside the dog's own page

- `dog_cards` view (powers the home grid) needs a `red_flagged` column
  added to its select list; `DogCard.tsx` shows a fixed badge (e.g. a red
  🚩 corner ribbon) when true — currently the grid shows only photo + top
  name, nothing about safety at all.
- `SightingMapInner` (the campus map) colors a red-flagged dog's pins
  distinctly from ordinary sighting pins — right now all pins look the
  same regardless of the dog's safety record, so the map can't currently
  answer "where on campus should I be careful," which is the actual point
  of adding this.
- Dog page: the existing `SafetyControl` "bites" banner becomes the
  officially-flagged banner instead of a crowd-majority-based one — the
  data source changes from "is `bites` the majority?" to
  "`dogs.red_flagged`" (both still shown; keep the per-vote breakdown, but
  the loud banner should key off the authoritative flag, not majority
  math that flips with each new vote).

### Proximity alerts

The ask is: someone walking near where a red-flagged dog was recently
seen gets warned before they get close, not after clicking into its page.
This needs the user's live location, which the app doesn't currently read
anywhere — geolocation today only appears where a user explicitly drops a
sighting pin on a map they're already looking at (`SightingMapInner`).
Two very different levels of "alert," worth treating as separate phases:

**v1 — foreground alerts, while the app is open (recommended starting point).**

- A small client component (mount once, e.g. from `src/app/layout.tsx` so
  it's present on every page) that, only after the user opts in via an
  explicit toggle (not a silent permission prompt on page load — see
  privacy note below), calls
  `navigator.geolocation.watchPosition(...)` and, on each meaningful
  position change (Leaflet-style throttling — e.g. only re-check if moved
  >20m or >60s since the last check), calls a new server action:
  `nearbyDangerAlerts(lat, lng): Promise<{ dogId, name, distanceMeters, lastSeenAt }[]>`.
- That action queries recent sightings of red-flagged dogs within a radius
  (e.g. 150m — campus foot-traffic scale, same ballpark as the merge
  matching radius above) **and** recent enough to be meaningful (e.g. last
  24–48h — a bites report from three weeks ago at that spot doesn't mean
  the dog is still there right now):
  ```sql
  select d.id, s.lat, s.lng, s.created_at,
         earth_distance(ll_to_earth(s.lat, s.lng), ll_to_earth($lat, $lng)) as meters
  from public.sightings s
  join public.dogs d on d.id = s.dog_id
  where d.red_flagged
    and s.created_at > now() - interval '48 hours'
  having earth_distance(ll_to_earth(s.lat, s.lng), ll_to_earth($lat, $lng)) < 150
  order by s.created_at desc;
  ```
  (reuses the same `cube`/`earthdistance` extension proposed for
  home-range scoring in section 2 — one spatial-distance mechanism for
  both features, not two).
- Show a dismissible banner/toast, not a browser `alert()` (blocks the
  whole tab). Track which `(dogId, sightingId)` pairs have already been
  shown this session client-side so walking near the same spot for ten
  minutes doesn't re-fire the same warning repeatedly.
- Nothing about the user's location needs to be *stored* server-side for
  v1 — each check is a stateless "am I near anything dangerous right now"
  query; the coordinates are sent, used, and discarded. That's a
  meaningfully better privacy story than v2, and worth staying on v1 for
  a while before deciding v2 is worth it.

**v2 — real push notifications, alert even when the app/tab is closed.**
This is a materially bigger lift, not a small extension of v1 — flagging
it clearly so it isn't scoped as "just add push":

- Needs a service worker + web app manifest (neither exists in this repo
  today — `next.config.ts` has no PWA setup, no `manifest.json`, nothing
  under `public/` for it), Web Push subscriptions (VAPID keys), and a
  `push_subscriptions` table keyed by user.
- Critically, it also needs to know roughly where each opted-in user *is*
  even when they don't have the tab open, which means periodically
  storing a last-known location server-side per user — a much heavier
  privacy commitment than v1's "never persisted, checked live" model.
  That alone is worth a deliberate opt-in flow (separate from the v1
  toggle) with a plain-language explanation of what's stored, how long,
  and a one-tap way to turn it off.
- Trigger: a Supabase Edge Function invoked on `sightings` insert (or a
  DB trigger → `pg_net`/webhook) when the sighted dog is `red_flagged`,
  looks up subscribed users within radius of their last stored location,
  sends push via the Web Push protocol.
- Treat this as a later phase, only if v1's foreground alerts turn out to
  be insufficient in practice (e.g. people report near-misses because they
  had the app closed) — it's a lot of new infrastructure for a problem v1
  may already cover well enough, since most people have their phone/app
  open while actively walking around campus.

### Why foreground-first, not push-first

Continuous location tracking of students — even for something as
well-intentioned as a dog-safety feature — is the most privacy-sensitive
thing in this entire doc, more so than the recognition system (which only
ever looks at photos people chose to upload). Shipping v1 first means the
feature exists and is genuinely useful (most people have the tab open
while walking around, especially if it's the map they check before
heading somewhere) without committing to storing anyone's location
history up front. If v2 does get built later, keep it strictly opt-in,
separate from v1's toggle, and put a visible "turn off location alerts"
control somewhere obvious (Nav or a profile page — neither currently
exists as a settings surface, so that'd be new too).
