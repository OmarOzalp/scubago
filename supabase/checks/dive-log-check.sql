-- ScubaGo: dive log check (migration 0009), with two divers, a third diver and an anonymous visitor.
--
-- Paste into the Supabase SQL editor and run after applying 0009. Like privacy-check.sql, it creates
-- throwaway users and rows, tries everything as each of them, then raises an error ON PURPOSE so
-- nothing is saved. The report is the error message: "Dive log check: N passed, 0 failed ...".
do $$
declare
  a uuid := gen_random_uuid();   -- the diver
  b uuid := gen_random_uuid();   -- their buddy
  c uuid := gen_random_uuid();   -- someone else
  sp text; site text; n int; v text; code text; res jsonb;
  passed int := 0; failed int := 0; report text := '';
begin
  insert into auth.users (id, email) values (a, 'dive-a@example.invalid'), (b, 'dive-b@example.invalid'), (c, 'dive-c@example.invalid');
  insert into public.profiles (user_id, username) values
    (a, 'dcheck-a-' || left(a::text, 6)), (b, 'dcheck-b-' || left(b::text, 6)), (c, 'dcheck-c-' || left(c::text, 6));
  select id into sp from public.species order by id limit 1;
  if sp is null then
    insert into public.species (id, common_name, scientific_name, category, rarity) values ('dcheck-sp', 'Check fish', 'Checkus unus', 'fish', 'common');
    sp := 'dcheck-sp';
  end if;
  select id into site from public.dive_sites order by id limit 1;
  if site is null then
    insert into public.dive_sites (id, name, lat, lng, source) values ('dcheck-site', 'Check reef', -16.9, 146.0, 'seed');
    site := 'dcheck-site';
  end if;

  -- ── A writes pages ──
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  insert into public.dives (id, user_id, number, site_id, dived_on, time_in, max_depth_m, bottom_time_min, kinds, signature_name, signature_svg, signed_at)
    values ('dcheck-49', a, 49, site, current_date, '09:30', 28.5, 52, array['drift', 'wall'], 'Maya', 'M1,1L20,20.5', now());
  select count(*) into n from public.dives where id = 'dcheck-49';
  if n = 1 then passed := passed + 1; report := report || E'\n  ok    the diver writes and reads their own page';
  else failed := failed + 1; report := report || E'\n  FAIL  the diver can''t read their own page'; end if;
  begin
    insert into public.dives (id, user_id, number, site_id, dived_on, max_depth_m) values ('dcheck-deep', a, 50, site, current_date, 400);
    failed := failed + 1; report := report || E'\n  FAIL  a 400 m dive was accepted';
  exception when check_violation then
    passed := passed + 1; report := report || E'\n  ok    numbers outside what a dive can be are refused';
  end;
  begin
    insert into public.dives (id, user_id, number, site_id, dived_on, signature_name, signature_svg, signed_at)
      values ('dcheck-svg', a, 51, site, current_date, 'X', '<svg onload=alert(1)>', now());
    failed := failed + 1; report := report || E'\n  FAIL  a signature that isn''t plain path data was accepted';
  exception when check_violation then
    passed := passed + 1; report := report || E'\n  ok    a signature must be plain path data';
  end;
  begin
    insert into public.dives (id, user_id, number, site_id, dived_on, kinds) values ('dcheck-kind', a, 52, site, current_date, array['freediving']);
    failed := failed + 1; report := report || E'\n  FAIL  an unknown kind of dive was accepted';
  exception when check_violation then
    passed := passed + 1; report := report || E'\n  ok    only known kinds of dive are accepted';
  end;
  -- A sighting on the page, and one the way older apps send them.
  insert into public.sightings (id, user_id, species_id, site_id, sighted_on, dive_id) values ('dcheck-s1', a, sp, site, current_date, 'dcheck-49');
  insert into public.sightings (id, user_id, species_id, site_id, sighted_on) values ('dcheck-s-old', a, sp, site, current_date);
  passed := passed + 1; report := report || E'\n  ok    a sighting goes on the diver''s page, and one without a page still goes in (older apps)';
  select public.create_dive_signature_request('dcheck-49') ->> 'code' into code;
  if code ~ '^D[0-9A-Z]{4}-[0-9A-Z]{5}$' then passed := passed + 1; report := report || E'\n  ok    the diver gets a page code that reads DXXXX-XXXXX';
  else failed := failed + 1; report := report || format(E'\n  FAIL  page code looks like %s', code); end if;
  res := public.preview_dive_signature(code);
  if res ->> 'result' = 'own_dive' then passed := passed + 1; report := report || E'\n  ok    the diver can''t sign their own page with a code';
  else failed := failed + 1; report := report || format(E'\n  FAIL  own page preview gave %s', res ->> 'result'); end if;

  -- ── B, the buddy ──
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  select count(*) into n from public.dives;
  if n = 0 then passed := passed + 1; report := report || E'\n  ok    nobody else can read the diver''s pages';
  else failed := failed + 1; report := report || format(E'\n  FAIL  the buddy can read %s pages', n); end if;
  begin
    insert into public.dives (id, user_id, number, site_id, dived_on) values ('dcheck-forged', a, 1, site, current_date);
    failed := failed + 1; report := report || E'\n  FAIL  the buddy wrote a page in the diver''s log';
  exception when insufficient_privilege then
    passed := passed + 1; report := report || E'\n  ok    nobody can write a page into someone else''s log';
  end;
  update public.dives set notes = 'mine now' where id = 'dcheck-49';
  get diagnostics n = row_count;
  if n = 0 then passed := passed + 1; report := report || E'\n  ok    nobody can change someone else''s page';
  else failed := failed + 1; report := report || E'\n  FAIL  the buddy changed the diver''s page'; end if;
  begin
    insert into public.sightings (id, user_id, species_id, site_id, sighted_on, dive_id) values ('dcheck-s-b', b, sp, site, current_date, 'dcheck-49');
    failed := failed + 1; report := report || E'\n  FAIL  the buddy put a sighting on the diver''s page';
  exception when insufficient_privilege then
    passed := passed + 1; report := report || E'\n  ok    nobody can put a sighting on someone else''s page';
  end;
  begin
    insert into public.dive_signatures (request_id, dive_id, signer_id, signer_name, role)
      select id, 'dcheck-49', b, 'Bob', 'buddy' from public.dive_signature_requests limit 1;
    failed := failed + 1; report := report || E'\n  FAIL  a signature was written without the signing function';
  exception when insufficient_privilege then
    passed := passed + 1; report := report || E'\n  ok    signatures are only written by the signing function';
  end;
  res := public.preview_dive_signature(code);
  if res ->> 'result' = 'ok' and (res -> 'dive' ->> 'number')::int = 49 and res ->> 'site_name' is not null then
    passed := passed + 1; report := report || E'\n  ok    the buddy sees the page''s number and site before signing';
  else failed := failed + 1; report := report || format(E'\n  FAIL  the buddy''s preview gave %s', res); end if;
  res := public.sign_dive(code, 'Bob Diver', 'buddy', 'M5,5L50,40', 49, site, current_date - 1);
  if res ->> 'result' = 'changed' then passed := passed + 1; report := report || E'\n  ok    a page that changed since the buddy looked isn''t signed unseen';
  else failed := failed + 1; report := report || format(E'\n  FAIL  signing stale facts gave %s', res ->> 'result'); end if;
  begin
    perform public.sign_dive(code, 'Bob', 'buddy', 'M1,1 <script>', 49, site, current_date);
    failed := failed + 1; report := report || E'\n  FAIL  a signature that isn''t plain path data was signed';
  exception when invalid_parameter_value then
    passed := passed + 1; report := report || E'\n  ok    the signing function refuses anything but plain path data';
  end;
  res := public.sign_dive(code, '  Bob   Diver ', 'buddy', 'M5,5L50,40', 49, site, current_date);
  if res ->> 'result' = 'ok' then passed := passed + 1; report := report || E'\n  ok    the buddy signs the page from their own phone';
  else failed := failed + 1; report := report || format(E'\n  FAIL  signing gave %s', res ->> 'result'); end if;
  res := public.sign_dive(code, 'Bob', 'buddy', null, 49, site, current_date);
  if res ->> 'result' = 'already_signed' then passed := passed + 1; report := report || E'\n  ok    one signature per buddy per page';
  else failed := failed + 1; report := report || format(E'\n  FAIL  signing twice gave %s', res ->> 'result'); end if;
  select signer_name into v from public.dive_signatures where dive_id = 'dcheck-49';
  if v = 'Bob Diver' then passed := passed + 1; report := report || E'\n  ok    the buddy sees their own signature, name tidied';
  else failed := failed + 1; report := report || format(E'\n  FAIL  the buddy sees signature name %s', v); end if;
  res := public.preview_dive_signature('D0000-00000');
  if res ->> 'result' = 'invalid_code' then passed := passed + 1; report := report || E'\n  ok    a wrong code is refused';
  else failed := failed + 1; report := report || format(E'\n  FAIL  a wrong code gave %s', res ->> 'result'); end if;

  -- ── C, someone else ──
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  select count(*) into n from public.dive_signatures;
  if n = 0 then passed := passed + 1; report := report || E'\n  ok    nobody else sees the signatures';
  else failed := failed + 1; report := report || format(E'\n  FAIL  a stranger sees %s signatures', n); end if;
  begin
    perform public.create_dive_signature_request('dcheck-49');
    failed := failed + 1; report := report || E'\n  FAIL  a stranger made a code for the diver''s page';
  exception when insufficient_privilege then
    passed := passed + 1; report := report || E'\n  ok    only the diver can make a code for their page';
  end;

  -- ── Anonymous ──
  set local role anon;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  begin
    select count(*) into n from public.dives;
    if n = 0 then passed := passed + 1; report := report || E'\n  ok    an anonymous visitor sees no pages';
    else failed := failed + 1; report := report || E'\n  FAIL  an anonymous visitor sees pages'; end if;
  exception when insufficient_privilege then
    passed := passed + 1; report := report || E'\n  ok    an anonymous visitor can''t read pages at all';
  end;

  -- ── Back to A ──
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  select count(*) into n from public.dive_signatures where dive_id = 'dcheck-49';
  if n = 1 then passed := passed + 1; report := report || E'\n  ok    the diver sees the buddy''s signature on their page';
  else failed := failed + 1; report := report || format(E'\n  FAIL  the diver sees %s signatures', n); end if;
  delete from public.dives where id = 'dcheck-49';
  select dive_id into v from public.sightings where id = 'dcheck-s1';
  select count(*) into n from public.dive_signatures where dive_id = 'dcheck-49';
  if v is null and n = 0 then passed := passed + 1; report := report || E'\n  ok    deleting a page takes it off its sightings and removes its signatures';
  else failed := failed + 1; report := report || E'\n  FAIL  deleting a page left it on a sighting or kept its signatures'; end if;

  raise exception 'Dive log check: % passed, % failed (nothing was saved)%', passed, failed, report;
end $$;
