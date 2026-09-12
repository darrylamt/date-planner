-- Let people change their own name and picture. They never could.
--
-- Migration 0010 added display_name and avatar_url and built a screen to edit
-- them. The only UPDATE policy on profiles has always been:
--
--   create policy "profiles: admin update" on public.profiles
--     for update using (public.is_admin());
--
-- so an ordinary person updating their own row matches no policy at all.
-- Postgres does not refuse that. It updates zero rows, PostgREST reports
-- success, and the client code reads `!error` as "saved". The screen said it
-- had worked every single time and nothing was ever written.
--
-- Confirmed against the live database before writing this: all five profiles
-- have display_name null and avatar_url null. Nobody has ever set either,
-- including the Sign in with Apple path, which writes the full name on first
-- authorisation and only gets that one chance at it, because Apple never sends
-- the name again.
--
-- ── why this is not simply an own-row policy ────────────────────────────
--
-- profiles carries is_admin, and admin is a flag on this row rather than a
-- database role. A policy of `using (auth.uid() = id)` alone would let anyone
-- signed in set is_admin = true on themselves and walk into every admin screen
-- in the product. Fixing "cannot save my name" by handing out the admin flag
-- would be a considerably worse bug than the one being fixed.
--
-- RLS chooses the row; it cannot choose the column. Column privileges are the
-- tool for that, the same pairing used on venues in 0013. So: the policy
-- narrows the update to your own row, and the grant narrows it to the two
-- columns a person is allowed to change. is_admin and email are reachable by
-- neither.

-- ── 1. Which columns ────────────────────────────────────────────────────
revoke update on public.profiles from authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;

-- anon has no business writing here at all.
revoke update on public.profiles from anon;

-- ── 2. Which row ────────────────────────────────────────────────────────
drop policy if exists "profiles: own update" on public.profiles;

create policy "profiles: own update" on public.profiles
  for update
  using (auth.uid() = id)
  -- The check matters as much as the using clause: without it a row could be
  -- updated to carry somebody else's id, handing your profile to them.
  with check (auth.uid() = id);

comment on policy "profiles: own update" on public.profiles is
  'Your own row only. The columns you may touch are set by the column grant above, not here, because RLS cannot see columns and profiles carries is_admin.';
