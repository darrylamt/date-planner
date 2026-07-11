# aduro — a date planned with intention · Accra

A date & activity planner for the Ghanaian market. Tell it your budget, the vibe, the date, and a little about the person you're planning for — it builds a back-to-back itinerary across Accra with real menus, real prices, and transport estimates, all kept inside your budget.

**This is a date planner, not a restaurant finder** — restaurants, activities (arcades, canopy walks, paddle, tennis, bowling), and events (live music, sip & paint, festivals) are all first-class.

## Stack

- **Next.js 14** (App Router) + **TypeScript** + **Tailwind CSS**
- **Supabase** (Postgres + magic-link auth, no passwords)
- **Anthropic API** (`claude-sonnet-4-6`) for itinerary generation — server-side only
- Deploys to **Vercel**

## Design

Implemented from the Claude Design source (`Accra Date Planner.dc.html`), with two client-requested changes applied on top of the design system:

- **Palette swap** — the original earth-tone palette was replaced with a livelier sunset-coral (`#F4501E`) / amber (`#FFB627`) / lagoon-teal (`#123B41`) scheme. All tokens live in `tailwind.config.ts` (single source of truth).
- **Font swap** — Poppins for display/body, Roboto Mono for prices & labels.

All component shapes (buttons, chips, venue cards, timeline connector, budget bar, kente accent strip, shimmer swap state, dark shared view, admin tables) follow the design one-to-one.

## Local setup

### 1. Install

```bash
npm install
cp .env.example .env.local   # then fill in the values below
```

### 2. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Run the migration: paste `supabase/migrations/0001_init.sql` into the SQL editor (or `supabase db push` with the CLI).
3. Seed it: paste `supabase/seed.sql` into the SQL editor. Seeds 8 areas, 25 venues with menus, and 5 events. **All seed prices are placeholders** — replace with researched data before launch.
4. Copy the Project URL, anon key and service role key into `.env.local`.
5. Auth: in **Authentication → URL Configuration**, set the Site URL to `http://localhost:3000` (and later your Vercel URL). Magic-link email is on by default.

### 3. Anthropic

Create an API key at [console.anthropic.com](https://console.anthropic.com) and set `ANTHROPIC_API_KEY`. The key is only ever used in server route handlers (`/api/generate`, `/api/swap`).

### 4. Run

```bash
npm run dev
```

Open http://localhost:3000. "See an example plan" works with no API key; the full flow needs Supabase + Anthropic configured.

### 5. Make yourself an admin

Sign in once via magic link, then in the Supabase SQL editor:

```sql
update public.profiles set is_admin = true where email = 'you@example.com';
```

`/admin` is now unlocked (RLS enforces the same flag server-side, so non-admins can't write to the catalog even with the anon key).

## Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client + server | Public anon key (RLS applies) |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | Serves shared plan links by slug without a public SELECT policy |
| `ANTHROPIC_API_KEY` | server only | Itinerary generation |

## Deploying to Vercel

1. Push this repo to GitHub and import it in Vercel (framework preset: Next.js — zero config).
2. Add the four environment variables above in **Project → Settings → Environment Variables**.
3. In Supabase **Authentication → URL Configuration**, add your Vercel domain to Site URL / Redirect URLs (`https://your-app.vercel.app/auth/callback`).
4. Deploy. The generate/swap routes set `maxDuration = 60`; on the Hobby plan they run within the default limits for typical plans.

## How it works

```
src/
  app/
    page.tsx                landing (hero, collage, value props)
    plan/new                7-step input flow → loading → itinerary (client)
    plan/example            canned demo plan (no API needed)
    p/[slug]                public read-only shared plan (dark view)
    plans                   saved plans (magic-link gated)
    login                   magic-link sign in
    admin                   venues / bulk prices / events / areas / CSV import
    api/generate            Claude call: candidates → strict JSON plan → server verification
    api/swap                replaces one stop, holds the rest + budget constant
    api/plans               saves a plan, mints the share slug
  components/               style-tile components (BudgetBar, StopCard, HopConnector…)
  lib/                      matching, prompts, transport estimator, recompute, pronouns
supabase/
  migrations/0001_init.sql  schema + RLS
  seed.sql                  placeholder seed data
```

Safety rails around the model:

- The model only ever sees venues/menus/events queried from Supabase for the request (area, price band vs budget, vibe overlap, events on that date).
- Output is parsed defensively (fences stripped), validated with zod, and **grounded**: any stop referencing an unknown venue id is rejected.
- Transport hops and all totals are **recomputed server-side** (GHS 25 base + GHS 8/km when coordinates exist, flat GHS 40 otherwise); a plan that exceeds the budget triggers one corrective retry, then a designed error state.
- Too few matching venues → the honest "we couldn't fill the whole evening" screen with one-tap fixes (widen area / nudge budget) — never a fabricated plan.

## Extras beyond the brief

- **Anyone plans for anyone** — a pronoun + optional-name step; every line of partner copy ("Build their evening", "Putting Ama's evening together", "Built around him") adapts. No assumption about who's planning for whom.
- **WhatsApp share** — plans get sent, and in Ghana they get sent on WhatsApp.
- **Add to calendar** — downloads an `.ics` with the full stop-by-stop rundown (Africa/Accra timezone).
- **Working example plan** — the landing page demo renders instantly from seed venues, no API key required.
- **Plan persistence** — in-progress inputs and results survive refreshes and the magic-link round trip (a pending save auto-completes after sign-in).
- **Real photography everywhere** — venue cards, saved-plan thumbnails, hero collage, with a graceful woven-pattern fallback when an image is missing.

## Not in this version (by design)

No payments, reservations/booking, bundled transport, reviews, or native apps.
