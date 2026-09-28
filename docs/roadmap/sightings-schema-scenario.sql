do $$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid(); d uuid := gen_random_uuid(); s uuid := gen_random_uuid();
  code text; result text; n int; report text := ''; ok int := 0; bad int := 0;
begin
  insert into auth.users (id, email) values (a,'a@x.invalid'),(b,'b@x.invalid'),(c,'c@x.invalid'),(d,'d@x.invalid'),(s,'s@x.invalid');
  insert into public.profiles (user_id, username, created_at) values
    (a,'owner-a', now() - interval '30 days'), (b,'buddy-b', now() - interval '2 days'), (c,'newbie-c', now()), (d,'diver-d', now() - interval '9 days'), (s,'staff-s', now() - interval '99 days');
  insert into public.staff (user_id, role) values (s, 'moderator');
  insert into public.species (id, common_name, scientific_name, category, rarity) values ('reef-manta','Reef manta','Mobula alfredi','ray','rare'), ('green-turtle','Green turtle','Chelonia mydas','turtle','common');
  insert into public.dive_sites (id, name, lat, lng, source) values ('milln-reef', 'Milln Reef', -16.8, 146.2, 'seed');
  insert into public.regions (id, name, mrgid) values ('northern-gbr', 'Northern Great Barrier Reef', null);

  -- A logs a manta: unverified by default.
  set local role authenticated; perform set_config('request.jwt.claims', json_build_object('sub', a, 'role','authenticated')::text, true);
  insert into public.sightings (id, user_id, species_id, site_id, sighted_on) values ('s-a1', a, 'reef-manta', 'milln-reef', current_date);
  select status into result from public.sightings where id = 's-a1';
  if result = 'unverified' then ok := ok + 1; report := report || E'\nok   a new sighting starts unverified'; else bad := bad + 1; report := report || E'\nFAIL new sighting status ' || result; end if;
  -- A cannot set their own status.
  begin
    update public.sightings set status = 'confirmed' where id = 's-a1';
    bad := bad + 1; report := report || E'\nFAIL owner could set status';
  exception when insufficient_privilege then ok := ok + 1; report := report || E'\nok   the owner cannot set a status';
  end;
  code := public.create_verification_request('s-a1');
  report := report || E'\n     code issued: ' || code;
  -- A cannot confirm their own sighting.
  begin
    perform public.attest(code, 'saw_it');
    bad := bad + 1; report := report || E'\nFAIL owner confirmed own sighting';
  exception when others then ok := ok + 1; report := report || E'\nok   the owner cannot confirm their own sighting (' || sqlerrm || ')';
  end;
  reset role;

  -- A brand-new account cannot confirm yet.
  set local role authenticated; perform set_config('request.jwt.claims', json_build_object('sub', c, 'role','authenticated')::text, true);
  begin
    perform public.attest(code, 'saw_it');
    bad := bad + 1; report := report || E'\nFAIL new account confirmed';
  exception when others then ok := ok + 1; report := report || E'\nok   a day-old account cannot confirm yet (' || sqlerrm || ')';
  end;
  reset role;

  -- B: a wrong code fails (and counts), then the right one, typed loosely, confirms.
  set local role authenticated; perform set_config('request.jwt.claims', json_build_object('sub', b, 'role','authenticated')::text, true);
  result := public.attest('ZZZZZ-ZZZZZ', 'saw_it');
  if result = 'invalid_code' then ok := ok + 1; report := report || E'\nok   a wrong code is refused'; else bad := bad + 1; report := report || E'\nFAIL wrong code gave ' || result; end if;
  result := public.attest(lower(replace(code, '-', ' ')), 'saw_it', 'buddy');
  if result = 'confirmed' then ok := ok + 1; report := report || E'\nok   the buddy''s confirmation makes it Community Verified'; else bad := bad + 1; report := report || E'\nFAIL status after attest ' || result; end if;
  reset role;

  -- D cannot reuse the single-use code.
  set local role authenticated; perform set_config('request.jwt.claims', json_build_object('sub', d, 'role','authenticated')::text, true);
  result := public.attest(code, 'saw_it');
  if result = 'invalid_code' then ok := ok + 1; report := report || E'\nok   a used code cannot be reused'; else bad := bad + 1; report := report || E'\nFAIL code reuse gave ' || result; end if;
  -- Guessing: after 10 wrong codes in an hour, even a valid code is refused.
  for i in 1..9 loop perform public.attest('WRONG-' || i, 'saw_it'); end loop;
  begin
    perform public.attest(code, 'saw_it');
    bad := bad + 1; report := report || E'\nFAIL no lockout after 10 wrong codes';
  exception when others then ok := ok + 1; report := report || E'\nok   10 wrong codes lock the account out for an hour (' || sqlerrm || ')';
  end;
  reset role;

  -- Anonymous visitors see it in the public read model.
  set local role anon; perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  select count(*) into n from public.public_sightings where id = 'community:s-a1' and provenance = 'community_verified';
  reset role;
  if n = 1 then ok := ok + 1; report := report || E'\nok   anonymous visitors see the verified sighting (public_sightings)'; else bad := bad + 1; report := report || E'\nFAIL verified sighting not public'; end if;

  -- A changes the species: support is voided, it leaves the public list.
  set local role authenticated; perform set_config('request.jwt.claims', json_build_object('sub', a, 'role','authenticated')::text, true);
  update public.sightings set species_id = 'green-turtle' where id = 's-a1';
  select status into result from public.sightings where id = 's-a1';
  reset role;
  select count(*) into n from public.attestations where sighting_id = 's-a1';
  if result = 'unverified' and n = 0 then ok := ok + 1; report := report || E'\nok   editing what was seen resets it to unverified and voids attestations'; else bad := bad + 1; report := report || format(E'\nFAIL after edit: %s, %s attestations', result, n); end if;

  -- Evidence: B cannot attach evidence to A's sighting; A can; a moderator accepts it.
  set local role authenticated; perform set_config('request.jwt.claims', json_build_object('sub', b, 'role','authenticated')::text, true);
  begin
    insert into public.evidence (sighting_id, user_id, storage_path, sha256) values ('s-a1', b, b::text || '/e1.jpg', 'x');
    bad := bad + 1; report := report || E'\nFAIL B attached evidence to A''s sighting';
  exception when insufficient_privilege then ok := ok + 1; report := report || E'\nok   nobody can attach evidence to someone else''s sighting';
  end;
  reset role;
  set local role authenticated; perform set_config('request.jwt.claims', json_build_object('sub', a, 'role','authenticated')::text, true);
  insert into public.evidence (sighting_id, user_id, storage_path, sha256) values ('s-a1', a, a::text || '/e1.jpg', 'abc');
  reset role;
  perform public.refresh_sighting_status('s-a1');
  select status into result from public.sightings where id = 's-a1';
  if result = 'evidence_submitted' then ok := ok + 1; report := report || E'\nok   a photo moves it to evidence submitted (pending)'; else bad := bad + 1; report := report || E'\nFAIL after evidence ' || result; end if;
  update public.evidence set status = 'accepted', reviewed_by = s, reviewed_at = now() where sighting_id = 's-a1';
  perform public.refresh_sighting_status('s-a1');
  select status into result from public.sightings where id = 's-a1';
  if result = 'accepted' then ok := ok + 1; report := report || E'\nok   a moderator accepting the photo makes it eligible'; else bad := bad + 1; report := report || E'\nFAIL after acceptance ' || result; end if;

  -- External: only staff write; the public sees published reports with their provenance and dates.
  set local role authenticated; perform set_config('request.jwt.claims', json_build_object('sub', a, 'role','authenticated')::text, true);
  begin
    insert into public.external_reports (source_id, kind, status) values ('x', 'other', 'published');
    bad := bad + 1; report := report || E'\nFAIL a user wrote an external report';
  exception when insufficient_privilege or foreign_key_violation then ok := ok + 1; report := report || E'\nok   ordinary users cannot write external reports';
  end;
  reset role;
  insert into public.external_sources (id, name, kind, agreement, attribution) values ('pro-dive-cairns', 'Pro Dive Cairns', 'dive_operator', 'granted', 'Courtesy of Pro Dive Cairns');
  set local role authenticated; perform set_config('request.jwt.claims', json_build_object('sub', s, 'role','authenticated')::text, true);
  with r as (insert into public.external_reports (source_id, kind, title, url, published_at, status, entered_by) values
    ('pro-dive-cairns', 'trip_report', 'Trip report', 'https://example.invalid/report', now(), 'published', s) returning id)
  insert into public.external_sightings (report_id, species_id, taxon_name, site_id, location_precision, observed_start, observed_end, observed_precision, confidence)
    select id, 'reef-manta', 'Mobula alfredi', 'milln-reef', 'site', current_date - 5, current_date - 3, 'range', 'B' from r;
  reset role;
  set local role anon; perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  select count(*) into n from public.public_sightings where provenance = 'dive_operator' and observed_end = current_date - 3 and published_at::date = current_date and reported_by = 'Pro Dive Cairns';
  reset role;
  if n = 1 then ok := ok + 1; report := report || E'\nok   an operator report shows as "dive_operator", observed 5-3 days ago, published today'; else bad := bad + 1; report := report || E'\nFAIL external sighting not public'; end if;

  raise exception '%', format(E'Draft schema scenario: %s passed, %s failed (rolled back).%s', ok, bad, report);
end $$;
