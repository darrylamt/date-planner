-- Migration 0038's column list was never actually enforced.
--
-- That migration is built on the rule 0023 established: RLS picks the row,
-- column grants pick the column. It wrote the policy, it wrote
-- `grant update (23 columns)`, and it listed what it was withholding and why.
-- Only the first half was ever true.
--
-- ── what went wrong ─────────────────────────────────────────────────────
-- `authenticated` already held table-level UPDATE on venues, from Supabase's
-- default grants. Migration 0014 revoked SELECT and said so in as many words:
-- "SELECT only. INSERT, UPDATE and DELETE are untouched." That was correct at
-- the time, because the only UPDATE policy on venues was `is_admin()`, so no
-- ordinary account could reach a row at all and a table-wide column grant
-- cost nothing.
--
-- 0038 changed that without changing this. Adding `venues: own venue update`
-- gave venue users a row, and a table-level grant hands whoever reaches a row
-- every column on it. A column grant cannot narrow a privilege that is
-- already held more widely; it only adds.
--
-- ── what it allowed ─────────────────────────────────────────────────────
-- Measured against the live database before writing this, with a throwaway
-- portal account:
--
--   area_id, price_band, is_free, aesthetics, phone_status, phone_pending
--   and menu_shared_from were all writable, every one of them named in
--   0038 as withheld.
--
-- The sharpest is menu_shared_from, which is not merely a bad field to let
-- somebody set about themselves -- it reaches another venue. manages_menu_of()
-- grants write access to venue v's menu to anybody who manages a venue whose
-- menu_shared_from points at v, which is right for a branch and its owner.
-- Letting a venue user choose that target themselves turns it into: point at
-- any venue, then edit that venue's menu. Confirmed end to end, by writing a
-- row into a 240-item menu belonging to somebody else and taking it out again.
--
-- phone_status is the second: a portal account could mark its own unverified
-- number approved, which is the exact thing migrations 0013, 0014 and 0028
-- exist to prevent.
--
-- Nobody has exploited this: there are no venue logins yet. Migration 0046
-- issues the first accounts that reach these policies, which is why it is
-- worth fixing now rather than noting.
--
-- ── why a trigger and not a revoke ──────────────────────────────────────
-- The obvious fix is to revoke UPDATE and re-grant the intended columns. It
-- would break the admin. Admin is a flag on a profile row, not a database
-- role, so an admin is `authenticated` too and writes venues from the browser
-- under their own session; a grant narrow enough to contain a venue user is
-- narrow enough to stop an admin saving a price band. That is the dilemma
-- 0014 wrote down: "any grant wide enough for the admin screens was wide
-- enough for every account anyone could create by signing up."
--
-- 0014 resolved it for reads by moving the admin onto the service role. Doing
-- the same for writes means touching every admin form, and the risk of that
-- lands on the screens the catalogue is maintained through.
--
-- So the column policy is enforced where the two callers can actually be told
-- apart: in a trigger, at write time, which knows whether this particular
-- caller is an admin. The grants are left exactly as they are.
--
-- ── allow-list, not deny-list ───────────────────────────────────────────
-- Built by rebuilding the row from OLD and copying across only the columns a
-- venue may change, rather than by naming the dangerous ones. This keeps
-- 0038's stated intent -- "a column added later is then admin-only until
-- somebody decides otherwise" -- actually true, including for columns that do
-- not exist yet.

create or replace function public.venues_enforce_portal_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  /*
   * Exactly migration 0038's `grant update` list, which is the set a venue was
   * always meant to be able to change about itself.
   *
   * Checked against what the portal actually sends before shipping this:
   * ListingEditor, HoursForm and the listing page between them write
   * description, phone, whatsapp_phone, instagram_handle, image_url,
   * gallery_urls, cuisines, dress_code, reservation_required, is_active,
   * vibe_tags, min_party_size, max_party_size, opening_periods,
   * opening_hours_text, hours_synced_at and google_maps_url -- every one of
   * them on this list. Nothing in the portal stops working.
   *
   * `name` is deliberately absent and always was. A venue renaming itself in
   * the catalogue is not a small edit, and no screen offers it: the name
   * field in ListingEditor is display only.
   */
  allowed text[] := array[
    'description',
    'phone',
    'whatsapp_phone',
    'instagram_handle',
    'image_url',
    'gallery_urls',
    'opening_periods',
    'opening_hours_text',
    'hours_synced_at',
    'dress_code',
    'reservation_required',
    'is_active',
    'cuisines',
    'cuisine',
    'vibe_tags',
    'best_for',
    'min_party_size',
    'max_party_size',
    'minimum_spend_ghs',
    'avg_cost_per_person_ghs',
    'google_maps_url',
    'lat',
    'lng'
  ];
  merged jsonb;
begin
  /*
   * Three callers reach this table, and only one is being constrained.
   *
   * The service role runs migrations, crons and every admin read: auth.uid()
   * is null there, so it returns immediately. An admin writing from the admin
   * screens is a signed-in user, and is_admin() is what tells them apart from
   * a venue user -- without this check the admin could no longer set a price
   * band, which is most of what the admin is for.
   */
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  /*
   * Rebuild the row: OLD everywhere, NEW only for the allowed columns.
   *
   * Silent rather than an error, deliberately. The portal sends whole rows,
   * and a venue that happens to post back an unchanged price_band should save
   * its description rather than be shown a permissions failure it can do
   * nothing about. Anything genuinely trying to change a withheld column gets
   * the old value back, which is the same answer a missing grant would give.
   */
  select jsonb_object_agg(
           key,
           case when key = any(allowed) then n.value else o.value end
         )
    into merged
    from jsonb_each(to_jsonb(old)) o(key, value)
    join jsonb_each(to_jsonb(new)) n(key, value) using (key);

  -- Assigned rather than returned straight out, so the result is typed as the
  -- row this trigger is on and any later BEFORE trigger sees the corrected
  -- values. venues_phone_self_approve is exactly such a trigger.
  new := jsonb_populate_record(old, merged);
  return new;
end;
$$;

revoke execute on function public.venues_enforce_portal_columns() from public;
revoke execute on function public.venues_enforce_portal_columns() from anon, authenticated;

/*
 * Named to sort before venues_phone_self_approve.
 *
 * Triggers at the same timing fire in name order, and the order matters here:
 * this one resets phone_status to its old value, and the phone trigger then
 * sets it to approved when the venue has genuinely changed its own number.
 * Reversed, the enforcement would undo the approval the phone trigger just
 * made. `e` before `p` is doing real work.
 */
drop trigger if exists venues_enforce_portal_columns on public.venues;
create trigger venues_enforce_portal_columns
  before update on public.venues
  for each row execute function public.venues_enforce_portal_columns();

comment on function public.venues_enforce_portal_columns() is
  'Enforces migration 0038''s column list, which the grants never did: authenticated holds table-level UPDATE from Supabase''s defaults and a column grant cannot narrow it. See migration 0047.';

-- ── The same hole, one table over ───────────────────────────────────────
--
-- menu_shared_from is what made this urgent, and there is a second way to
-- reach it. 0024 added a trigger keeping menu sharing one level deep, but
-- nothing stops a venue pointing at a venue it does not run. Now that the
-- column cannot be written through the portal at all, the remaining path is
-- an admin's, which is where it belonged.
--
-- Left as a comment rather than a constraint because an admin legitimately
-- points a branch at its owner, and that is the only writer left.
