-- How often one caller may do an expensive thing (security audit, Oct 2026).
--
-- /api/generate had no limit, and anonymous accounts could be made by a
-- script to farm the five free Durobot messages each. A counter per key per
-- window, bumped and checked in one statement so two requests at once cannot
-- both slip under the limit. Keys are one-way hashes made on the server
-- ("gen:who:…", "gen:ip:…", "chat:anon:ip:…"), never an address or an account.
--
-- Only the server calls it (service role). Old windows are swept as it goes.

create table if not exists public.rate_counters (
  key text not null check (char_length(key) between 1 and 120),
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (key, window_start)
);

alter table public.rate_counters enable row level security;
-- No policies: nothing but the service role reads or writes it.

create or replace function public.rate_hit(p_key text, p_window_seconds integer, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / greatest(p_window_seconds, 1)) * greatest(p_window_seconds, 1));
  n integer;
begin
  insert into public.rate_counters (key, window_start, hits)
  values (p_key, w, 1)
  on conflict (key, window_start) do update set hits = public.rate_counters.hits + 1
  returning hits into n;
  -- Now and then, forget windows older than two days.
  if random() < 0.02 then
    delete from public.rate_counters where window_start < now() - interval '2 days';
  end if;
  return n <= p_limit;
end;
$$;

revoke all on function public.rate_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_hit(text, integer, integer) to service_role;
