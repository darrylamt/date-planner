-- 0110: Duro Pro bought on duroplans.com through Paystack (14 Nov 2026).
--
-- Card, MTN MoMo or Telecel Cash on the website; the app reads the same
-- entitlements row, so a web subscriber is Pro in the app when signed in.
-- Paystack's codes are kept on the row so a renewal (which carries no
-- metadata) finds its account, and "Manage subscription" finds its
-- subscription. Written only by the server (service role), like the rest of
-- the row.

alter table public.entitlements drop constraint if exists entitlements_source_check;
alter table public.entitlements
  add constraint entitlements_source_check
  check (source is null or source in ('apple', 'play', 'stripe', 'grant', 'paystack'));

alter table public.entitlements add column if not exists paystack_customer text;
alter table public.entitlements add column if not exists paystack_subscription text;
alter table public.entitlements add column if not exists paystack_plan text;

create index if not exists entitlements_paystack_customer on public.entitlements (paystack_customer) where paystack_customer is not null;
