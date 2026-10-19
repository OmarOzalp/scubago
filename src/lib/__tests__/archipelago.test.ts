import { expect, test } from '@jest/globals';
import { AREAS, areaOf, foundAreas, residentsOf } from '../archipelago';
import { SPECIES } from '@/data/species';
import type { DexEntry, Species } from '../types';

test('every species in the catalog lives in exactly one area, and every area has residents', () => {
  const homes = AREAS.flatMap((area) => residentsOf(area.id).map((id) => ({ id, area: area.id })));
  const catalog = new Set(SPECIES.map((s) => s.id));
  // None the catalog doesn't have, none twice, none left out.
  for (const { id } of homes) expect(catalog.has(id)).toBe(true);
  expect(new Set(homes.map((h) => h.id)).size).toBe(homes.length);
  expect(homes).toHaveLength(SPECIES.length);
  for (const species of SPECIES) expect(areaOf(species.id)).not.toBeNull();
  for (const area of AREAS) expect(residentsOf(area.id).length).toBeGreaterThan(0);
  expect(areaOf('not-a-species')).toBeNull();
});

test('a few homes, as divers meet them', () => {
  expect(areaOf('clownfish')).toBe('coral-reef');
  expect(areaOf('humpback-whale')).toBe('open-ocean');
  expect(areaOf('sea-otter')).toBe('kelp-forest');
  expect(areaOf('dugong')).toBe('mangroves');
  expect(areaOf('marine-iguana')).toBe('volcanic-pinnacle');
  expect(areaOf('mimic-octopus')).toBe('black-sand-bay');
  expect(areaOf('goliath-grouper')).toBe('shipwreck');
});

const entry = (id: string, firstSeenOn: string): DexEntry => ({
  species: { ...SPECIES.find((s) => s.id === id)! } as Species, count: 1, firstSeenOn, firstSeenSiteId: 'blue-corner', lastSeenOn: firstSeenOn,
});

test('areas appear in the order they were found, each with the species that raised it and how many live there', () => {
  expect(foundAreas([])).toEqual([]);
  const found = foundAreas([
    entry('sea-otter', '2026-03-01'),
    entry('clownfish', '2026-02-10'),
    entry('reef-manta', '2026-01-05'),
    entry('humpback-whale', '2026-03-01'),
    entry('orca', '2026-02-20'),
  ]);
  expect(found.map((f) => f.area.id)).toEqual(['coral-reef', 'kelp-forest', 'open-ocean']);
  expect(found.map((f) => f.first.species.id)).toEqual(['reef-manta', 'orca', 'humpback-whale']);
  expect(found.map((f) => f.count)).toEqual([2, 2, 1]);
  // Found on the same day: in the archipelago's own order.
  expect(foundAreas([entry('humpback-whale', '2026-01-01'), entry('clownfish', '2026-01-01')]).map((f) => f.area.id)).toEqual(['coral-reef', 'open-ocean']);
  // A species the archipelago doesn't know raises nothing.
  expect(foundAreas([{ ...entry('clownfish', '2026-01-01'), species: { ...entry('clownfish', '2026-01-01').species, id: 'unknown' } }])).toEqual([]);
});
