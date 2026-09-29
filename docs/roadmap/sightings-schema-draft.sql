-- DRAFT (not a migration): the proposed provenance and verification schema from
-- docs/roadmap/sightings-architecture.md, written as runnable SQL so the design can be tested.
-- It was run on a local Postgres 16 + PostGIS copy of migrations 0001-0004 inside a transaction
-- that was rolled back (see "Scenario" at the end). Before it becomes real migrations it will be
-- split into the phases in docs/roadmap/README.md.

create extension if not exists pgcrypto with schema extensions;   -- already enabled on Supabase

-- ── Staff (moderators and admins) ──────────────────────────────────────────────────────────
create table public.staff (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('moderator', 'admin')),
  added_at timestamptz not null default now()
);
alter table public.staff enable row level security;
create policy "staff see themselves" on public.staff for select using (user_id = (select auth.uid()));

create function public.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff where user_id = auth.uid())
$$;

-- ── Regions (Marine Regions MRGIDs where they exist) ───────────────────────────────────────
create table public.regions (
  id text primary key,                          -- slug, e.g. 'northern-great-barrier-reef'
  name text not null,
  parent_id text references public.regions (id),
  mrgid integer unique,                         -- Marine Regions gazetteer id, when one fits
  country text
);
alter table public.regions enable row level security;
create policy "regions are public" on public.regions for select using (true);

-- ── Dive logs (optional parent of sightings; the redesigned logging builds on it) ──────────
create table public.dive_logs (
  id text primary key,                          -- client-generated, like sightings (offline-first)
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  site_id text references public.dive_sites (id),
  dived_on date not null,
  duration_min integer check (duration_min between 1 and 600),
  max_depth_m numeric(5, 1) check (max_depth_m between 0 and 350),
  notes text check (char_length(notes) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.dive_logs enable row level security;
create policy "own dive logs" on public.dive_logs for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ── Encounters: one animal event seen by several divers ───────────────────────────────────
create table public.encounters (
  id uuid primary key default gen_random_uuid(),
  species_id text not null references public.species (id),
  site_id text references public.dive_sites (id),
  observed_on date not null,
  created_at timestamptz not null default now()
);
alter table public.encounters enable row level security;
create policy "encounters are public" on public.encounters for select using (true);

-- ── Sightings: evolve the existing table (nothing dropped) ────────────────────────────────
alter table public.sightings
  add column dive_log_id text references public.dive_logs (id) on delete set null,
  add column status text not null default 'unverified'
    check (status in ('unverified', 'evidence_submitted', 'confirmed', 'accepted', 'rejected', 'disputed')),
  add column status_changed_at timestamptz,
  add column encounter_id uuid references public.encounters (id) on delete set null;

-- Clients may write the facts of their sighting, never its status or encounter.
revoke insert, update on public.sightings from anon, authenticated;
grant insert (id, user_id, species_id, site_id, sighted_on, notes, photo_url, created_at, dive_log_id) on public.sightings to authenticated;
grant update (species_id, site_id, sighted_on, notes, photo_url, dive_log_id) on public.sightings to authenticated;

-- Private details, readable only by their owner (notes move here from sightings over time).
create table public.sighting_details (
  sighting_id text primary key references public.sightings (id) on delete cascade,
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  notes text check (char_length(notes) <= 4000)
);
alter table public.sighting_details enable row level security;
create policy "own sighting details" on public.sighting_details for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ── Evidence (method A: photos) ────────────────────────────────────────────────────────────
create table public.evidence (
  id uuid primary key default gen_random_uuid(),
  sighting_id text not null references public.sightings (id) on delete cascade,
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  storage_path text not null unique,            -- private bucket 'sighting-evidence': <uid>/<evidence id>.<ext>
  sha256 text not null,                         -- exact duplicates (the same file used twice)
  phash text,                                   -- near duplicates, computed server-side later
  captured_at timestamptz,                      -- from the photo's metadata (kept private)
  flags text[] not null default '{}',           -- advisory: no_metadata, date_mismatch, far_from_site, reused_file
  status text not null default 'submitted' check (status in ('submitted', 'accepted', 'rejected')),
  reviewed_by uuid references public.staff (user_id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now()
);
alter table public.evidence enable row level security;
create policy "own evidence" on public.evidence for select using (user_id = (select auth.uid()) or (select public.is_staff()));
create policy "add evidence to own sighting" on public.evidence for insert with check (
  user_id = (select auth.uid()) and status = 'submitted' and reviewed_by is null
  and exists (select 1 from public.sightings s where s.id = sighting_id and s.user_id = (select auth.uid()))
);

-- ── Verification requests and attestations (method B: buddy / instructor) ─────────────────
create table public.verification_requests (
  id uuid primary key default gen_random_uuid(),
  sighting_id text not null references public.sightings (id) on delete cascade,
  requester_id uuid not null references public.profiles (user_id) on delete cascade,
  code_hash text not null unique,               -- sha256 of the code; the code itself is never stored
  expires_at timestamptz not null default now() + interval '7 days',
  max_uses integer not null default 1 check (max_uses between 1 and 10),
  uses integer not null default 0,
  status text not null default 'open' check (status in ('open', 'used', 'expired', 'revoked')),
  created_at timestamptz not null default now()
);
alter table public.verification_requests enable row level security;
create policy "own requests" on public.verification_requests for select using (requester_id = (select auth.uid()));

create table public.attestations (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.verification_requests (id) on delete cascade,
  sighting_id text not null references public.sightings (id) on delete cascade,
  verifier_id uuid not null references public.profiles (user_id) on delete cascade,
  role text not null check (role in ('buddy', 'instructor', 'divemaster', 'other')),
  decision text not null check (decision in ('saw_it', 'did_not_see', 'was_not_there')),
  created_at timestamptz not null default now(),
  unique (sighting_id, verifier_id)
);
alter table public.attestations enable row level security;
create policy "attestations on own sightings or by me" on public.attestations for select using (
  verifier_id = (select auth.uid())
  or exists (select 1 from public.sightings s where s.id = sighting_id and s.user_id = (select auth.uid()))
);

create table public.verification_attempts (       -- rate limiting for wrong codes
  user_id uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now()
);
alter table public.verification_attempts enable row level security;   -- no policies: functions only

-- ── Moderation decisions and user flags ────────────────────────────────────────────────────
create table public.moderation_decisions (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('sighting', 'evidence', 'external_sighting', 'dive_site', 'profile')),
  subject_id text not null,
  decision text not null check (decision in ('accept', 'reject', 'dispute', 'restore', 'retract')),
  reason text,
  staff_id uuid not null references public.staff (user_id),
  created_at timestamptz not null default now()
);
alter table public.moderation_decisions enable row level security;
create policy "staff read decisions" on public.moderation_decisions for select using ((select public.is_staff()));

create table public.flags (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('sighting', 'evidence', 'external_sighting', 'dive_site', 'profile')),
  subject_id text not null,
  reporter_id uuid not null references public.profiles (user_id) on delete cascade,
  reason text not null check (char_length(reason) <= 500),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (subject_type, subject_id, reporter_id)
);
alter table public.flags enable row level security;
create policy "flag as myself" on public.flags for insert with check (reporter_id = (select auth.uid()) and resolved_at is null);
create policy "see own flags" on public.flags for select using (reporter_id = (select auth.uid()) or (select public.is_staff()));

-- ── External sources, reports and their sightings ─────────────────────────────────────────
create table public.external_sources (
  id text primary key,                          -- 'pro-dive-cairns', 'inaturalist', 'gbrmpa-eye-on-the-reef'
  name text not null,
  kind text not null check (kind in ('dive_operator', 'research_program', 'government', 'citizen_science', 'dataset')),
  website text,
  agreement text not null default 'none' check (agreement in ('none', 'link_only', 'requested', 'granted', 'open_license')),
  agreement_ref text,                           -- where the permission or licence is recorded
  attribution text not null                     -- the credit line the app shows
);
alter table public.external_sources enable row level security;
create policy "sources are public" on public.external_sources for select using (true);

create table public.external_reports (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references public.external_sources (id),
  kind text not null check (kind in ('trip_report', 'newsletter', 'social_post', 'dataset_record', 'email', 'other')),
  external_id text,                             -- e.g. an iNaturalist observation id
  title text,
  url text,
  archive_url text,
  published_at timestamptz,                     -- when the source published it
  retrieved_at timestamptz not null default now(),
  last_checked_at timestamptz,
  summary text check (char_length(summary) <= 1000),   -- in our own words, never copied
  license text,
  commercial_use text not null default 'unknown' check (commercial_use in ('yes', 'no', 'unknown')),
  status text not null default 'draft' check (status in ('draft', 'in_review', 'published', 'retracted')),
  entered_by uuid references public.staff (user_id),
  reviewed_by uuid references public.staff (user_id),
  reviewed_at timestamptz,
  unique (source_id, external_id)
);
alter table public.external_reports enable row level security;
create policy "published reports are public" on public.external_reports for select using (status = 'published' or (select public.is_staff()));
create policy "staff manage reports" on public.external_reports for all using ((select public.is_staff())) with check ((select public.is_staff()));

create table public.external_sightings (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.external_reports (id) on delete cascade,
  species_id text references public.species (id),
  taxon_name text not null,                     -- as reported (scientific name preferred)
  site_id text references public.dive_sites (id),
  region_id text references public.regions (id),
  location_precision text not null check (location_precision in ('site', 'reef', 'region', 'hidden')),
  observed_start date,                          -- when the animal was seen: never the publication date
  observed_end date,
  observed_precision text not null check (observed_precision in ('day', 'range', 'month', 'unknown')),
  count_estimate integer check (count_estimate > 0),
  confidence text not null check (confidence in ('A', 'B', 'C')),   -- A: media checked by a reviewer; B: professional report; C: second-hand
  media_url text,
  media_credit text,
  media_rights text check (media_rights in ('open_license', 'permission', 'link_only')),
  sensitive boolean not null default false,     -- hide the exact place
  recent_until date,
  status text not null default 'published' check (status in ('published', 'retracted')),
  check (site_id is not null or region_id is not null),
  check (observed_end is null or observed_start is null or observed_end >= observed_start),
  check (observed_precision = 'unknown' or observed_start is not null)
);
alter table public.external_sightings enable row level security;
create policy "published external sightings are public" on public.external_sightings for select using (
  status = 'published' and exists (select 1 from public.external_reports r where r.id = report_id and r.status = 'published')
);
create policy "staff manage external sightings" on public.external_sightings for all using ((select public.is_staff())) with check ((select public.is_staff()));

-- ── Status: derived, only ever set by these functions ─────────────────────────────────────
create function public.refresh_sighting_status(target text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  computed text;
begin
  select case
    -- A moderator's latest decision on the sighting wins while it stands.
    when (select decision from public.moderation_decisions where subject_type = 'sighting' and subject_id = target order by created_at desc limit 1) = 'reject' then 'rejected'
    when (select decision from public.moderation_decisions where subject_type = 'sighting' and subject_id = target order by created_at desc limit 1) = 'dispute' then 'disputed'
    when exists (select 1 from public.evidence where sighting_id = target and status = 'accepted') then 'accepted'
    when exists (select 1 from public.attestations where sighting_id = target and decision = 'saw_it') then 'confirmed'
    when exists (select 1 from public.evidence where sighting_id = target and status = 'submitted') then 'evidence_submitted'
    when exists (select 1 from public.evidence where sighting_id = target and status = 'rejected') then 'rejected'
    else 'unverified' end
  into computed;
  update public.sightings set status = computed, status_changed_at = now() where id = target and status is distinct from computed;
  return computed;
end $$;
revoke all on function public.refresh_sighting_status(text) from public, anon, authenticated;

-- Editing what was seen, where or when voids earlier support: the sighting starts over.
create function public.sighting_facts_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (new.species_id, new.site_id, new.sighted_on) is distinct from (old.species_id, old.site_id, old.sighted_on) then
    delete from public.attestations where sighting_id = new.id;
    update public.evidence set status = 'rejected', review_note = 'sighting edited after submission' where sighting_id = new.id and status = 'submitted';
    new.status := 'unverified';
    new.status_changed_at := now();
  end if;
  return new;
end $$;
create trigger sighting_facts_changed before update on public.sightings
  for each row execute function public.sighting_facts_changed();

-- The requester creates a code for one of their sightings; the code is returned once, only its hash is kept.
create function public.create_verification_request(target text, uses integer default 1) returns text
language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';   -- Crockford base32: no I, L, O, U
  code text := '';
  bytes bytea := extensions.gen_random_bytes(10);
begin
  if caller is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if not exists (select 1 from public.sightings where id = target and user_id = caller) then
    raise exception 'Not your sighting' using errcode = '42501';
  end if;
  if (select count(*) from public.verification_requests where requester_id = caller and status = 'open' and expires_at > now()) >= 20 then
    raise exception 'Too many open requests' using errcode = 'P0001';
  end if;
  for i in 0..9 loop code := code || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1); end loop;   -- 50 random bits
  insert into public.verification_requests (sighting_id, requester_id, code_hash, max_uses)
    values (target, caller, encode(extensions.digest(code, 'sha256'), 'hex'), greatest(1, least(uses, 10)));
  return substr(code, 1, 5) || '-' || substr(code, 6, 5);
end $$;
revoke all on function public.create_verification_request(text, integer) from public, anon;
grant execute on function public.create_verification_request(text, integer) to authenticated;

-- A buddy (signed in, not the owner) answers a code: an attestation, never proof by itself.
-- Returns the sighting's new status, or 'invalid_code' (wrong, expired or used: the app says so).
create function public.attest(code text, decision text, verifier_role text default 'buddy') returns text
language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  req public.verification_requests;
  owner uuid;
  normalized text := upper(regexp_replace(code, '[^0-9A-Za-z]', '', 'g'));
begin
  if caller is null then raise exception 'Sign in to confirm a sighting' using errcode = '42501'; end if;
  if (select count(*) from public.verification_attempts where user_id = caller and at > now() - interval '1 hour') >= 10 then
    raise exception 'Too many wrong codes; try again later' using errcode = 'P0001';
  end if;
  select * into req from public.verification_requests
    where code_hash = encode(extensions.digest(normalized, 'sha256'), 'hex') for update;
  if req.id is null or req.status <> 'open' or req.expires_at <= now() or req.uses >= req.max_uses then
    -- Returned rather than raised: an error would roll this attempt back and defeat the rate limit.
    insert into public.verification_attempts (user_id) values (caller);
    return 'invalid_code';
  end if;
  select user_id into owner from public.sightings where id = req.sighting_id;
  if owner = caller or req.requester_id = caller then
    raise exception 'You cannot confirm your own sighting' using errcode = '42501';
  end if;
  if (select created_at from public.profiles where user_id = caller) > now() - interval '1 day' then
    raise exception 'New accounts can confirm sightings after their first day' using errcode = 'P0001';
  end if;
  insert into public.attestations (request_id, sighting_id, verifier_id, role, decision)
    values (req.id, req.sighting_id, caller, verifier_role, decision);
  update public.verification_requests set uses = uses + 1,
    status = case when uses + 1 >= max_uses then 'used' else 'open' end where id = req.id;
  return public.refresh_sighting_status(req.sighting_id);
end $$;
revoke all on function public.attest(text, text, text) from public, anon;
grant execute on function public.attest(text, text, text) to authenticated;

-- ── The public read model: only verified community sightings and published external ones ──
create view public.public_sightings with (security_invoker = true) as
  select 'community:' || s.id as id,
         'community_verified' as provenance,
         case s.status when 'accepted' then 'Photo reviewed' else 'Confirmed by a dive buddy' end as support,
         s.species_id, s.site_id, null::text as region_id,
         s.sighted_on as observed_start, s.sighted_on as observed_end, 'day' as observed_precision,
         s.created_at as published_at, p.username as reported_by, null::text as source_url
  from public.sightings s join public.profiles p on p.user_id = s.user_id
  where s.status in ('confirmed', 'accepted')
  union all
  select 'external:' || e.id, src.kind, r.kind, e.species_id,
         case when e.sensitive then null else e.site_id end, e.region_id,
         e.observed_start, e.observed_end, e.observed_precision,
         r.published_at, src.name, r.url
  from public.external_sightings e
  join public.external_reports r on r.id = e.report_id
  join public.external_sources src on src.id = r.source_id
  where e.status = 'published' and r.status = 'published';
grant select on public.public_sightings to anon, authenticated;
