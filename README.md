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

## Build phases

1. **Skeleton, live** ← _current_ — styled app deployed, connected to Supabase.
2. Add-a-dog, see-a-dog — upload form + dog grid.
3. Accounts — magic-link login, stamp `created_by`.
4. The naming vote — suggest & upvote names, ranked live. **(MVP line: 1–4.)**
5. Map & sightings — Leaflet map, append-only sightings.
6. Temperament tags — personality + safety votes, prominent `bites` warning.
7. Harden, then delight — BITS-only signups, moderation, duplicate merge, extras.

## Database setup

Paste [`supabase/schema_mvp.sql`](supabase/schema_mvp.sql) into the Supabase
Dashboard → **SQL Editor** and Run it. It creates every MVP table, the
`dog-photos` storage bucket, RLS policies, and helper views — and is safe to
re-run. Auth is **magic-link email**; enable the Email provider in Supabase →
Authentication → Providers.

## Changelog

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
