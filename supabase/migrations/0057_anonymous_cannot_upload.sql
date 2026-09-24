-- Account-less users cannot write to storage.
--
-- Anonymous sign-ins were turned on so Pro can be bought without registering
-- (App Store guideline 5.1.1(v)). Anonymous users take the `authenticated`
-- role, so every policy written as "any signed-in user may" now also means
-- "anybody who tapped Continue without an account" -- and one of those
-- sign-ins costs nothing and can be scripted.
--
-- The avatar policies were the only ones that reached. They are scoped to the
-- caller's own folder, which stops anyone touching another person's picture,
-- but not somebody creating a fresh anonymous session per upload and using the
-- bucket as free file hosting. The app never offers avatar upload without an
-- account, so nothing legitimate is lost.
--
-- Every other "to authenticated" grant is paired with a policy that needs
-- ownership of the row or a venue or planner role, which an anonymous user
-- cannot have.

drop policy if exists "avatars: own insert" on storage.objects;
create policy "avatars: own insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  );

drop policy if exists "avatars: own update" on storage.objects;
create policy "avatars: own update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  );
