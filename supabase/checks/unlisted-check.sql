-- Checks migration 0007 ("something else" sightings). Run it in the Supabase SQL editor after
-- applying 0007: every line should say ok. It works on throwaway rows and rolls everything back.
begin;
insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000c0007', 'unlisted-check@example.invalid');
insert into public.profiles (user_id, username) values ('00000000-0000-4000-8000-0000000c0007', 'unlisted-check');
insert into public.dive_sites (id, name, lat, lng, source) values ('unlisted-check-site', 'Check reef', -16.9, 146.0, 'seed');
select case when exists (select 1 from public.species where id = 'unlisted' and category = 'other') then 'ok' else 'FAIL' end as "placeholder species exists";

do $$
declare a uuid := '00000000-0000-4000-8000-0000000c0007';
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  insert into public.sightings (id, user_id, species_id, site_id, sighted_on, custom_name)
    values ('unlisted-check-1', a, 'unlisted', 'unlisted-check-site', '2026-10-01', 'Mystery nudibranch');
  raise notice 'ok: owner logs a something-else sighting with a name';
  begin
    insert into public.sightings (id, user_id, species_id, site_id, sighted_on, custom_name)
      values ('unlisted-check-2', a, 'unlisted', 'unlisted-check-site', '2026-10-01', repeat('x', 81));
    raise notice 'FAIL: an 81-character name was accepted';
  exception when check_violation then raise notice 'ok: names over 80 characters are refused';
  end;
  begin
    insert into public.sightings (id, user_id, species_id, site_id, sighted_on, custom_name)
      values ('unlisted-check-3', a, 'unlisted', 'unlisted-check-site', '2026-10-01', '   ');
    raise notice 'FAIL: a blank name was accepted';
  exception when check_violation then raise notice 'ok: blank names are refused';
  end;
  -- Older apps never send the column: still fine.
  insert into public.sightings (id, user_id, species_id, site_id, sighted_on) values ('unlisted-check-4', a, 'unlisted', 'unlisted-check-site', '2026-10-01');
  raise notice 'ok: a row without custom_name is still accepted';
end $$;
reset role;  -- set local role lasts until the end of the transaction

-- A confirmed sighting (status set the way ScubaGo's own functions do, as the owner role).
update public.sightings set status = 'confirmed', status_changed_at = now() where id = 'unlisted-check-1';

do $$
declare a uuid := '00000000-0000-4000-8000-0000000c0007'; st text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  update public.sightings set notes = 'more detail' where id = 'unlisted-check-1';
  select status into st from public.sightings where id = 'unlisted-check-1';
  if st = 'confirmed' then raise notice 'ok: editing notes keeps the confirmation'; else raise notice 'FAIL: notes edit changed status to %', st; end if;
  update public.sightings set custom_name = 'Actually a flatworm' where id = 'unlisted-check-1';
  select status into st from public.sightings where id = 'unlisted-check-1';
  if st = 'unverified' then raise notice 'ok: renaming what was seen voids the confirmation'; else raise notice 'FAIL: rename left status %', st; end if;
end $$;
reset role;  -- set local role lasts until the end of the transaction
rollback;
