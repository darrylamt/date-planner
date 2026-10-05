-- Five free messages a month, not five ever.
--
-- 0029 made the free allowance a lifetime count, on the reasoning that five is
-- a taste rather than a trial and the point was to keep exposure per signup
-- near zero. That is the right instinct about cost and the wrong shape for the
-- product.
--
-- A lifetime five is spent in one sitting, usually on the first evening
-- somebody plans, and after that the concierge is a button that says no
-- forever. Nobody subscribes to something they have not used in a month; they
-- subscribe to something they keep reaching for and keep running out of. A
-- monthly five is a reason to come back and a reason to pay, and the lifetime
-- one is neither.
--
-- The cost argument survives. Five messages a month at roughly half a US cent
-- each is about three cents a year per account that never pays, which is less
-- than the price of them never returning.
--
-- ── the counter already exists ──────────────────────────────────────────
-- chat_usage is keyed (user_id, period_start) and the pro branch has always
-- used it. The free branch counted in entitlements.lifetime_messages_used
-- instead, so this change is mostly deleting the special case: both tiers now
-- count the same way, in the same table, against different limits.
--
-- lifetime_messages_used is kept rather than dropped. It is the only record of
-- what anybody spent before today, and a column costing nothing is a poor
-- reason to throw away the answer to "how much did this cost us in the first
-- month". It is no longer read by the gate.

drop function if exists public.consume_chat_message(uuid, integer, integer);

create or replace function public.consume_chat_message(
  p_user_id uuid,
  p_free_monthly integer default 5,
  p_pro_monthly integer default 150
)
returns table (allowed boolean, tier text, used integer, allowance integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tier text;
  v_status text;
  v_expires timestamptz;
  v_period date := date_trunc('month', (now() at time zone 'utc'))::date;
  v_used integer;
  v_pro boolean;
  v_allowance integer;
begin
  -- First chat of their life. The row is made on demand rather than by a
  -- trigger on signup, so existing accounts need no backfill.
  insert into public.entitlements (user_id) values (p_user_id)
  on conflict (user_id) do nothing;

  /*
   * The row lock is the whole point of doing this in one statement. Two
   * requests arriving together would otherwise both read the same count, both
   * find room, and both spend it.
   */
  select e.tier, e.status, e.expires_at
    into v_tier, v_status, v_expires
  from public.entitlements e
  where e.user_id = p_user_id
  for update;

  -- Grace is deliberately inside the gate: a card that failed to renew is a
  -- billing problem to chase, not a reason to shut someone out mid-sentence.
  v_pro := v_tier = 'pro'
       and v_status in ('active', 'in_grace')
       and (v_expires is null or v_expires > now());

  v_allowance := case when v_pro then p_pro_monthly else p_free_monthly end;

  /*
   * One counter for both tiers now. A month is date_trunc'd in UTC, which is
   * the local calendar in Accra: Ghana keeps GMT all year, so there is no
   * question of whose midnight resets the count.
   */
  insert into public.chat_usage (user_id, period_start, messages_used)
  values (p_user_id, v_period, 0)
  on conflict (user_id, period_start) do nothing;

  select u.messages_used into v_used
  from public.chat_usage u
  where u.user_id = p_user_id and u.period_start = v_period;

  if v_used >= v_allowance then
    return query select false, (case when v_pro then 'pro' else 'free' end)::text, v_used, v_allowance;
    return;
  end if;

  update public.chat_usage
     set messages_used = messages_used + 1
   where user_id = p_user_id and period_start = v_period;

  /*
   * Still counted for the life of the account, for the sake of knowing what
   * this costs. Not read by the gate; nothing is refused because of it.
   */
  update public.entitlements
     set lifetime_messages_used = lifetime_messages_used + 1
   where user_id = p_user_id;

  return query select true, (case when v_pro then 'pro' else 'free' end)::text, v_used + 1, v_allowance;
end;
$$;

/*
 * Only the server may call it. PostgREST exposes every function in public as
 * an RPC, and this one takes the user id as an argument, so left reachable it
 * would let anybody burn anybody else's allowance. The same reasoning, and the
 * same fix, that 0012 applied to the trigger functions.
 */
revoke execute on function public.consume_chat_message(uuid, integer, integer) from public;
revoke execute on function public.consume_chat_message(uuid, integer, integer) from anon, authenticated;

comment on function public.consume_chat_message(uuid, integer, integer) is
  'Atomically checks and spends one chat message against the caller''s monthly allowance, free or pro. Service role only: it trusts the user id it is handed.';

comment on column public.entitlements.lifetime_messages_used is
  'Every message this account has ever sent. Kept for cost reporting only; 0042 moved the free gate to a monthly count in chat_usage and nothing is refused on this.';
