# aduro mobile, working notes

Expo SDK 57 / React Native 0.86 / expo-router. Read the versioned Expo docs at
https://docs.expo.dev/versions/v57.0.0/ before writing native code.

## Architecture

- **Catalog reads and user writes go straight to Supabase** (`src/lib/data.ts`).
  RLS scopes them exactly as the web API routes did: catalog is public-read,
  plans are owner-only, reservations are public-insert. No API route needed.
- **Only `/api/generate` and `/api/swap` hit the web app** (`src/lib/api.ts`),
  because they hold the server-side Anthropic key. Native fetch is not
  CORS-bound, so they are called unchanged. `EXPO_PUBLIC_API_URL` points at the
  deployed Next.js app.
- **Auth is a 6-digit email OTP**, not a magic link, no deep-link round trip.
  This requires the Supabase "Magic Link" email template to contain
  `{{ .Token }}`.

## Design system

`src/theme.ts` is the single source of truth and is **Apple HIG aligned**, iOS
semantic colours, the Apple type scale, and the system font (no custom faces).
Screens ask for `c.label` / `c.separator` / `c.tint` via `useTheme()`; they never
hard-code a colour. Light and dark both ship and follow the phone's setting.

This is deliberately **not** the web app's dark-romantic theme. The two are
allowed to diverge; do not "sync" them without being asked.

## Mirrored files

`src/lib/types.ts`, `format.ts` and `pronouns.ts` are byte-identical copies of
the web app's `src/lib/` equivalents. Edit the web copy first, then re-copy.

## Checks

```bash
npx tsc --noEmit                 # typecheck
npx expo export --platform ios   # catches import/bundling errors
```
