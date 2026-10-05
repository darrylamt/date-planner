-- aduro, phone numbers become an approval-gated field.
--
-- The reservation flow hands a user to `venues.phone` over WhatsApp with a
-- message that says "sent via aduro". A wrong number there is not bad data,
-- it is fraud carried out under our name, and the two live attacks are
-- exactly that: fake map listings carrying a scammer's number, and real
-- listings whose number was swapped by a "suggest an edit".
--
-- So phone is treated differently from every other field. A number is
-- proposed by an import, the ingest tool or the verifier, and stays inert
-- until a human approves it. Nothing writes an approved number automatically.

create type phone_status as enum (
  'none',      -- no number on file
  'pending',   -- proposed, NOT usable, never shown, never dialled
  'approved',  -- a human checked it against a first-party source
  'rejected'   -- checked and wrong; kept so it cannot be re-proposed silently
);

alter table public.venues
  -- The number a human approved. This is the ONLY one the app may ever use.
  add column phone_status phone_status not null default 'none',
  -- A proposal waiting on review. Deliberately a separate column: an incoming
  -- number must never overwrite an approved one, which is precisely how a
  -- hijacked listing would propagate into the catalog.
  add column phone_pending text,
  -- Where the pending number came from, so a reviewer can weigh it. A venue's
  -- own domain is worth more than any number of directory listings, which
  -- copy from each other and can make one source look like three.
  add column phone_source text,
  add column phone_approved_at timestamptz,
  add column phone_approved_by uuid references auth.users (id) on delete set null,
  -- Set when a user reports a number as wrong. Takes effect immediately,
  -- before any review: a false report costs us a booking, a true one
  -- unreported costs someone their money.
  add column phone_reported_at timestamptz,
  add column phone_report_count int not null default 0;

-- Existing numbers are unreviewed by definition. Move them to pending rather
-- than grandfathering them in, they were imported from research with no
-- human check, which is the exact gap this closes.
update public.venues
set phone_pending = phone,
    phone_status = 'pending',
    phone_source = 'imported before review',
    phone = null
where phone is not null and phone <> '';

create index venues_phone_status_idx on public.venues (phone_status);

/**
 * Numbers appearing on more than one venue.
 *
 * Two venues sharing a number is almost never a coincidence, it is the
 * signature of one scammer attached to several listings. Cheap to check, and
 * it catches a whole cluster at once rather than one venue at a time.
 * Digits-only comparison, so formatting differences cannot hide a match.
 */
create or replace view public.venue_phone_collisions as
with numbers as (
  select
    id,
    name,
    coalesce(nullif(phone, ''), phone_pending) as number,
    regexp_replace(coalesce(nullif(phone, ''), phone_pending, ''), '\D', '', 'g') as digits
  from public.venues
  where coalesce(nullif(phone, ''), phone_pending) is not null
)
select
  digits,
  count(*) as venue_count,
  array_agg(name order by name) as venue_names,
  array_agg(id) as venue_ids
from numbers
where digits <> ''
group by digits
having count(*) > 1;

comment on view public.venue_phone_collisions is
  'Phone numbers shared by more than one venue, a scam-network signal.';

comment on column public.venues.phone is
  'Human-approved number. The only one the app may dial. Never written automatically.';
comment on column public.venues.phone_pending is
  'Proposed number awaiting review. Never shown to users, never dialled.';
