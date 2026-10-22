-- What each venue is like, as numbers (src/lib/embeddings.ts, src/lib/taste.ts).
--
-- One Gemini embedding per venue, read from what the catalogue says about it:
-- type, kitchens, vibe, what it suits, its price band, its area, and what the
-- study (0088) saw. Venues that are alike sit close together, which is what
-- lets a person's taste reach a place they have never been shown: someone
-- who keeps rooftop cocktail bars gets a nudge towards the rooftop cocktail
-- bar they have not met yet.
--
-- 256 numbers per venue. text_hash is the hash of the text it was made from,
-- so the nightly job only re-reads venues whose description has changed.
--
-- Service role only: the planner reads it on the server.

create table if not exists public.venue_embeddings (
  venue_id uuid primary key references public.venues (id) on delete cascade,
  embedding real[] not null,
  text_hash text not null,
  model text not null,
  updated_at timestamptz not null default now()
);

alter table public.venue_embeddings enable row level security;
revoke all on public.venue_embeddings from anon, authenticated;
