-- A name, a face, a note on a shared plan, and a calendar that can be queried.

-- ── who someone is ──────────────────────────────────────────────────────
--
-- The profile screen showed an email and a monogram cut from it, because
-- there was nothing else to show. An email address is an identifier, not a
-- name, and "amoateydarryl4" is nobody's idea of how they are called.

alter table public.profiles
  add column if not exists display_name text,
  add column if not exists avatar_url text;

comment on column public.profiles.display_name is
  'What the person calls themselves. Falls back to the email local part when blank.';
comment on column public.profiles.avatar_url is
  'Public URL in the avatars bucket. Null means render a monogram.';

-- ── a note from the planner ─────────────────────────────────────────────
--
-- A shared plan arrives as an itinerary with no voice in it. The one thing
-- the person who made it wants to say, why they picked this, what to wear,
-- that it is a surprise, had nowhere to go.

alter table public.plans
  add column if not exists planner_note text;

comment on column public.plans.planner_note is
  'A line from whoever made the plan, shown on the shared card. Never generated.';

-- ── a calendar that does not have to read JSON ──────────────────────────
--
-- The date and the occasion already live inside inputs. Generated columns
-- keep them queryable and indexable without a second copy that can drift:
-- they are derived on write and cannot disagree with the plan they came from.

alter table public.plans
  add column if not exists plan_date date
    generated always as ((inputs->>'date')::date) stored;

alter table public.plans
  add column if not exists occasion text
    generated always as (inputs->>'occasion') stored;

create index if not exists plans_user_date_idx
  on public.plans (user_id, plan_date desc);

-- ── avatars ─────────────────────────────────────────────────────────────
--
-- Public read, because an avatar appears on a shared plan that anyone with
-- the link can open, and a signed URL there would expire mid-invitation.
-- Writes are confined to a folder named after the owner, so nobody can
-- overwrite anyone else's face.

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars: public read" on storage.objects;
create policy "avatars: public read" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "avatars: own insert" on storage.objects;
create policy "avatars: own insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars: own update" on storage.objects;
create policy "avatars: own update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars: own delete" on storage.objects;
create policy "avatars: own delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
