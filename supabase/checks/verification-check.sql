-- ScubaGo: buddy verification check (migration 0006), with two accounts and a few more.
--
-- Paste into the Supabase SQL editor and run after applying 0006. Like rls-isolation.sql, it creates
-- throwaway users and rows, tries the whole flow as each of them, then raises an error ON PURPOSE so
-- nothing is saved. The report is the error message: "Verification check: N passed, 0 failed ...".
do $$
declare
  a uuid := gen_random_uuid();   -- the diver who logged the sighting
  b uuid := gen_random_uuid();   -- their buddy
  c uuid := gen_random_uuid();   -- another diver on the dive
  d uuid := gen_random_uuid();   -- someone unrelated
  sp text; sp2 text; site text;
  j jsonb; code text; n int;
  passed int := 0; failed int := 0; report text := '';
begin
  insert into auth.users (id, email) values (a, 'verify-a@example.invalid'), (b, 'verify-b@example.invalid'),
    (c, 'verify-c@example.invalid'), (d, 'verify-d@example.invalid');
  insert into public.profiles (user_id, username) values (a, 'vcheck-a-' || left(a::text, 6)), (b, 'vcheck-b-' || left(b::text, 6)),
    (c, 'vcheck-c-' || left(c::text, 6)), (d, 'vcheck-d-' || left(d::text, 6));
  select id into sp from public.species order by id limit 1;
  select id into sp2 from public.species order by id offset 1 limit 1;
  if sp2 is null then
    insert into public.species (id, common_name, scientific_name, category, rarity) values
      ('vcheck-sp1', 'Check fish', 'Checkus unus', 'fish', 'common'), ('vcheck-sp2', 'Other fish', 'Checkus duo', 'fish', 'common');
    sp := 'vcheck-sp1'; sp2 := 'vcheck-sp2';
  end if;
  select id into site from public.dive_sites order by id limit 1;
  if site is null then
    insert into public.dive_sites (id, name, lat, lng, source) values ('vcheck-site', 'Check reef', -16.9, 146.0, 'seed');
    site := 'vcheck-site';
  end if;

  -- A logs a sighting; even asking for 'confirmed' from the app, it starts unverified.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  insert into public.sightings (id, user_id, species_id, site_id, sighted_on, status) values ('vcheck-s1', a, sp, site, '2026-09-20', 'confirmed');
  reset role;
  if (select status from public.sightings where id = 'vcheck-s1') = 'unverified' then passed := passed + 1; report := report || E'\n  ok    a new sighting starts unverified, whatever the app sends';
  else failed := failed + 1; report := report || E'\n  FAIL  the app set a new sighting''s status'; end if;

  -- 1. A asks a buddy: a code for that one sighting.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  j := public.create_verification_request('vcheck-s1');
  reset role;
  code := j->>'code';
  if code ~ '^[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$' and (j->>'expires_at')::timestamptz > now() + interval '6 days' then
    passed := passed + 1; report := report || E'\n  ok    A creates a code (10 random Crockford characters, 7 days)';
  else failed := failed + 1; report := report || format(E'\n  FAIL  unexpected request: %s', j); end if;
  if not exists (select 1 from public.verification_requests where code_hash = code or code_hash = replace(code, '-', '')) then
    passed := passed + 1; report := report || E'\n  ok    only the code''s hash is stored';
  else failed := failed + 1; report := report || E'\n  FAIL  the code is stored as is'; end if;

  -- 2. A cannot ask about someone else's sighting.
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
    perform public.create_verification_request('vcheck-s1');
    reset role;
    failed := failed + 1; report := report || E'\n  FAIL  B created a code for A''s sighting';
  exception when insufficient_privilege then
    reset role;
    passed := passed + 1; report := report || E'\n  ok    nobody can ask about someone else''s sighting';
  end;

  -- 3. B looks the code up (in any case, with or without the dash) and sees what they would confirm.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  j := public.preview_verification(lower(replace(code, '-', ' ')));
  reset role;
  if j->>'result' = 'ok' and j->'sighting'->>'species_id' = sp and j->'sighting'->>'site_id' = site and j->'sighting'->>'sighted_on' = '2026-09-20'
     and j->>'owner' like 'vcheck-a-%' and j->'answered' = 'null'::jsonb then
    passed := passed + 1; report := report || E'\n  ok    B sees the species, site, date and diver before answering';
  else failed := failed + 1; report := report || format(E'\n  FAIL  preview: %s', j); end if;

  -- 4. A cannot confirm their own sighting.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  j := public.attest(code, 'saw_it', 'buddy', sp, site, '2026-09-20');
  reset role;
  if j->>'result' = 'own_sighting' and (select status from public.sightings where id = 'vcheck-s1') = 'unverified' then
    passed := passed + 1; report := report || E'\n  ok    self-verification is refused';
  else failed := failed + 1; report := report || format(E'\n  FAIL  self-verification: %s', j); end if;

  -- 5. Confirming something other than what was shown is refused.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  j := public.attest(code, 'saw_it', 'buddy', sp2, site, '2026-09-20');
  reset role;
  if j->>'result' = 'changed' then passed := passed + 1; report := report || E'\n  ok    an answer for facts other than the sighting''s is refused';
  else failed := failed + 1; report := report || format(E'\n  FAIL  mismatched facts: %s', j); end if;

  -- 6. B confirms: the sighting is confirmed.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  j := public.attest(code, 'saw_it', 'buddy', sp, site, '2026-09-20');
  reset role;
  if j->>'result' = 'ok' and j->>'status' = 'confirmed' and (select status from public.sightings where id = 'vcheck-s1') = 'confirmed' then
    passed := passed + 1; report := report || E'\n  ok    B confirms and the sighting becomes confirmed';
  else failed := failed + 1; report := report || format(E'\n  FAIL  confirm: %s', j); end if;

  -- 7. B cannot answer twice.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  j := public.attest(code, 'did_not_see', 'buddy', sp, site, '2026-09-20');
  reset role;
  if j->>'result' = 'already_answered' and (select count(*) from public.attestations where sighting_id = 'vcheck-s1') = 1 then
    passed := passed + 1; report := report || E'\n  ok    the same diver cannot answer again';
  else failed := failed + 1; report := report || format(E'\n  FAIL  second answer: %s', j); end if;

  -- 8. C declines (as an "instructor": a claim, stored as such); the confirmation stands.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  j := public.attest(code, 'did_not_see', 'instructor', sp, site, '2026-09-20');
  reset role;
  if j->>'result' = 'ok' and j->>'status' = 'confirmed'
     and (select role from public.attestations where verifier_id = c) = 'instructor' then
    passed := passed + 1; report := report || E'\n  ok    a decline is recorded (with its claimed role) and does not undo a confirmation';
  else failed := failed + 1; report := report || format(E'\n  FAIL  decline: %s', j); end if;

  -- 9. Who sees what: A sees both answers; B only their own; D nothing; nobody but A sees A's requests.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  select count(*) into n from public.attestations where sighting_id = 'vcheck-s1';
  reset role;
  if n = 2 then passed := passed + 1; report := report || E'\n  ok    the owner sees every answer on their sighting';
  else failed := failed + 1; report := report || format(E'\n  FAIL  owner sees %s answers', n); end if;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  select count(*) into n from public.attestations where sighting_id = 'vcheck-s1';
  n := n * 10 + (select count(*) from public.verification_requests where sighting_id = 'vcheck-s1');
  reset role;
  if n = 10 then passed := passed + 1; report := report || E'\n  ok    a verifier sees only their own answer, and no requests';
  else failed := failed + 1; report := report || format(E'\n  FAIL  verifier sees %s answers, %s requests', n / 10, n % 10); end if;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  select count(*) into n from public.attestations;
  n := n + (select count(*) from public.verification_requests);
  reset role;
  if n = 0 then passed := passed + 1; report := report || E'\n  ok    others see no answers and no requests';
  else failed := failed + 1; report := report || format(E'\n  FAIL  an unrelated diver sees %s rows', n); end if;

  -- 10. Nobody sets a status, writes an answer, or edits a request directly.
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
    update public.sightings set status = 'accepted' where id = 'vcheck-s1';
    reset role;
    failed := failed + 1; report := report || E'\n  FAIL  A changed their sighting''s status';
  exception when insufficient_privilege then
    reset role;
    passed := passed + 1; report := report || E'\n  ok    the owner cannot set their sighting''s status';
  end;
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
    insert into public.attestations (request_id, sighting_id, verifier_id, role, decision)
      select id, sighting_id, d, 'buddy', 'saw_it' from public.verification_requests limit 1;
    insert into public.attestations (request_id, sighting_id, verifier_id, role, decision)
      values (gen_random_uuid(), 'vcheck-s1', d, 'buddy', 'saw_it');
    reset role;
    failed := failed + 1; report := report || E'\n  FAIL  a diver wrote an answer directly';
  exception when insufficient_privilege then
    reset role;
    passed := passed + 1; report := report || E'\n  ok    answers are written only through the code (no direct inserts)';
  end;
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
    update public.verification_requests set uses = 0, expires_at = now() + interval '1 year';
    reset role;
    failed := failed + 1; report := report || E'\n  FAIL  A edited a request directly';
  exception when insufficient_privilege then
    reset role;
    passed := passed + 1; report := report || E'\n  ok    requests cannot be edited directly (extending or reusing a code)';
  end;
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
    perform public.refresh_sighting_status('vcheck-s1');
    reset role;
    failed := failed + 1; report := report || E'\n  FAIL  a diver called refresh_sighting_status';
  exception when insufficient_privilege then
    reset role;
    passed := passed + 1; report := report || E'\n  ok    the status function is not callable from the app';
  end;
  begin
    set local role anon;
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    perform public.preview_verification(code);
    reset role;
    failed := failed + 1; report := report || E'\n  FAIL  an anonymous visitor looked a code up';
  exception when insufficient_privilege then
    reset role;
    passed := passed + 1; report := report || E'\n  ok    anonymous visitors cannot look codes up or answer';
  end;

  -- 11. Wrong, expired and withdrawn codes fail; ten wrong codes in an hour lock a diver out.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  j := public.create_verification_request('vcheck-s1');
  reset role;
  update public.verification_requests set expires_at = now() - interval '1 minute' where code_hash = encode(extensions.digest(replace(j->>'code', '-', ''), 'sha256'), 'hex');
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  if public.preview_verification(j->>'code')->>'result' = 'expired' and public.attest(j->>'code', 'saw_it', 'buddy', sp, site, '2026-09-20')->>'result' = 'expired' then
    reset role; passed := passed + 1; report := report || E'\n  ok    an expired code fails';
  else reset role; failed := failed + 1; report := report || E'\n  FAIL  an expired code worked'; end if;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  j := public.create_verification_request('vcheck-s1');
  perform public.revoke_verification_request((j->>'id')::uuid);
  perform set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  if public.preview_verification(j->>'code')->>'result' = 'expired' then
    reset role; passed := passed + 1; report := report || E'\n  ok    a withdrawn code fails';
  else reset role; failed := failed + 1; report := report || E'\n  FAIL  a withdrawn code worked'; end if;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  if public.preview_verification('AAAAA-AAAAA')->>'result' = 'invalid_code' then
    reset role; passed := passed + 1; report := report || E'\n  ok    an invalid code fails';
  else reset role; failed := failed + 1; report := report || E'\n  FAIL  an invalid code was accepted'; end if;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  for i in 1..10 loop perform public.preview_verification('ZZZZZ-ZZZZ' || i); end loop;
  j := public.preview_verification(code);   -- even a valid code, once locked out
  reset role;
  if j->>'result' = 'rate_limited' then passed := passed + 1; report := report || E'\n  ok    ten wrong codes in an hour lock a diver out (valid codes included)';
  else failed := failed + 1; report := report || format(E'\n  FAIL  after ten wrong codes: %s', j); end if;

  -- 12. Changing the species voids the confirmation; changing only the notes doesn't.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  update public.sightings set notes = 'three of them' where id = 'vcheck-s1';
  reset role;
  if (select status from public.sightings where id = 'vcheck-s1') = 'confirmed' then passed := passed + 1; report := report || E'\n  ok    editing the notes keeps the confirmation';
  else failed := failed + 1; report := report || E'\n  FAIL  a notes edit dropped the confirmation'; end if;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  update public.sightings set species_id = sp2 where id = 'vcheck-s1';
  reset role;
  if (select status from public.sightings where id = 'vcheck-s1') = 'unverified' and not exists (select 1 from public.attestations where sighting_id = 'vcheck-s1') then
    passed := passed + 1; report := report || E'\n  ok    changing the species voids the confirmation (and its answers)';
  else failed := failed + 1; report := report || E'\n  FAIL  a species change kept the confirmation'; end if;

  -- 13. B confirms again (new facts), then deletes their account: the confirmation goes with it.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  code := public.create_verification_request('vcheck-s1')->>'code';
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  j := public.attest(code, 'saw_it', 'buddy', sp2, site, '2026-09-20');
  reset role;
  delete from auth.users where id = b;
  if j->>'status' = 'confirmed' and (select status from public.sightings where id = 'vcheck-s1') = 'unverified' then
    passed := passed + 1; report := report || E'\n  ok    a confirmation disappears with its verifier''s account';
  else failed := failed + 1; report := report || format(E'\n  FAIL  after the verifier left: %s / %s', j, (select status from public.sightings where id = 'vcheck-s1')); end if;

  -- 14. Deleting the sighting takes its requests and answers with it.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  delete from public.sightings where id = 'vcheck-s1';
  reset role;
  if not exists (select 1 from public.verification_requests where sighting_id = 'vcheck-s1') and not exists (select 1 from public.attestations where sighting_id = 'vcheck-s1') then
    passed := passed + 1; report := report || E'\n  ok    deleting a sighting deletes its requests and answers';
  else failed := failed + 1; report := report || E'\n  FAIL  requests or answers outlived their sighting'; end if;

  raise exception '%', format(E'Verification check: %s passed, %s failed. Nothing was saved (this error rolls the check back).%s', passed, failed, report);
end $$;
