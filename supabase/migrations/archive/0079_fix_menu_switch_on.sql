-- Fixes 0078's menu trigger, which broke every priced menu upload by an admin
-- or the server.
--
-- 0078 wrote coalesce(verification_status, '') <> 'closed'. verification_status
-- is an enum (0003), so the '' was cast to it and Postgres refused: "invalid
-- input value for enum verification_status". PL/pgSQL plans the statement the
-- first time it runs, so it failed on every insert that reached it (a price
-- above zero, written by an admin or the service role), whatever the venue.
-- A venue's own login never reached it and was unaffected.
--
-- The column is not null, so the coalesce was never needed.

create or replace function public.menu_switches_venue_on()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.price_ghs > 0 and (auth.uid() is null or public.is_admin()) then
    update public.venues
       set is_active = true
     where id = new.venue_id
       and not is_active
       and coalesce(business_status, '') not like 'CLOSED%'
       and verification_status <> 'closed';
  end if;
  return new;
end;
$$;

revoke execute on function public.menu_switches_venue_on() from public, anon, authenticated;
