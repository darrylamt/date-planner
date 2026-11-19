-- A phone's push token belongs to whoever is signed in on it now (owner,
-- 16 Nov 2026: "Not turned on. That did not work on this phone").
--
-- push_tokens is keyed on the token, and RLS lets an account write only its
-- own rows (0041). So when somebody signs in to a second account on the same
-- phone, saving the token is an update of a row the first account owns, RLS
-- refuses it, and notifications, nudges and star alerts can never be turned
-- on for the account they are using. It would also keep sending the old
-- account's reminders to this phone.
--
-- claim_push_token moves the token to the caller, in one statement, and only
-- ever for the caller: it takes no user id, so nobody can claim a token for
-- someone else. A token is a device secret only the device itself holds.
create or replace function public.claim_push_token(p_token text, p_platform text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if p_platform not in ('ios', 'android') or coalesce(length(p_token), 0) not between 10 and 300 then
    raise exception 'bad token' using errcode = '22023';
  end if;
  insert into public.push_tokens (token, user_id, platform, updated_at)
  values (p_token, auth.uid(), p_platform, now())
  on conflict (token) do update
    set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
end;
$$;

revoke all on function public.claim_push_token(text, text) from public, anon;
grant execute on function public.claim_push_token(text, text) to authenticated;
