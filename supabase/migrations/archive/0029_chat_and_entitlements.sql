-- aduro chat: the conversation store, and the meter that guards it.
--
-- Everything aduro has spent on the model so far has been bounded by something
-- other than money. Plan generation costs one Sonnet call and only happens
-- when somebody finishes a seven-step form; the four admin routes sit behind
-- is_admin. Nothing in the product has ever been both unbounded and reachable
-- by a stranger.
--
-- A chat box is exactly that. One person holding the send key is an unbounded
-- bill, and there is not much credit to lose. So the meter lands in the same
-- migration as the tables it protects, before a single token has been spent,
-- rather than arriving later once the shape of the problem is obvious.
--
-- ── what is deliberately not here ───────────────────────────────────────
-- partner_profiles, venue_history and push_tokens belong to the memory and
-- proactive phases and are months away. Creating them now would fix their
-- shape before anything has tried to use them, and an unused table drifts
-- quietly out of step with the code that will eventually want it.

-- ── 1. Conversations ────────────────────────────────────────────────────
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  /** Written from the first exchange, so the list reads as something. */
  title text,

  /**
   * Hidden rather than deleted. Somebody clearing their history usually means
   * "not on my screen", and a plan saved out of a conversation still points
   * back at it.
   */
  archived boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists conversations_user_recent_idx
  on public.conversations (user_id, updated_at desc)
  where not archived;

drop trigger if exists conversations_touch on public.conversations;

create trigger conversations_touch
  before update on public.conversations
  for each row execute function public.touch_updated_at();

-- ── 2. Messages ─────────────────────────────────────────────────────────
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,

  /*
   * Only the two. A tool call and its result are content blocks inside an
   * assistant or user turn rather than turns of their own, which is the shape
   * every provider we might use accepts back on the next request.
   */
  role text not null check (role in ('user', 'assistant')),

  /**
   * The full content-block array, not the text.
   *
   * A turn that called a tool is a tool_use block and its matching
   * tool_result, and the next request has to replay both or the model is
   * answering about a call it cannot see. Storing the rendered text instead
   * looks right in the transcript and breaks the loop on the following turn.
   */
  content jsonb not null,

  /**
   * input_tokens, output_tokens, cache_read_input_tokens, model, provider.
   *
   * The only way to know what a conversation actually costs, and the only way
   * to tell whether the cached prefix is working: a prompt below the model's
   * minimum cacheable length does not fail, it silently bills full price. Null
   * on user turns, which cost nothing to store.
   */
  usage jsonb,

  created_at timestamptz not null default now()
);

create index if not exists messages_conversation_idx
  on public.messages (conversation_id, created_at);

-- ── 3. Entitlements ─────────────────────────────────────────────────────
create table if not exists public.entitlements (
  user_id uuid primary key references auth.users (id) on delete cascade,

  tier text not null default 'free' check (tier in ('free', 'pro')),
  status text not null default 'active'
    check (status in ('active', 'in_grace', 'expired', 'cancelled')),

  /** How they came to be pro. Null while free. 'grant' is a person deciding. */
  source text check (source in ('apple', 'stripe', 'grant')),

  /** RevenueCat's app_user_id, set to this same uuid, kept for reconciliation. */
  rc_app_user_id text,
  expires_at timestamptz,

  /**
   * The free allowance, and it never resets.
   *
   * A monthly free tier is a monthly bill for people who will not convert.
   * Five messages is a taste of the thing, once.
   */
  lifetime_messages_used integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists entitlements_touch on public.entitlements;

create trigger entitlements_touch
  before update on public.entitlements
  for each row execute function public.touch_updated_at();

-- ── 4. Monthly usage, for the pro fair-use cap ──────────────────────────
create table if not exists public.chat_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  /** First of the month, UTC. */
  period_start date not null,
  messages_used integer not null default 0,
  primary key (user_id, period_start)
);

-- ── 5. Who may read and write any of it ─────────────────────────────────
alter table public.conversations enable row level security;
alter table public.messages      enable row level security;
alter table public.entitlements  enable row level security;
alter table public.chat_usage    enable row level security;

/*
 * Read your own; write almost nothing.
 *
 * Every row in all four tables is written server-side with the service role,
 * because each write is either a spend that has to be metered in the same
 * breath or a billing fact that only a receipt may establish. The app reads
 * straight from Supabase the way it already does for the catalogue and for
 * plans, so these policies are what make the chat screen work at all.
 */
drop policy if exists "conversations: own read" on public.conversations;
drop policy if exists "messages: own read" on public.messages;
drop policy if exists "entitlements: own read" on public.entitlements;
drop policy if exists "chat usage: own read" on public.chat_usage;

create policy "conversations: own read" on public.conversations
  for select using (auth.uid() = user_id);

create policy "messages: own read" on public.messages
  for select using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
  );

create policy "entitlements: own read" on public.entitlements
  for select using (auth.uid() = user_id);

create policy "chat usage: own read" on public.chat_usage
  for select using (auth.uid() = user_id);

/*
 * Renaming and hiding a conversation is the one write a person may do
 * directly, and it is narrowed by column grant rather than by policy: RLS
 * chooses the row and cannot choose the column, the same pairing 0023 used on
 * profiles for the same reason. Without the grant, "rename my chat" also
 * means "repoint my chat at somebody else's user_id".
 */
drop policy if exists "conversations: own update" on public.conversations;
drop policy if exists "conversations: own delete" on public.conversations;

create policy "conversations: own update" on public.conversations
  for update
  using (auth.uid() = user_id)
  -- Without the check, the row could be updated to carry another user's id.
  with check (auth.uid() = user_id);

create policy "conversations: own delete" on public.conversations
  for delete using (auth.uid() = user_id);

/*
 * Supabase grants anon and authenticated everything on a new table in public
 * by default, and RLS narrows rows rather than privileges. So the writes are
 * revoked explicitly and handed back one column at a time.
 *
 * entitlements is the one that matters. A person who can UPDATE their own
 * entitlements row can set tier = 'pro' on themselves, and the paywall is
 * then a suggestion. No policy fixes that, because the policy would be
 * satisfied: it is their row.
 */
revoke insert, update, delete on public.conversations from anon, authenticated;
revoke insert, update, delete on public.messages      from anon, authenticated;
revoke insert, update, delete on public.entitlements  from anon, authenticated;
revoke insert, update, delete on public.chat_usage    from anon, authenticated;

grant update (title, archived) on public.conversations to authenticated;
grant delete on public.conversations to authenticated;

-- Nothing here is public. A signed-out visitor has no conversation, no
-- allowance and no bill.
revoke select on public.conversations from anon;
revoke select on public.messages      from anon;
revoke select on public.entitlements  from anon;
revoke select on public.chat_usage    from anon;

-- ── 6. Spending a message ───────────────────────────────────────────────
/*
 * Check and increment in one statement, under a row lock.
 *
 * Read-then-write in the route loses to a double tap: two requests read four
 * used, two requests write five, and the fifth and sixth messages are both
 * free. The same race is how somebody gets past the cap on purpose. `for
 * update` on the entitlements row serialises one user's own turns and costs
 * nothing, since a person cannot usefully chat twice at once anyway.
 *
 * The two allowances are parameters rather than constants because the number
 * that matters is the one the code believes. A cap living in SQL needs a
 * migration to tune, and would drift from whatever the paywall screen tells
 * people they are getting.
 *
 * Returns rather than raises: "you are out of messages" is an ordinary answer
 * the route turns into a 402 and a paywall, not an error.
 */
create or replace function public.consume_chat_message(
  p_user_id uuid,
  p_free_lifetime integer default 5,
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
  v_lifetime integer;
  v_period date := date_trunc('month', (now() at time zone 'utc'))::date;
  v_used integer;
  v_pro boolean;
begin
  -- First chat of their life. The row is made on demand rather than by a
  -- trigger on signup, so existing accounts need no backfill.
  insert into public.entitlements (user_id) values (p_user_id)
  on conflict (user_id) do nothing;

  select e.tier, e.status, e.expires_at, e.lifetime_messages_used
    into v_tier, v_status, v_expires, v_lifetime
  from public.entitlements e
  where e.user_id = p_user_id
  for update;

  -- Grace is deliberately inside the gate: a card that failed to renew is a
  -- billing problem to chase, not a reason to shut someone out mid-sentence.
  v_pro := v_tier = 'pro'
       and v_status in ('active', 'in_grace')
       and (v_expires is null or v_expires > now());

  if v_pro then
    insert into public.chat_usage (user_id, period_start, messages_used)
    values (p_user_id, v_period, 0)
    on conflict (user_id, period_start) do nothing;

    select u.messages_used into v_used
    from public.chat_usage u
    where u.user_id = p_user_id and u.period_start = v_period;

    if v_used >= p_pro_monthly then
      return query select false, 'pro'::text, v_used, p_pro_monthly;
      return;
    end if;

    update public.chat_usage
       set messages_used = messages_used + 1
     where user_id = p_user_id and period_start = v_period;

    return query select true, 'pro'::text, v_used + 1, p_pro_monthly;
    return;
  end if;

  if v_lifetime >= p_free_lifetime then
    return query select false, 'free'::text, v_lifetime, p_free_lifetime;
    return;
  end if;

  update public.entitlements
     set lifetime_messages_used = lifetime_messages_used + 1
   where user_id = p_user_id;

  return query select true, 'free'::text, v_lifetime + 1, p_free_lifetime;
end;
$$;

/*
 * Only the server may call it. PostgREST exposes every function in public as
 * an RPC, and this one takes the user id as an argument, so left reachable it
 * would let anybody burn anybody else's allowance. The same reasoning, and
 * the same fix, that 0012 applied to the trigger functions.
 */
revoke execute on function public.consume_chat_message(uuid, integer, integer) from public;
revoke execute on function public.consume_chat_message(uuid, integer, integer) from anon, authenticated;

comment on function public.consume_chat_message(uuid, integer, integer) is
  'Atomically checks and spends one chat message against the caller''s allowance. Service role only: it trusts the user id it is handed.';
