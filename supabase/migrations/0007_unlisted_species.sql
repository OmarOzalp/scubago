-- 0007: "Something else" sightings, for animals that aren't in the ScubaGo catalogue.
--
-- The app logs them against one placeholder species, 'unlisted', and keeps the diver's own name
-- for the animal in sightings.custom_name. They stay out of collections and island art (the app
-- leaves 'unlisted' out of its catalogue) and can't be sent to a buddy to confirm.
--
-- Additive only: one species row and one nullable column. Apps from before this keep working, and
-- this app keeps syncing everything else against a project that hasn't applied it yet (it only
-- sends custom_name with "something else" sightings, and pulls without the column when it's missing).

insert into public.species (id, common_name, scientific_name, category, rarity, blurb)
values (
  'unlisted',
  'Something else',
  'Not in the ScubaGo catalogue',
  'other',
  'common',
  'An animal that isn''t in the catalogue yet, named by the diver.'
)
on conflict (id) do nothing;

alter table public.sightings
  add column if not exists custom_name text
  constraint sightings_custom_name_length check (custom_name is null or char_length(btrim(custom_name)) between 1 and 80);

-- Renaming what was seen voids a confirmation, like changing the species, site or date (0006).
create or replace function public.sighting_facts_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (new.species_id, new.site_id, new.sighted_on, new.custom_name)
     is distinct from (old.species_id, old.site_id, old.sighted_on, old.custom_name) then
    perform set_config('scubago.editing_sighting', new.id, true);
    delete from public.attestations where sighting_id = new.id;
    perform set_config('scubago.editing_sighting', '', true);
    new.status := 'unverified';
    new.status_changed_at := now();
  end if;
  return new;
end $$;
-- (CREATE OR REPLACE keeps the trigger from 0006 and the function's privileges.)
