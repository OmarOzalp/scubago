-- ScubaGo initial schema (mirrors src/lib/types.ts).
-- Apply with the Supabase CLI (`supabase db push`) or paste into the SQL editor.

create extension if not exists postgis;

-- Public profile names (minimal social: username + derived species count).
-- sightings/dive_sites FK to profiles (not auth.users) so PostgREST can embed
-- profiles(username) when the app pulls sightings.
create table profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  username text unique not null check (char_length(username) between 3 and 24),
  created_at timestamptz not null default now()
);

-- Curated species catalog (seeded by scripts/seed-supabase.ts).
create table species (
  id text primary key,
  common_name text not null,
  scientific_name text not null,
  category text not null check (category in
    ('shark','ray','turtle','mammal','fish','cephalopod','macro','reptile','other')),
  rarity text not null check (rarity in
    ('common','uncommon','rare','epic','legendary')),
  blurb text not null default '',
  emoji text,
  photo_url text,
  photo_attribution text
);

-- Dive sites: seeded + user-added. lat/lng are what the app reads/writes;
-- location is generated from them so spatial queries stay possible.
create table dive_sites (
  id text primary key,
  name text not null,
  lat double precision not null,
  lng double precision not null,
  location geography(point, 4326) generated always as
    (st_setsrid(st_makepoint(lng, lat), 4326)::geography) stored,
  region text not null default '',
  country text not null default '',
  blurb text not null default '',
  notable_species text[] not null default '{}',
  source text not null default 'user' check (source in ('seed', 'user')),
  created_by uuid references profiles (user_id),
  created_at timestamptz not null default now()
);

create index dive_sites_location_idx on dive_sites using gist (location);

create table sightings (
  id text primary key,
  user_id uuid not null references profiles (user_id),
  species_id text not null references species (id),
  site_id text not null references dive_sites (id),
  sighted_on date not null,
  notes text,
  photo_url text, -- public URL in the sighting-photos bucket
  created_at timestamptz not null default now()
);

create index sightings_site_idx on sightings (site_id);
create index sightings_species_idx on sightings (species_id);
create index sightings_user_idx on sightings (user_id);

-- Row-level security: everything publicly readable, owners write their own rows.
alter table species enable row level security;
alter table dive_sites enable row level security;
alter table sightings enable row level security;
alter table profiles enable row level security;

create policy "species are public" on species for select using (true);
create policy "sites are public" on dive_sites for select using (true);
create policy "sightings are public" on sightings for select using (true);
create policy "profiles are public" on profiles for select using (true);

create policy "users add sites" on dive_sites
  for insert with check (auth.uid() = created_by and source = 'user');

create policy "users log own sightings" on sightings
  for insert with check (auth.uid() = user_id);
create policy "users edit own sightings" on sightings
  for update using (auth.uid() = user_id);
create policy "users delete own sightings" on sightings
  for delete using (auth.uid() = user_id);

create policy "users manage own profile" on profiles
  for insert with check (auth.uid() = user_id);
create policy "users update own profile" on profiles
  for update using (auth.uid() = user_id);

-- Sighting photos: public-read bucket; users write only inside their own
-- <uid>/ folder (photo paths are <uid>/<sighting-id>.<ext>).
insert into storage.buckets (id, name, public)
values ('sighting-photos', 'sighting-photos', true);

create policy "photos are public" on storage.objects
  for select using (bucket_id = 'sighting-photos');
create policy "users upload own photos" on storage.objects
  for insert with check (
    bucket_id = 'sighting-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
create policy "users replace own photos" on storage.objects
  for update using (
    bucket_id = 'sighting-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
