-- The three security findings worth acting on, and a note on the ones not.
--
-- Supabase's linter reported fourteen. Most are describing decisions this
-- schema made on purpose, so this fixes the three that are genuinely wrong and
-- writes down why the rest are staying, because an un-answered linter warning
-- gets re-raised every few months and re-argued from scratch.

-- ── 1. a trigger function with a mutable search_path ────────────────────
--
-- The only finding here that is a real vulnerability rather than a posture
-- warning. classify_menu_alcohol is SECURITY DEFINER and runs on every menu
-- row written; without a pinned search_path, anyone able to create a schema
-- earlier in the resolution order can shadow a function or operator it uses
-- and have it run with the definer's rights.
--
-- Every other function in this schema already does this -- 0012 set it on the
-- trigger functions, 0042 on the chat meter, 0046 and 0047 on the portal
-- guards. This one was written in 0033 and missed.
alter function public.classify_menu_alcohol() set search_path = public;

-- ── 2. the images bucket could be listed ───────────────────────────────
--
-- A broad SELECT policy on storage.objects lets any client enumerate every
-- file in the bucket, which is a different thing from being able to fetch one.
-- Public buckets serve their objects over the public URL without consulting
-- this policy at all, and getPublicUrl is the only way this project reads
-- them -- nothing anywhere calls .list() or .download() on it.
--
-- So the listing goes and the images keep working. If something later does
-- need to enumerate, it should do so through the server with the service role
-- rather than by reopening this to everybody.
drop policy if exists "images are publicly readable" on storage.objects;

-- ── 3. what is staying, and why ────────────────────────────────────────
--
-- rls_policy_always_true on issue_reports, venue_reports and
-- reservation_requests: deliberate, and argued at length in 0009 and 0052. A
-- report is open to signed-out people because the person best placed to tell
-- us sign-in is broken cannot sign in, and somebody standing outside a closed
-- venue is not going to make an account first. The real exposure is not access
-- but volume -- a leaked anon key means unlimited inserts -- and the answer to
-- that is a rate limit, not a policy that turns away the reports.
--
-- anon/authenticated_security_definer_function_executable on is_admin,
-- is_event_planner, manages_venue and manages_menu_of: these are called from
-- inside the RLS policies themselves, so revoking EXECUTE from authenticated
-- would not harden them, it would break every policy that calls one. They also
-- disclose nothing: is_admin() tells you whether you are an admin. The correct
-- fix is moving them into a schema PostgREST does not expose, which touches
-- every policy in the database and is not worth doing on a Sunday.
--
-- Leaked password protection is not a migration. It is a toggle in the
-- Supabase dashboard under Authentication, and it should be on.

comment on function public.classify_menu_alcohol() is
  'Marks a menu item as alcoholic on write. SECURITY DEFINER with a pinned search_path since 0054; without the pin a shadowing schema could hijack what it resolves.';
