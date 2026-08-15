# Campus Dogs 🐕

A community directory for the stray dogs of **BITS Pilani**. Students upload
photos, propose and vote on names, log where each dog was last seen on a campus
map, and tag each dog's personality and safety status.

Built in phases — see the [build spec](#build-phases). `main` is always
shippable.

## Tech stack

- **Frontend:** Next.js (App Router) + React + TypeScript + Tailwind CSS
- **Backend / DB:** Supabase (Postgres, Auth, Storage, Row-Level Security)
- **Maps:** Leaflet + OpenStreetMap (Phase 5)
- **Hosting:** Vercel

## Local development

```bash
npm install
cp .env.local.example .env.local   # then fill in your Supabase values
npm run dev
```

Open http://localhost:3000. The landing page shows a live **Supabase
connection status** pill — green once `.env.local` is filled with a real
project URL and anon key.

### Environment variables

| Variable                        | Where to find it                          | Public? |
| ------------------------------- | ----------------------------------------- | ------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase → Settings → API → Project URL   | yes     |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API → anon public   | yes     |

Secrets live only in env vars and are never committed (`.env*` is gitignored).

## For collaborators (working on this together)

You've been added as a collaborator. To run the project locally:

```bash
git clone <this-repo-url>
cd dogs
npm install
cp .env.local.example .env.local   # then paste the shared values (below)
npm run dev                        # http://localhost:3000
```

Ask the project owner for the three env values to put in `.env.local`:
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY`. We all share **one Supabase project**, so the
database/schema is already set up — you don't need to run any SQL.

**Making changes:**

```bash
git checkout -b your-name/what-you-changed
# ...edit...
git commit -am "describe the change"
git push -u origin your-name/what-you-changed
```

Then open a Pull Request on GitHub. Once it's merged to `main`, Vercel
auto-deploys to production (if the repo is connected in Vercel → Settings → Git).
Keep `main` shippable — build must pass (`npm run build`) before merging.

## Build phases

1. **Skeleton, live** ← _current_ — styled app deployed, connected to Supabase.
2. Add-a-dog, see-a-dog — upload form + dog grid.
3. Accounts — magic-link login, stamp `created_by`.
4. The naming vote — suggest & upvote names, ranked live. **(MVP line: 1–4.)**
5. Map & sightings — Leaflet map, append-only sightings.
6. Temperament tags — personality + safety votes, prominent `bites` warning.
7. Harden, then delight — BITS-only signups, moderation, duplicate merge, extras.

## Database setup

Paste these into the Supabase Dashboard → **SQL Editor** and Run them, in
order (each is safe to re-run):

1. [`supabase/schema_mvp.sql`](supabase/schema_mvp.sql) — MVP tables, the
   `dog-photos` storage bucket, RLS policies, helper views.
2. [`supabase/schema_one_vote.sql`](supabase/schema_one_vote.sql) — one name
   suggestion + one name vote per user per dog.
3. [`supabase/schema_favourites.sql`](supabase/schema_favourites.sql) —
   favourite-dog vote + leaderboard views.
4. [`supabase/schema_phase5_6.sql`](supabase/schema_phase5_6.sql) — sightings,
   personality + safety votes.
5. [`supabase/schema_phase7.sql`](supabase/schema_phase7.sql) — pgvector photo
   embeddings, duplicate detection, dog merging, red flags + danger alerts.
6. [`supabase/enable_bits_restriction.sql`](supabase/enable_bits_restriction.sql)
   — **required** DB-level BITS email gate (a trigger on `auth.users`; the
   app-level check alone can be bypassed via the API). Note: it blocks any new
   non-BITS signup, including test accounts.

## Google OAuth setup (Phase 7)

Production sign-in is **Google OAuth restricted to BITS Pilani accounts**. The
in-app password fallback only runs in dev. One-time setup, done by whoever
owns the Supabase project (consider a project-shared Google account rather
than a personal one):

1. **Google Cloud Console** → create/select a project → OAuth consent screen →
   Credentials → *Create credentials → OAuth client ID → Web application*.
   Add the authorized redirect URI
   `https://<project-ref>.supabase.co/auth/v1/callback`.
2. **Supabase** → Authentication → Providers → Google → enable, paste the
   Client ID and Secret.
3. Deploy. The login page's `hd=bits-pilani.ac.in` hint pre-filters Google's
   account picker, but enforcement is the domain check in
   `src/app/auth/callback/route.ts` plus the DB trigger above.

Heads-up on existing accounts: a Google sign-in creates a **new**
`auth.users` row even for the same email, so accounts made via the old
password scheme won't carry over their dogs/votes. Fine pre-launch; if real
data must survive the switch, plan an email-based merge first.

## Changelog

### Phase 7 — Google OAuth, duplicate detection, red-flag alerts ✅

- **Google OAuth for BITS only:** login is a "Continue with Google" button;
  the `/auth/callback` route verifies the BITS domain after the code exchange
  and signs non-BITS accounts straight back out (`?error=domain`). The old
  derived-password sign-in survives as a dev-only fallback.
- **Duplicate detection:** every uploaded photo is embedded server-side with a
  frozen CLIP model (`src/lib/embeddings.ts`, quantized ViT-B/32 via
  transformers.js) into `photos.embedding` (pgvector). Before a new dog is
  created, `findPossibleDuplicates` runs a nearest-neighbor search blended
  with distance from each candidate's sighting home range
  (`dog_home_range` view + `src/lib/dedup.ts` scoring) and the uploader gets a
  "same dog?" prompt — *Yes* attaches the photo to the existing dog, *No*
  proceeds. Thresholds in `src/lib/dedup.ts` need tuning against real campus
  photos.
- **Location capture:** adding a dog asks (optionally) for the browser's
  location and logs it as the dog's first sighting, seeding its home range.
- **Admin merge:** `/nimbooz` shows unresolved look-alike pairs
  (`possible_duplicate_pairs`) with one-click merge (`merge_dogs` SQL function
  re-parents photos/sightings/votes and dedupes names, summing shared-name
  votes).
- **Red flags:** a DB trigger flags a dog once **3 distinct users** vote
  `bites` (absolute threshold, not majority). Flag shows as a 🚩 badge on the
  grid, a banner on the dog page, and distinct danger pins on the map. Admins
  can flag/downgrade in `/nimbooz`; a human decision stops the auto-trigger
  from overriding it.
- **Proximity alerts (v1, foreground):** an opt-in toggle (bottom-right)
  watches your position while the tab is open and warns when you're within
  150m of a <48h-old sighting of a red-flagged dog. Coordinates are checked
  live and never stored. Push notifications (v2) deliberately deferred.

### Phases 2–4 — Add → name → vote → see (the MVP) ✅

- **Schema:** `dogs`, `photos`, `name_suggestions`, `name_votes`, `profiles`
  (auto-created on signup via trigger), all with RLS. Views `dog_cards` and
  `name_suggestion_counts` power the grid and rankings.
- **Add a dog** (`/dogs/new`): photo uploads straight to Supabase Storage, then
  a server action creates the dog + primary photo + first name (creator
  auto-endorses it). Requires login.
- **See the pack** (`/`): responsive grid of active dogs, each showing its
  top-voted name and photo.
- **Accounts:** magic-link sign-in, `/auth/callback` session exchange, session
  refresh in `src/proxy.ts`, nav login state, sign-out. `created_by` /
  `uploaded_by` stamped on every row. BITS-domain restriction is written and
  wired (`src/lib/bits.ts`) but **off** — flip `RESTRICT_TO_BITS` in Phase 7.
- **Naming vote** (`/dogs/[id]`): names ranked live by votes, one vote per user
  per name (DB unique constraint), optimistic upvote/switch, add-a-name box.

### Phase 1 — Skeleton, live ✅

- Scaffolded Next.js (App Router) + TypeScript + Tailwind, `src/` layout.
- Added Supabase browser and server clients (`src/lib/supabase/`) via
  `@supabase/ssr`, ready for auth cookies in Phase 3.
- Landing page lists the roadmap and shows a **live Supabase connectivity
  check** (`checkSupabaseHealth`).
- Env var templates (`.env.local.example`); secrets kept out of git.
