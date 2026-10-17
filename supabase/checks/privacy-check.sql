-- ScubaGo: sighting privacy check (migration 0008), with two divers and an anonymous visitor.
--
-- Paste into the Supabase SQL editor and run after applying 0008. Like rls-isolation.sql, it creates
-- throwaway users and rows, tries everything as each of them, then raises an error ON PURPOSE so
-- nothing is saved. The report is the error message: "Privacy check: N passed, 0 failed ...".
do $$
declare
  a uuid := gen_random_uuid();   -- the diver
  b uuid := gen_random_uuid();   -- another diver
  sp text; site text; n int; v text;
  passed int := 0; failed int := 0; report text := '';
begin
  insert into auth.users (id, email) values (a, 'privacy-a@example.invalid'), (b, 'privacy-b@example.invalid');
  insert into public.profiles (user_id, username) values (a, 'pcheck-a-' || left(a::text, 6)), (b, 'pcheck-b-' || left(b::text, 6));
  select id into sp from public.species order by id limit 1;
  if sp is null then
    insert into public.species (id, common_name, scientific_name, category, rarity) values ('pcheck-sp', 'Check fish', 'Checkus unus', 'fish', 'common');
    sp := 'pcheck-sp';
  end if;
  select id into site from public.dive_sites order by id limit 1;
  if site is null then
    insert into public.dive_sites (id, name, lat, lng, source) values ('pcheck-site', 'Check reef', -16.9, 146.0, 'seed');
    site := 'pcheck-site';
  end if;

  -- A logs one sighting the way older apps do (no visibility), and one private sighting.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  insert into public.sightings (id, user_id, species_id, site_id, sighted_on, notes) values ('pcheck-public', a, sp, site, current_date, 'shared note');
  insert into public.sightings (id, user_id, species_id, site_id, sighted_on, visibility) values ('pcheck-private', a, sp, site, current_date, 'private');
  select visibility into v from public.sightings where id = 'pcheck-public';
  if v = 'public' then passed := passed + 1; report := report || E'\n  ok    a sighting sent without a visibility (older apps) is public, as before';
  else failed := failed + 1; report := report || E'\n  FAIL  a sighting without a visibility is not public'; end if;
  select count(*) into n from public.sightings where id in ('pcheck-public', 'pcheck-private');
  if n = 2 then passed := passed + 1; report := report || E'\n  ok    the diver sees both their public and their private sighting';
  else failed := failed + 1; report := report || format(E'\n  FAIL  the diver sees %s of their 2 sightings', n); end if;
  begin
    insert into public.sightings (id, user_id, species_id, site_id, sighted_on, visibility) values ('pcheck-odd', a, sp, site, current_date, 'friends');
    failed := failed + 1; report := report || E'\n  FAIL  a visibility other than public or private was accepted';
  exception when check_violation then
    passed := passed + 1; report := report || E'\n  ok    visibility is public or private, nothing else';
  end;

  -- A keeps notes and a photo private.
  insert into public.sighting_details (sighting_id, user_id, notes, photo_path) values ('pcheck-private', a, 'secret spot', a::text || '/pcheck-private-x.jpg');
  passed := passed + 1; report := report || E'\n  ok    the diver keeps private notes and a private photo path on their own sighting';
  begin
    insert into public.sighting_details (sighting_id, user_id, photo_path) values ('pcheck-public', a, b::text || '/stolen.jpg');
    failed := failed + 1; report := report || E'\n  FAIL  a private photo path outside the diver''s own folder was accepted';
  exception when check_violation then
    passed := passed + 1; report := report || E'\n  ok    a private photo path must be in the diver''s own folder';
  end;
  -- A private photo in A's folder of the private bucket.
  insert into storage.objects (bucket_id, name, owner) values ('sighting-photos-private', a::text || '/pcheck-private-x.jpg', a);
  passed := passed + 1; report := report || E'\n  ok    the diver uploads into their own folder of the private bucket';
  begin
    insert into storage.objects (bucket_id, name, owner) values ('sighting-photos-private', b::text || '/pcheck-sneaky.jpg', a);
    failed := failed + 1; report := report || E'\n  FAIL  the diver could upload into someone else''s private folder';
  exception when insufficient_privilege then
    passed := passed + 1; report := report || E'\n  ok    nobody uploads into someone else''s private folder';
  end;
  reset role;

  -- B, another diver.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  select count(*) into n from public.sightings where id = 'pcheck-public';
  if n = 1 then passed := passed + 1; report := report || E'\n  ok    other divers see a public sighting';
  else failed := failed + 1; report := report || E'\n  FAIL  other divers cannot see a public sighting'; end if;
  select count(*) into n from public.sightings where id = 'pcheck-private';
  if n = 0 then passed := passed + 1; report := report || E'\n  ok    other divers cannot see a private sighting';
  else failed := failed + 1; report := report || E'\n  FAIL  another diver can read a private sighting'; end if;
  select count(*) into n from public.sighting_details where user_id = a;
  if n = 0 then passed := passed + 1; report := report || E'\n  ok    other divers cannot read private notes or photo paths';
  else failed := failed + 1; report := report || E'\n  FAIL  another diver can read private notes'; end if;
  select count(*) into n from storage.objects where bucket_id = 'sighting-photos-private' and name like a::text || '/%';
  if n = 0 then passed := passed + 1; report := report || E'\n  ok    other divers cannot read or list private photos';
  else failed := failed + 1; report := report || E'\n  FAIL  another diver can see a private photo'; end if;
  begin
    insert into public.sighting_details (sighting_id, user_id, notes) values ('pcheck-public', b, 'mine now');
    failed := failed + 1; report := report || E'\n  FAIL  a diver attached details to someone else''s sighting';
  exception when insufficient_privilege then
    passed := passed + 1; report := report || E'\n  ok    nobody attaches details to someone else''s sighting';
  end;
  update public.sightings set visibility = 'public' where id = 'pcheck-private';
  get diagnostics n = row_count;
  if n = 0 then passed := passed + 1; report := report || E'\n  ok    nobody can make someone else''s private sighting public';
  else failed := failed + 1; report := report || E'\n  FAIL  another diver changed a sighting''s visibility'; end if;
  reset role;

  -- An anonymous visitor.
  set local role anon;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  select count(*) into n from public.sightings where id in ('pcheck-public', 'pcheck-private');
  if n = 1 then passed := passed + 1; report := report || E'\n  ok    anonymous visitors see public sightings only';
  else failed := failed + 1; report := report || format(E'\n  FAIL  anonymous visitors see %s of the 1 public sighting', n); end if;
  begin
    select count(*) into n from public.sighting_details;
    if n = 0 then passed := passed + 1; report := report || E'\n  ok    anonymous visitors read no private details';
    else failed := failed + 1; report := report || E'\n  FAIL  anonymous visitors can read private details'; end if;
  exception when insufficient_privilege then
    passed := passed + 1; report := report || E'\n  ok    anonymous visitors read no private details';
  end;
  reset role;

  -- A makes the private sighting public, then deletes it: its details go with it.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  update public.sightings set visibility = 'public' where id = 'pcheck-private';
  get diagnostics n = row_count;
  if n = 1 then passed := passed + 1; report := report || E'\n  ok    the diver can change their sighting''s visibility';
  else failed := failed + 1; report := report || E'\n  FAIL  the diver could not change their sighting''s visibility'; end if;
  delete from public.sightings where id = 'pcheck-private';
  reset role;
  select count(*) into n from public.sighting_details where sighting_id = 'pcheck-private';
  if n = 0 then passed := passed + 1; report := report || E'\n  ok    deleting a sighting deletes its private details';
  else failed := failed + 1; report := report || E'\n  FAIL  private details outlived their sighting'; end if;

  raise exception '%', format(E'Privacy check: %s passed, %s failed. Nothing was saved (this error rolls the check back).%s', passed, failed, report);
end $$;
