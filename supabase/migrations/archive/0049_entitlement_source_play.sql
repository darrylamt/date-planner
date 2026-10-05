-- Room for the store this catalogue does not sell on yet.
--
-- entitlements_source_check allowed 'apple', 'stripe' and 'grant'. The
-- webhook wrote 'app_store', so every real purchase was rejected by the
-- constraint, answered 500, and retried by RevenueCat for days while the
-- buyer looked at the paywall they had just paid to remove. Fixed in the
-- route, which now speaks this vocabulary.
--
-- 'play' is added here rather than left for later because the route maps
-- PLAY_STORE to it already: an Android build would otherwise reintroduce
-- exactly the same failure, in exactly the same silent way, on the day
-- somebody first bought something on a phone nobody tested with.
alter table public.entitlements
  drop constraint if exists entitlements_source_check;

alter table public.entitlements
  add constraint entitlements_source_check
  check (source is null or source in ('apple', 'play', 'stripe', 'grant'));

comment on column public.entitlements.source is
  'How they came to be pro. Null means the store was unrecognised, which is deliberate: the webhook writes null rather than a guess, because an unknown label must never fail the constraint and take the grant down with it. ''grant'' is a person deciding.';
