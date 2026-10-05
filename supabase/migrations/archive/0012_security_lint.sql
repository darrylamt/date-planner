-- Security linter findings, the ones worth acting on.
--
-- Not all of them. Two of the warnings describe deliberate decisions and
-- "fixing" either would break something that works, so they are left alone
-- with the reasoning written down rather than silenced and forgotten.

-- ── 1. A trigger function with a mutable search_path ────────────────────
--
-- touch_updated_at resolves now() and its own operators through whatever
-- search_path the calling session happens to have. That is the shape of
-- attack where someone creates a schema earlier in the path containing their
-- own now(), and the trigger runs it. Pinning the path closes it.

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

-- ── 2. Trigger functions exposed as callable RPCs ───────────────────────
--
-- Supabase exposes every function in the public schema over PostgREST, so
-- these two were reachable at /rest/v1/rpc/ by anyone with the anon key even
-- though both exist only to be fired by a trigger. handle_new_user inserts
-- profile rows and bump_phone_report increments report counters, so calling
-- them directly is a way to write rows nothing asked for.
--
-- Revoked rather than rewritten: EXECUTE on a trigger function is checked when
-- the trigger is created, not each time it fires, so both triggers keep
-- working with no grants at all.
--
-- PUBLIC first, and it is the one that matters. Postgres grants EXECUTE on
-- every new function to PUBLIC by default, so revoking from anon and
-- authenticated alone would have left both roles holding the privilege
-- through PUBLIC and changed nothing.

revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon, authenticated;

revoke execute on function public.bump_phone_report() from public;
revoke execute on function public.bump_phone_report() from anon, authenticated;

-- ── 3. The avatars bucket allowed listing ───────────────────────────────
--
-- A public bucket serves its objects over /storage/v1/object/public/... and
-- that path does not consult RLS at all. The SELECT policy was doing nothing
-- for ordinary avatar loading and everything for enumeration: with it, anyone
-- could list every file in the bucket and walk the user ids in the folder
-- names. Dropping it keeps avatars loading and stops the directory listing.

drop policy if exists "avatars: public read" on storage.objects;

-- ── Left alone, deliberately ────────────────────────────────────────────
--
-- is_admin() is flagged as an executable SECURITY DEFINER function, and it
-- stays that way. Thirteen RLS policies call it, and a policy expression is
-- evaluated as the querying role, so revoking EXECUTE would not harden those
-- policies, it would turn every admin check into a permission error. What it
-- exposes is also nothing: it answers whether the caller is an admin, which
-- the caller could establish anyway by attempting an admin action.
--
-- The two "RLS policy always true" warnings on reservation_requests and
-- venue_reports are the intended design. Plans are built signed-out, so the
-- person who has just found a closed door or a changed price has no account,
-- and requiring one would lose exactly the report worth having. Reports are
-- rate-limited by the one-open-report-per-device index rather than by
-- authentication.
