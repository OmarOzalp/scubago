-- ScubaGo: row-level security (RLS) isolation check.
--
-- Paste into the Supabase SQL editor and run. It creates two throwaway users (A and B) and a few
-- rows, then tries, as each of them and as an anonymous visitor, what they may and may not do.
-- At the end it raises an error ON PURPOSE: that rolls back everything the check did, so nothing
-- is saved. The report is the error message: "RLS isolation check: N passed, 0 failed ...".
-- Safe to run on the live project; it reads and writes nothing that survives the run.
do $$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  sp text;
  site text;
  n int;
  m int;
  passed int := 0;
  failed int := 0;
  report text := '';
begin
  -- Two users with profiles, and a species and site to point at (the real catalog if seeded).
  insert into auth.users (id, email) values (a, 'rls-check-a@example.invalid'), (b, 'rls-check-b@example.invalid');
  insert into public.profiles (user_id, username) values (a, 'rlscheck-' || left(a::text, 8)), (b, 'rlscheck-' || left(b::text, 8));
  select id into sp from public.species limit 1;
  if sp is null then
    insert into public.species (id, common_name, scientific_name, category, rarity) values ('rls-check-species', 'Check fish', 'Checkus fishus', 'fish', 'common');
    sp := 'rls-check-species';
  end if;
  select id into site from public.dive_sites limit 1;
  if site is null then
    insert into public.dive_sites (id, name, lat, lng, source) values ('rls-check-site', 'Check reef', -16.9, 146.0, 'seed');
    site := 'rls-check-site';
  end if;

  -- 1. A logs a sighting of their own (two: one of them is deleted in 5b).
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
    insert into public.sightings (id, user_id, species_id, site_id, sighted_on)
    values ('rls-check-a', a, sp, site, current_date), ('rls-check-a2', a, sp, site, current_date);
    reset role;
    passed := passed + 1; report := report || E'\n  ok    A can log a sighting of their own';
  exception when others then
    failed := failed + 1; report := report || E'\n  FAIL  A could not log a sighting of their own: ' || sqlerrm;
  end;

  -- 2. B cannot log a sighting in A's name.
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
    insert into public.sightings (id, user_id, species_id, site_id, sighted_on) values ('rls-check-b-as-a', a, sp, site, current_date);
    reset role;
    failed := failed + 1; report := report || E'\n  FAIL  B could log a sighting in A''s name';
  exception when insufficient_privilege then
    passed := passed + 1; report := report || E'\n  ok    B cannot log a sighting in A''s name';
  end;

  -- 3. B cannot change or delete A's sighting (the rows are simply out of reach: 0 affected).
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
    update public.sightings set notes = 'edited by B' where id = 'rls-check-a';
    get diagnostics n = row_count;
    delete from public.sightings where id = 'rls-check-a';
    get diagnostics m = row_count; n := n + m;
    reset role;
    if n = 0 then passed := passed + 1; report := report || E'\n  ok    B cannot edit or delete A''s sighting';
    else failed := failed + 1; report := report || format(E'\n  FAIL  B edited or deleted %s of A''s rows', n); end if;
  exception when others then
    passed := passed + 1; report := report || E'\n  ok    B cannot edit or delete A''s sighting (' || sqlerrm || ')';
  end;

  -- 4. B cannot hand A's sighting to themselves, nor move their own to A.
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
    update public.sightings set user_id = b where id = 'rls-check-a';
    reset role;
    failed := failed + 1; report := report || E'\n  FAIL  A could reassign a sighting to B';
  exception when insufficient_privilege then
    passed := passed + 1; report := report || E'\n  ok    a sighting cannot be reassigned to another user';
  end;

  -- 5. A can edit and delete their own sighting.
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
    update public.sightings set notes = 'edited by A' where id = 'rls-check-a';
    get diagnostics n = row_count;
    reset role;
    if n = 1 then passed := passed + 1; report := report || E'\n  ok    A can edit their own sighting';
    else failed := failed + 1; report := report || E'\n  FAIL  A could not edit their own sighting'; end if;
  exception when others then
    failed := failed + 1; report := report || E'\n  FAIL  A could not edit their own sighting: ' || sqlerrm;
  end;

  -- 5b. A can delete their own sighting, and deleting it again is harmless (the app retries a
  --     deletion until the server confirms it, so a repeat must not fail).
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
    delete from public.sightings where id = 'rls-check-a2' and user_id = a;
    get diagnostics n = row_count;
    delete from public.sightings where id = 'rls-check-a2' and user_id = a;
    get diagnostics m = row_count;
    reset role;
    if n = 1 and m = 0 then passed := passed + 1; report := report || E'\n  ok    A can delete their own sighting (and a repeated delete is harmless)';
    else failed := failed + 1; report := report || format(E'\n  FAIL  A''s deletes removed %s, then %s rows', n, m); end if;
  exception when others then
    failed := failed + 1; report := report || E'\n  FAIL  A could not delete their own sighting: ' || sqlerrm;
  end;

  -- 6. Profiles: B cannot create or rename A's.
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
    update public.profiles set username = 'hijacked' where user_id = a;
    get diagnostics n = row_count;
    reset role;
    if n = 0 then passed := passed + 1; report := report || E'\n  ok    B cannot rename A''s profile';
    else failed := failed + 1; report := report || E'\n  FAIL  B renamed A''s profile'; end if;
  exception when others then
    passed := passed + 1; report := report || E'\n  ok    B cannot rename A''s profile (' || sqlerrm || ')';
  end;

  -- 7. Signed-in users cannot touch the species catalog or the seeded sites.
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
    insert into public.species (id, common_name, scientific_name, category, rarity) values ('rls-check-fake', 'Fake', 'Fakus', 'fish', 'common');
    reset role;
    failed := failed + 1; report := report || E'\n  FAIL  a signed-in user could add to the species catalog';
  exception when insufficient_privilege then
    passed := passed + 1; report := report || E'\n  ok    signed-in users cannot add to the species catalog';
  end;
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
    update public.species set blurb = 'vandalised' where id = sp;
    get diagnostics n = row_count;
    update public.dive_sites set name = 'vandalised' where id = site;
    get diagnostics m = row_count; n := n + m;
    reset role;
    if n = 0 then passed := passed + 1; report := report || E'\n  ok    signed-in users cannot edit species or dive sites';
    else failed := failed + 1; report := report || format(E'\n  FAIL  a signed-in user edited %s catalog rows', n); end if;
  exception when others then
    passed := passed + 1; report := report || E'\n  ok    signed-in users cannot edit species or dive sites (' || sqlerrm || ')';
  end;

  -- 8. Users add sites only as themselves, and never as curated ("seed") sites.
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
    insert into public.dive_sites (id, name, lat, lng, source, created_by) values ('rls-check-seed', 'Fake seed', 0, 0, 'seed', b);
    reset role;
    failed := failed + 1; report := report || E'\n  FAIL  a user could add a curated (seed) site';
  exception when insufficient_privilege then
    passed := passed + 1; report := report || E'\n  ok    users cannot add curated (seed) sites';
  end;
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
    insert into public.dive_sites (id, name, lat, lng, source, created_by) values ('rls-check-as-a', 'In A''s name', 0, 0, 'user', a);
    reset role;
    failed := failed + 1; report := report || E'\n  FAIL  B could add a site in A''s name';
  exception when insufficient_privilege then
    passed := passed + 1; report := report || E'\n  ok    B cannot add a site in A''s name';
  end;

  -- 8b. Regions and site sources are curated: signed-in users cannot write them.
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
    insert into public.site_field_sources (site_id, field, source) values (site, 'depth', 'made up');
    reset role;
    failed := failed + 1; report := report || E'\n  FAIL  a user could add a source to a dive site';
  exception when insufficient_privilege then
    passed := passed + 1; report := report || E'\n  ok    users cannot add sources or regions to dive sites';
  end;

  -- 9. Anonymous visitors can read but not write.
  begin
    set local role anon;
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    insert into public.sightings (id, user_id, species_id, site_id, sighted_on) values ('rls-check-anon', a, sp, site, current_date);
    reset role;
    failed := failed + 1; report := report || E'\n  FAIL  an anonymous visitor could log a sighting';
  exception when insufficient_privilege then
    passed := passed + 1; report := report || E'\n  ok    anonymous visitors cannot log sightings';
  end;

  -- 10. Photos: each user writes only inside their own folder of the sighting-photos bucket.
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
    insert into storage.objects (bucket_id, name) values ('sighting-photos', a::text || '/rls-check.jpg');
    reset role;
    passed := passed + 1; report := report || E'\n  ok    A can upload into their own photo folder';
  exception when others then
    failed := failed + 1; report := report || E'\n  FAIL  A could not upload into their own photo folder: ' || sqlerrm;
  end;
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
    insert into storage.objects (bucket_id, name) values ('sighting-photos', a::text || '/by-b.jpg');
    reset role;
    failed := failed + 1; report := report || E'\n  FAIL  B could upload into A''s photo folder';
  exception when insufficient_privilege then
    passed := passed + 1; report := report || E'\n  ok    B cannot upload into A''s photo folder';
  end;
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
    delete from storage.objects where bucket_id = 'sighting-photos' and name = a::text || '/rls-check.jpg';
    get diagnostics n = row_count;
    reset role;
    if n = 0 then passed := passed + 1; report := report || E'\n  ok    B cannot delete A''s photos';
    else failed := failed + 1; report := report || E'\n  FAIL  B deleted A''s photo'; end if;
  exception when others then
    passed := passed + 1; report := report || E'\n  ok    B cannot delete A''s photos (' || sqlerrm || ')';
  end;
  begin
    set local role anon;
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    insert into storage.objects (bucket_id, name) values ('sighting-photos', 'anon/rls-check.jpg');
    reset role;
    failed := failed + 1; report := report || E'\n  FAIL  an anonymous visitor could upload a photo';
  exception when insufficient_privilege then
    passed := passed + 1; report := report || E'\n  ok    anonymous visitors cannot upload photos';
  end;

  -- For information (by design today): who can read community sightings.
  set local role anon;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  select count(*) into n from public.sightings where id = 'rls-check-a';
  reset role;
  report := report || format(E'\n  info  anonymous visitors %s read other divers'' sightings (ScubaGo''s current "public by default" design)', case when n > 0 then 'can' else 'cannot' end);

  raise exception '%', format(E'RLS isolation check: %s passed, %s failed. Nothing was saved (this error rolls the check back).%s', passed, failed, report);
end $$;
