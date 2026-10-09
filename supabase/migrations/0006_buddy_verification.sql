-- Buddy verification ("Ask a buddy"; docs/roadmap/sightings-architecture.md, phase 5a), from the
-- tested draft in docs/roadmap/sightings-schema-draft.sql.
--
-- A diver asks someone who was on the dive to confirm a sighting. The owner creates a short code
-- for one sighting and shares it; the buddy, signed in, looks the code up, sees exactly what they
-- are confirming (species, site, date), and answers. Only the functions below ever change a
-- sighting's status; the app can't.
--
-- Additive and safe for older app versions: two columns on sightings (existing rows become
-- 'unverified'), three new tables, triggers and functions. Nothing older apps send is refused.

create extension if not exists pgcrypto with schema extensions;   -- already enabled on Supabase

-- ── Status on sightings ────────────────────────────────────────────────────────────────────
alter table public.sightings
  add column status text not null default 'unverified'
    check (status in ('unverified', 'evidence_submitted', 'confirmed', 'accepted', 'rejected', 'disputed')),
  add column status_changed_at timestamptz;

-- The app never sets a status: a new sighting always starts unverified, and an update that tries to
-- change it is refused. (Runs as the caller; the functions below run as their owner, so they can.)
create function public.guard_sighting_status() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user not in ('anon', 'authenticated') then return new; end if;
  if tg_op = 'INSERT' then
    new.status := 'unverified';
    new.status_changed_at := null;
  elsif new.status is distinct from old.status or new.status_changed_at is distinct from old.status_changed_at then
    raise exception 'A sighting''s status is set by ScubaGo, not by the app' using errcode = '42501';
  end if;
  return new;
end $$;
-- Triggers fire in name order: the guard sees the caller's own change before the next one resets it.
create trigger sightings_1_guard_status before insert or update on public.sightings
  for each row execute function public.guard_sighting_status();

-- ── Requests, answers, wrong guesses ───────────────────────────────────────────────────────
create table public.verification_requests (
  id uuid primary key default gen_random_uuid(),
  sighting_id text not null references public.sightings (id) on delete cascade,
  requester_id uuid not null references public.profiles (user_id) on delete cascade,
  code_hash text not null unique,               -- sha256 of the code; the code itself is never stored
  expires_at timestamptz not null default now() + interval '7 days',
  max_uses integer not null default 3 check (max_uses between 1 and 10),
  uses integer not null default 0,
  status text not null default 'open' check (status in ('open', 'used', 'expired', 'revoked')),
  created_at timestamptz not null default now()
);
create index verification_requests_sighting_idx on public.verification_requests (sighting_id);
create index verification_requests_requester_idx on public.verification_requests (requester_id, created_at);
alter table public.verification_requests enable row level security;
create policy "own requests" on public.verification_requests for select using (requester_id = (select auth.uid()));
revoke insert, update, delete, truncate on public.verification_requests from anon, authenticated;

create table public.attestations (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.verification_requests (id) on delete cascade,
  sighting_id text not null references public.sightings (id) on delete cascade,
  verifier_id uuid not null references public.profiles (user_id) on delete cascade,
  -- What the verifier says they were (a claim, not a checked credential: the app says so).
  role text not null check (role in ('buddy', 'instructor', 'divemaster', 'other')),
  decision text not null check (decision in ('saw_it', 'did_not_see', 'was_not_there')),
  created_at timestamptz not null default now(),
  unique (sighting_id, verifier_id)
);
create index attestations_verifier_idx on public.attestations (verifier_id, created_at);
alter table public.attestations enable row level security;
-- The sighting's owner sees every answer (a decline too); a verifier sees their own.
create policy "attestations on own sightings or by me" on public.attestations for select using (
  verifier_id = (select auth.uid())
  or exists (select 1 from public.sightings s where s.id = sighting_id and s.user_id = (select auth.uid()))
);
revoke insert, update, delete, truncate on public.attestations from anon, authenticated;

create table public.verification_attempts (       -- wrong or stale codes, for rate limiting
  user_id uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now()
);
create index verification_attempts_user_idx on public.verification_attempts (user_id, at);
alter table public.verification_attempts enable row level security;   -- no policies: functions only
revoke all on public.verification_attempts from anon, authenticated;

-- ── Status: derived from the answers, set only here ────────────────────────────────────────
-- (Photo evidence and moderation, later phases, extend this function.)
create function public.refresh_sighting_status(target text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  computed text;
begin
  select case when exists (select 1 from public.attestations where sighting_id = target and decision = 'saw_it')
    then 'confirmed' else 'unverified' end into computed;
  update public.sightings set status = computed, status_changed_at = now() where id = target and status is distinct from computed;
  return computed;
end $$;
revoke all on function public.refresh_sighting_status(text) from public, anon, authenticated;

-- Changing what was seen, where or when voids the confirmations: they were for the old facts.
create function public.sighting_facts_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (new.species_id, new.site_id, new.sighted_on) is distinct from (old.species_id, old.site_id, old.sighted_on) then
    perform set_config('scubago.editing_sighting', new.id, true);
    delete from public.attestations where sighting_id = new.id;
    perform set_config('scubago.editing_sighting', '', true);
    new.status := 'unverified';
    new.status_changed_at := now();
  end if;
  return new;
end $$;
create trigger sightings_2_facts_changed before update on public.sightings
  for each row execute function public.sighting_facts_changed();

-- An answer that disappears (its verifier deleted their account) no longer counts.
create function public.attestation_removed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Not while an edit is voiding them (that sets the status itself).
  if current_setting('scubago.editing_sighting', true) is distinct from old.sighting_id then
    perform public.refresh_sighting_status(old.sighting_id);
  end if;
  return null;
end $$;
create trigger attestation_removed after delete on public.attestations
  for each row execute function public.attestation_removed();

-- ── Asking ─────────────────────────────────────────────────────────────────────────────────
-- The owner creates a code for one of their sightings. The code is returned once; only its hash is
-- kept. 10 characters of Crockford base32 (50 random bits, no I, L, O or U), shown as XXXXX-XXXXX.
create function public.create_verification_request(target text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  code text := '';
  bytes bytea := extensions.gen_random_bytes(10);
  request public.verification_requests;
begin
  if caller is null then raise exception 'Sign in to ask a buddy' using errcode = '42501'; end if;
  if not exists (select 1 from public.sightings where id = target and user_id = caller) then
    raise exception 'You can only ask about your own sightings' using errcode = '42501';
  end if;
  if (select count(*) from public.verification_requests where requester_id = caller and status = 'open' and expires_at > now()) >= 20
     or (select count(*) from public.verification_requests where requester_id = caller and created_at > now() - interval '1 day') >= 30 then
    raise exception 'Too many codes for now; try again tomorrow' using errcode = 'P0001';
  end if;
  for i in 0..9 loop code := code || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1); end loop;
  insert into public.verification_requests (sighting_id, requester_id, code_hash)
    values (target, caller, encode(extensions.digest(code, 'sha256'), 'hex'))
    returning * into request;
  return jsonb_build_object('id', request.id, 'code', substr(code, 1, 5) || '-' || substr(code, 6, 5),
    'expires_at', request.expires_at, 'max_uses', request.max_uses);
end $$;

-- The owner withdraws a code (a new one replaces it, or it was shared by mistake).
create function public.revoke_verification_request(request uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  update public.verification_requests set status = 'revoked'
    where id = request and requester_id = auth.uid() and status = 'open';
end $$;

-- ── Answering ──────────────────────────────────────────────────────────────────────────────
-- The request a code stands for, if it may still be answered; counts wrong or stale codes and stops
-- after 10 in an hour. Outcomes are returned, not raised: an error would roll the count back.
create function public.verification_lookup(code text, caller uuid, out request public.verification_requests, out outcome text)
language plpgsql security definer set search_path = '' as $$
declare
  normalized text := upper(regexp_replace(coalesce(code, ''), '[^0-9A-Za-z]', '', 'g'));
begin
  if (select count(*) from public.verification_attempts where user_id = caller and at > now() - interval '1 hour') >= 10 then
    outcome := 'rate_limited';
    return;
  end if;
  select * into request from public.verification_requests
    where code_hash = encode(extensions.digest(normalized, 'sha256'), 'hex') for update;
  if request.id is null then outcome := 'invalid_code';
  elsif request.status <> 'open' or request.expires_at <= now() or request.uses >= request.max_uses then outcome := 'expired';
  else outcome := 'ok';
  end if;
  if outcome <> 'ok' then insert into public.verification_attempts (user_id) values (caller); end if;
end $$;
revoke all on function public.verification_lookup(text, uuid) from public, anon, authenticated;

-- What a code asks the buddy to confirm, without answering it: the app shows this first.
create function public.preview_verification(code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  found record;
  s public.sightings;
begin
  if caller is null then raise exception 'Sign in to confirm a sighting' using errcode = '42501'; end if;
  select * into found from public.verification_lookup(code, caller);
  if found.outcome <> 'ok' then return jsonb_build_object('result', found.outcome); end if;
  select * into s from public.sightings where id = (found.request).sighting_id;
  if s.user_id = caller then return jsonb_build_object('result', 'own_sighting'); end if;
  return jsonb_build_object(
    'result', 'ok',
    'sighting', jsonb_build_object('id', s.id, 'user_id', s.user_id, 'species_id', s.species_id, 'site_id', s.site_id,
      'sighted_on', s.sighted_on, 'notes', s.notes, 'photo_url', s.photo_url, 'status', s.status),
    'site_name', (select name from public.dive_sites where id = s.site_id),
    'owner', (select username from public.profiles where user_id = s.user_id),
    'expires_at', (found.request).expires_at,
    'answered', (select decision from public.attestations where sighting_id = s.id and verifier_id = caller));
end $$;

-- A buddy (signed in, not the owner) answers, having seen the sighting: `expected_*` are the facts
-- they were shown, so an edit in the meantime is never confirmed unseen. Returns the outcome and,
-- once answered, the sighting's status. One answer per diver per sighting; 30 answers a day at most.
create function public.attest(code text, decision text, verifier_role text,
  expected_species text, expected_site text, expected_date date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  found record;
  s public.sightings;
begin
  if caller is null then raise exception 'Sign in to confirm a sighting' using errcode = '42501'; end if;
  if decision not in ('saw_it', 'did_not_see', 'was_not_there') or verifier_role not in ('buddy', 'instructor', 'divemaster', 'other') then
    raise exception 'Unknown answer' using errcode = '22023';
  end if;
  select * into found from public.verification_lookup(code, caller);
  if found.outcome <> 'ok' then return jsonb_build_object('result', found.outcome); end if;
  select * into s from public.sightings where id = (found.request).sighting_id;
  if s.user_id = caller or (found.request).requester_id = caller then return jsonb_build_object('result', 'own_sighting'); end if;
  if (s.species_id, s.site_id, s.sighted_on) is distinct from (expected_species, expected_site, expected_date) then
    return jsonb_build_object('result', 'changed');
  end if;
  if (select count(*) from public.attestations where verifier_id = caller and created_at > now() - interval '1 day') >= 30 then
    return jsonb_build_object('result', 'rate_limited');
  end if;
  begin
    insert into public.attestations (request_id, sighting_id, verifier_id, role, decision)
      values ((found.request).id, s.id, caller, verifier_role, decision);
  exception when unique_violation then
    return jsonb_build_object('result', 'already_answered', 'status', s.status);
  end;
  update public.verification_requests set uses = uses + 1,
    status = case when uses + 1 >= max_uses then 'used' else 'open' end where id = (found.request).id;
  return jsonb_build_object('result', 'ok', 'status', public.refresh_sighting_status(s.id));
end $$;

revoke all on function public.create_verification_request(text) from public, anon;
revoke all on function public.revoke_verification_request(uuid) from public, anon;
revoke all on function public.preview_verification(text) from public, anon;
revoke all on function public.attest(text, text, text, text, text, date) from public, anon;
grant execute on function public.create_verification_request(text) to authenticated;
grant execute on function public.revoke_verification_request(uuid) to authenticated;
grant execute on function public.preview_verification(text) to authenticated;
grant execute on function public.attest(text, text, text, text, text, date) to authenticated;
-- Trigger functions are not callable as RPCs.
revoke all on function public.guard_sighting_status() from public, anon, authenticated;
revoke all on function public.sighting_facts_changed() from public, anon, authenticated;
revoke all on function public.attestation_removed() from public, anon, authenticated;
