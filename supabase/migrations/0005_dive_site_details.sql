-- Dive-site details, regions and provenance (docs/roadmap/dive-site-data.md, phase 2a).
-- Additive only: every new column is optional (or has an empty default), so existing sites,
-- sightings and older app versions are unaffected.

-- A region hierarchy (e.g. Great Barrier Reef → Cairns/Cooktown), with Marine Regions ids where one fits.
create table public.regions (
  id text primary key,
  name text not null,
  parent_id text references public.regions (id),
  country text,
  mrgid integer unique,
  source text not null default ''
);
alter table public.regions enable row level security;
create policy "regions are public" on public.regions for select using (true);

-- What a diver wants to know before going. Missing values stay empty: the app shows nothing rather than a guess.
alter table public.dive_sites
  add column region_id text references public.regions (id),
  add column depth_min_m numeric(5, 1) check (depth_min_m between 0 and 150),
  add column depth_max_m numeric(5, 1) check (depth_max_m between 0 and 150),
  add column difficulty text check (difficulty in ('beginner', 'intermediate', 'advanced', 'technical')),
  add column dive_types text[] not null default '{}'
    check (dive_types <@ array['reef', 'wall', 'wreck', 'drift', 'pinnacle', 'bommie', 'muck', 'cave', 'swim-through', 'pier']::text[]),
  add column access text[] not null default '{}' check (access <@ array['boat', 'shore', 'liveaboard']::text[]),
  add column conditions text not null default '' check (char_length(conditions) <= 500),
  add column updated_at timestamptz not null default now(),
  add constraint dive_sites_depth_order check (depth_min_m is null or depth_max_m is null or depth_min_m <= depth_max_m);

-- The same place in other datasets, so several sources never create duplicates of one site.
create table public.site_external_ids (
  site_id text not null references public.dive_sites (id) on delete cascade,
  scheme text not null check (scheme in ('wikidata', 'gbrmpa', 'rls', 'auchd', 'mrgid', 'osm', 'partner')),
  external_id text not null,
  relation text not null default 'same_as' check (relation in ('same_as', 'on_reef', 'within_region', 'near')),
  retrieved_at date,
  primary key (site_id, scheme, external_id),
  unique (scheme, external_id, relation)
);
alter table public.site_external_ids enable row level security;
create policy "site ids are public" on public.site_external_ids for select using (true);

-- Where each fact about a site came from (shown in the app as the site's sources).
create table public.site_field_sources (
  site_id text not null references public.dive_sites (id) on delete cascade,
  field text not null check (field in ('name', 'location', 'region', 'description', 'depth', 'difficulty', 'dive_types', 'access', 'conditions', 'species')),
  source text not null,
  url text,
  license text,
  retrieved_at date,
  primary key (site_id, field, source)
);
alter table public.site_field_sources enable row level security;
create policy "site sources are public" on public.site_field_sources for select using (true);
-- Regions, ids and sources are written only by the seed script (secret key), never by the app.
