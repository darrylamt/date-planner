# aduro — iOS app

The native companion to the aduro web planner. Same Supabase project, same
itinerary engine, an interface built to Apple's HIG.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in the three values
npx expo start
```

| Variable | What it is |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | Same project as the web app |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Publishable key — safe to ship, RLS protects the data |
| `EXPO_PUBLIC_API_URL` | Deployed web app that serves `/api/generate` and `/api/swap` |

`EXPO_PUBLIC_*` values are inlined **at build time**. Change one and you must
rebuild — editing it on the server has no effect on an installed app.

### Supabase: one required change

Sign-in uses a six-digit code rather than a magic link. In the Supabase
dashboard under **Authentication → Email Templates → Magic Link**, the template
must include the token:

```html
<p>Your aduro sign-in code is <strong>{{ .Token }}</strong></p>
```

Without this, users receive a link they cannot use inside the app.

## Builds

```bash
eas build --profile preview    --platform ios   # internal install link
eas build --profile production --platform ios   # TestFlight / App Store
eas submit --profile production --platform ios
```

`eas.json` carries only `appleTeamId`. On the first submit, EAS prompts for
your Apple ID and offers to create the App Store Connect app record; after
that it remembers the `ascAppId`. Do not put placeholder strings in
`submit.production.ios` — EAS validates those fields and fails rather than
falling back to prompting.

## Layout

```
app/                 expo-router screens
  index.tsx          home
  plan/new.tsx       7-step questionnaire, generation, result
  plans.tsx          saved plans
  login.tsx          email OTP sign-in
src/
  theme.ts           design tokens (HIG semantic colours + Apple type scale)
  components/        UI kit, then plan/ for itinerary pieces
  lib/               supabase, api, data access, domain types
```
