-- 0009: the dive log.
--
-- Each dive becomes a page of the diver's log: its number (the diver's lifetime count), site, date,
-- times, depths, conditions, gas and gear, buddy, dive centre, notes and a buddy's signature. The
-- animals seen on it stay sightings, now pointing at their dive. Pages are private: only the diver
-- who wrote them can read or change them. A buddy can sign a page from their own phone with a
-- short code (like "Ask a buddy" in 0006), and only the functions below write those signatures.
--
-- Additive only, and safe for older app versions: one new nullable column on sightings (existing
-- rows keep no dive), and new tables and functions. Older apps never send dive_id, so nothing they
-- send is refused. The one check on sightings (a sighting may only point at its owner's own page)
-- only looks at rows that set a dive.

create extension if not exists pgcrypto with schema extensions;   -- already enabled on Supabase

-- ── Pages ──────────────────────────────────────────────────────────────────────────────────
create table if not exists public.dives (
  id text primary key check (char_length(id) between 1 and 80),
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  number integer not null check (number between 1 and 100000),
  site_id text not null references public.dive_sites (id),
  dived_on date not null,
  time_in time,
  bottom_time_min numeric(5, 1) check (bottom_time_min between 1 and 600),
  max_depth_m numeric(5, 1) check (max_depth_m between 0 and 350),
  avg_depth_m numeric(5, 1) check (avg_depth_m between 0 and 350),
  water_temp_c numeric(4, 1) check (water_temp_c between -3 and 40),
  air_temp_c numeric(4, 1) check (air_temp_c between -40 and 55),
  visibility_m numeric(5, 1) check (visibility_m between 0 and 100),
  water_current text check (water_current in ('none', 'light', 'moderate', 'strong')),
  surface text check (surface in ('calm', 'choppy', 'rough')),
  entry text check (entry in ('boat', 'shore', 'liveaboard')),
  kinds text[] not null default '{}'
    check (kinds <@ array['reef', 'wall', 'wreck', 'drift', 'night', 'muck', 'cave', 'deep', 'training']::text[]),
  gas text check (gas in ('air', 'nitrox', 'trimix')),
  o2_percent numeric(4, 1) check (o2_percent between 21 and 100),
  tank_l numeric(4, 1) check (tank_l between 1 and 30),
  tank_material text check (tank_material in ('aluminium', 'steel')),
  pressure_start_bar numeric(5, 1) check (pressure_start_bar between 0 and 350),
  pressure_end_bar numeric(5, 1) check (pressure_end_bar between 0 and 350),
  weight_kg numeric(4, 1) check (weight_kg between 0 and 40),
  suit text check (suit in ('none', 'skin', 'shorty', 'wet3', 'wet5', 'wet7', 'semidry', 'dry')),
  rating smallint check (rating between 1 and 5),
  buddy_name text check (char_length(buddy_name) <= 80),
  -- The dive centre, typed by the diver: the app draws it as a stamp marked "not verified".
  centre_name text check (char_length(centre_name) <= 80),
  notes text check (char_length(notes) <= 4000),
  -- A signature made on the diver's own phone (the buddy signs it there, on the boat). The diver
  -- holds the phone, so this is as good as a paper log, no better: the app says so.
  signature_name text check (char_length(signature_name) <= 80),
  signature_svg text check (char_length(signature_svg) <= 20000 and signature_svg ~ '^([ML]-?[0-9]+(\.[0-9]+)?,-?[0-9]+(\.[0-9]+)?)+$'),
  signature_role text check (signature_role in ('buddy', 'instructor', 'divemaster', 'guide', 'other')),
  signed_at timestamptz,
  -- A page made from sightings logged before the dive log: only the site and date are known.
  from_sightings boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dives_depths_in_order check (avg_depth_m is null or max_depth_m is null or avg_depth_m <= max_depth_m),
  constraint dives_pressures_in_order check (pressure_end_bar is null or pressure_start_bar is null or pressure_end_bar <= pressure_start_bar),
  constraint dives_signed_whole check ((signature_name is null) = (signed_at is null))
);
create index if not exists dives_user_idx on public.dives (user_id, number);

alter table public.dives enable row level security;
revoke all on public.dives from anon;
drop policy if exists "own dives" on public.dives;
create policy "own dives" on public.dives for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ── Sightings on pages ─────────────────────────────────────────────────────────────────────
alter table public.sightings
  add column if not exists dive_id text references public.dives (id) on delete set null;
create index if not exists sightings_dive_idx on public.sightings (dive_id);

-- A sighting may only point at a page of its own diver's log. Runs as the caller, so another
-- diver's page is invisible to it (row-level security) as well as refused.
create or replace function public.sighting_on_own_dive() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.dive_id is not null and (tg_op = 'INSERT' or new.dive_id is distinct from old.dive_id)
     and not exists (select 1 from public.dives d where d.id = new.dive_id and d.user_id = new.user_id) then
    raise exception 'A sighting can only be on your own dive' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists sightings_3_own_dive on public.sightings;
create trigger sightings_3_own_dive before insert or update on public.sightings
  for each row execute function public.sighting_on_own_dive();

-- A page moved to another site or day loses its signatures: they were given for the old facts, as
-- a buddy's confirmation of a sighting is (0006). Renumbering keeps them: it is the same dive.
-- Definer, because nobody may delete signatures directly.
create or replace function public.dive_void_signatures() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.site_id is distinct from old.site_id or new.dived_on is distinct from old.dived_on then
    delete from public.dive_signatures where dive_id = new.id;
    new.signature_name := null;
    new.signature_svg := null;
    new.signature_role := null;
    new.signed_at := null;
  end if;
  return new;
end $$;
drop trigger if exists dives_void_signatures on public.dives;
create trigger dives_void_signatures before update on public.dives
  for each row execute function public.dive_void_signatures();

-- ── Signatures from a buddy's own phone ────────────────────────────────────────────────────
create table if not exists public.dive_signature_requests (
  id uuid primary key default gen_random_uuid(),
  dive_id text not null references public.dives (id) on delete cascade,
  requester_id uuid not null references public.profiles (user_id) on delete cascade,
  code_hash text not null unique,               -- sha256 of the code; the code itself is never stored
  expires_at timestamptz not null default now() + interval '7 days',
  max_uses integer not null default 3 check (max_uses between 1 and 10),
  uses integer not null default 0,
  status text not null default 'open' check (status in ('open', 'used', 'expired', 'revoked')),
  created_at timestamptz not null default now()
);
create index if not exists dive_signature_requests_dive_idx on public.dive_signature_requests (dive_id);
create index if not exists dive_signature_requests_requester_idx on public.dive_signature_requests (requester_id, created_at);
alter table public.dive_signature_requests enable row level security;
drop policy if exists "own dive signature requests" on public.dive_signature_requests;
create policy "own dive signature requests" on public.dive_signature_requests for select
  using (requester_id = (select auth.uid()));
revoke insert, update, delete, truncate on public.dive_signature_requests from anon, authenticated;

create table if not exists public.dive_signatures (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.dive_signature_requests (id) on delete cascade,
  dive_id text not null references public.dives (id) on delete cascade,
  signer_id uuid not null references public.profiles (user_id) on delete cascade,
  signer_name text not null check (char_length(signer_name) between 1 and 80),
  -- What the signer says they were (a claim, not a checked credential: the app says so).
  role text not null check (role in ('buddy', 'instructor', 'divemaster', 'guide', 'other')),
  signature_svg text check (char_length(signature_svg) <= 20000 and signature_svg ~ '^([ML]-?[0-9]+(\.[0-9]+)?,-?[0-9]+(\.[0-9]+)?)+$'),
  created_at timestamptz not null default now(),
  unique (dive_id, signer_id)
);
create index if not exists dive_signatures_signer_idx on public.dive_signatures (signer_id, created_at);
alter table public.dive_signatures enable row level security;
-- The page's owner sees every signature on it; a signer sees their own.
drop policy if exists "signatures on own dives or by me" on public.dive_signatures;
create policy "signatures on own dives or by me" on public.dive_signatures for select using (
  signer_id = (select auth.uid())
  or exists (select 1 from public.dives d where d.id = dive_id and d.user_id = (select auth.uid()))
);
revoke insert, update, delete, truncate on public.dive_signatures from anon, authenticated;

-- The diver creates a code for one of their pages. The code is returned once; only its hash is kept.
-- "D" and 9 characters of Crockford base32 (45 random bits), shown as DXXXX-XXXXX, so the app can
-- tell a page's code from a sighting's.
create or replace function public.create_dive_signature_request(target text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  code text := 'D';
  bytes bytea := extensions.gen_random_bytes(9);
  request public.dive_signature_requests;
begin
  if caller is null then raise exception 'Sign in to ask a buddy to sign' using errcode = '42501'; end if;
  if not exists (select 1 from public.dives where id = target and user_id = caller) then
    raise exception 'You can only ask about your own dives' using errcode = '42501';
  end if;
  if (select count(*) from public.dive_signature_requests where requester_id = caller and status = 'open' and expires_at > now()) >= 20
     or (select count(*) from public.dive_signature_requests where requester_id = caller and created_at > now() - interval '1 day') >= 30 then
    raise exception 'Too many codes for now; try again tomorrow' using errcode = 'P0001';
  end if;
  for i in 0..8 loop code := code || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1); end loop;
  insert into public.dive_signature_requests (dive_id, requester_id, code_hash)
    values (target, caller, encode(extensions.digest(code, 'sha256'), 'hex'))
    returning * into request;
  return jsonb_build_object('id', request.id, 'code', substr(code, 1, 5) || '-' || substr(code, 6, 5),
    'expires_at', request.expires_at, 'max_uses', request.max_uses);
end $$;

-- The request a code stands for, if it may still be used; wrong or stale codes count towards the
-- same limit as sighting codes (verification_attempts, 10 an hour).
create or replace function public.dive_signature_lookup(code text, caller uuid, out request public.dive_signature_requests, out outcome text)
language plpgsql security definer set search_path = '' as $$
declare
  normalized text := upper(regexp_replace(coalesce(code, ''), '[^0-9A-Za-z]', '', 'g'));
begin
  if (select count(*) from public.verification_attempts where user_id = caller and at > now() - interval '1 hour') >= 10 then
    outcome := 'rate_limited';
    return;
  end if;
  select * into request from public.dive_signature_requests
    where code_hash = encode(extensions.digest(normalized, 'sha256'), 'hex') for update;
  if request.id is null then outcome := 'invalid_code';
  elsif request.status <> 'open' or request.expires_at <= now() or request.uses >= request.max_uses then outcome := 'expired';
  else outcome := 'ok';
  end if;
  if outcome <> 'ok' then insert into public.verification_attempts (user_id) values (caller); end if;
end $$;
revoke all on function public.dive_signature_lookup(text, uuid) from public, anon, authenticated;

-- What a code asks the buddy to sign, without signing: the page's number, site, date and numbers.
create or replace function public.preview_dive_signature(code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  found record;
  d public.dives;
begin
  if caller is null then raise exception 'Sign in to sign a dive' using errcode = '42501'; end if;
  select * into found from public.dive_signature_lookup(code, caller);
  if found.outcome <> 'ok' then return jsonb_build_object('result', found.outcome); end if;
  select * into d from public.dives where id = (found.request).dive_id;
  if d.user_id = caller then return jsonb_build_object('result', 'own_dive'); end if;
  return jsonb_build_object(
    'result', 'ok',
    'dive', jsonb_build_object('id', d.id, 'number', d.number, 'site_id', d.site_id, 'dived_on', d.dived_on,
      'time_in', d.time_in, 'bottom_time_min', d.bottom_time_min, 'max_depth_m', d.max_depth_m,
      'buddy_name', d.buddy_name, 'centre_name', d.centre_name),
    'site_name', (select name from public.dive_sites where id = d.site_id),
    'owner', (select username from public.profiles where user_id = d.user_id),
    'expires_at', (found.request).expires_at,
    'signed', exists (select 1 from public.dive_signatures where dive_id = d.id and signer_id = caller));
end $$;

-- A buddy (signed in, not the owner) signs, having seen the page: `expected_*` are what they were
-- shown, so a page changed in the meantime is never signed unseen. One signature per diver per
-- page; 30 a day at most.
create or replace function public.sign_dive(code text, signer_name text, signer_role text, signature text,
  expected_number integer, expected_site text, expected_date date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  found record;
  d public.dives;
  clean_name text := btrim(regexp_replace(coalesce(signer_name, ''), '\s+', ' ', 'g'));
begin
  if caller is null then raise exception 'Sign in to sign a dive' using errcode = '42501'; end if;
  if signer_role not in ('buddy', 'instructor', 'divemaster', 'guide', 'other') then
    raise exception 'Unknown role' using errcode = '22023';
  end if;
  if char_length(clean_name) not between 1 and 80 then raise exception 'Write your name to sign' using errcode = '22023'; end if;
  if signature is not null and (char_length(signature) > 20000 or signature !~ '^([ML]-?[0-9]+(\.[0-9]+)?,-?[0-9]+(\.[0-9]+)?)+$') then
    raise exception 'That signature can''t be read' using errcode = '22023';
  end if;
  select * into found from public.dive_signature_lookup(code, caller);
  if found.outcome <> 'ok' then return jsonb_build_object('result', found.outcome); end if;
  select * into d from public.dives where id = (found.request).dive_id;
  if d.user_id = caller or (found.request).requester_id = caller then return jsonb_build_object('result', 'own_dive'); end if;
  if (d.number, d.site_id, d.dived_on) is distinct from (expected_number, expected_site, expected_date) then
    return jsonb_build_object('result', 'changed');
  end if;
  if (select count(*) from public.dive_signatures where signer_id = caller and created_at > now() - interval '1 day') >= 30 then
    return jsonb_build_object('result', 'rate_limited');
  end if;
  begin
    insert into public.dive_signatures (request_id, dive_id, signer_id, signer_name, role, signature_svg)
      values ((found.request).id, d.id, caller, clean_name, signer_role, signature);
  exception when unique_violation then
    return jsonb_build_object('result', 'already_signed');
  end;
  update public.dive_signature_requests set uses = uses + 1,
    status = case when uses + 1 >= max_uses then 'used' else 'open' end where id = (found.request).id;
  return jsonb_build_object('result', 'ok');
end $$;

-- The diver withdraws a code.
create or replace function public.revoke_dive_signature_request(request uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  update public.dive_signature_requests set status = 'revoked'
    where id = request and requester_id = auth.uid() and status = 'open';
end $$;

revoke all on function public.create_dive_signature_request(text) from public, anon;
revoke all on function public.preview_dive_signature(text) from public, anon;
revoke all on function public.sign_dive(text, text, text, text, integer, text, date) from public, anon;
revoke all on function public.revoke_dive_signature_request(uuid) from public, anon;
grant execute on function public.create_dive_signature_request(text) to authenticated;
grant execute on function public.preview_dive_signature(text) to authenticated;
grant execute on function public.sign_dive(text, text, text, text, integer, text, date) to authenticated;
grant execute on function public.revoke_dive_signature_request(uuid) to authenticated;
-- Trigger functions are not callable as RPCs.
revoke all on function public.sighting_on_own_dive() from public, anon, authenticated;
revoke all on function public.dive_void_signatures() from public, anon, authenticated;
