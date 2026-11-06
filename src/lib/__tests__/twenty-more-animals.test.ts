/**
 * The twenty animals added after the first 120 (docs/marine-species-art.md): their names, photos,
 * homes, swimming models, search names, groups and real records. The plates are another test's.
 */
import { describe, expect, it } from '@jest/globals';

import encounterRarity from '@/data/encounter-rarity.json';
import photos from '@/data/species-photos.json';
import { SPECIES, SPECIES_BY_ID } from '@/data/species';
import { SITES } from '@/data/sites';
import { areaOf, islandOf, residentsOf, AREAS } from '@/lib/archipelago';
import { catalogMatcher } from '@/lib/external-sightings/names';
import { GROUP_SIZES, GROUP_STYLES, groupSizes } from '@/lib/marine-groups';
import { marineModelFor, speciesMarineModel } from '@/lib/swimming';
import { searchSpecies } from '@/lib/text-search';

/** id -> the scientific name iNaturalist accepts for it (checked against its taxa, 6 November 2026). */
const NEW: Record<string, string> = {
  'epaulette-shark': 'Hemiscyllium ocellatum',
  'brownbanded-bamboo-shark': 'Chiloscyllium punctatum',
  angelshark: 'Squatina squatina',
  'blue-shark': 'Prionace glauca',
  'silvertip-shark': 'Carcharhinus albimarginatus',
  'bull-ray': 'Aetomylaeus bovinus',
  'cownose-ray': 'Rhinoptera bonasus',
  'bat-ray': 'Myliobatis californica',
  'blotched-fantail-ray': 'Taeniurops meyeni',
  'short-finned-pilot-whale': 'Globicephala macrorhynchus',
  'common-minke-whale': 'Balaenoptera acutorostrata',
  'common-dolphin': 'Delphinus delphis',
  'bluestreak-cleaner-wrasse': 'Labroides dimidiatus',
  'picasso-triggerfish': 'Rhinecanthus aculeatus',
  'masked-butterflyfish': 'Chaetodon semilarvatus',
  'pygmy-sweeper': 'Parapriacanthus ransonneti',
  'longnose-hawkfish': 'Oxycirrhites typus',
  'banded-coral-shrimp': 'Stenopus hispidus',
  'varicose-wart-slug': 'Phyllidia varicosa',
  'hairy-squat-lobster': 'Lauriea siagiani',
};
const IDS = Object.keys(NEW);

describe('the twenty new animals', () => {
  it('are in the catalogue with the names iNaturalist accepts', () => {
    for (const id of IDS) expect({ id, name: SPECIES_BY_ID.get(id)?.scientificName }).toEqual({ id, name: NEW[id] });
  });

  it('each have a photo, under a licence that allows any use with credit', () => {
    const entries = photos as Record<string, { url: string; license: string; attribution: string }>;
    for (const id of IDS) {
      expect({ id, ok: /^(CC0|CC BY|CC BY-SA)$/.test(entries[id]?.license ?? '') }).toEqual({ id, ok: true });
      expect(entries[id].url).toMatch(/^https:\/\/inaturalist-open-data\.s3\.amazonaws\.com\/photos\/\d+\/medium\.jpe?g$/);
    }
  });

  it('each live in one archipelago area, as divers meet them', () => {
    const homes: Record<string, string> = {
      'epaulette-shark': 'coral-reef', 'brownbanded-bamboo-shark': 'coral-reef', 'silvertip-shark': 'coral-reef', 'bluestreak-cleaner-wrasse': 'coral-reef',
      'picasso-triggerfish': 'coral-reef', 'masked-butterflyfish': 'coral-reef', 'longnose-hawkfish': 'coral-reef', 'banded-coral-shrimp': 'coral-reef',
      'blue-shark': 'open-ocean', 'short-finned-pilot-whale': 'open-ocean', 'common-minke-whale': 'open-ocean', 'common-dolphin': 'open-ocean',
      'bat-ray': 'kelp-forest', 'cownose-ray': 'mangroves', 'angelshark': 'black-sand-bay', 'varicose-wart-slug': 'black-sand-bay',
      'hairy-squat-lobster': 'black-sand-bay', 'bull-ray': 'shipwreck', 'pygmy-sweeper': 'shipwreck', 'blotched-fantail-ray': 'coral-reef',
    };
    for (const id of IDS) expect({ id, area: areaOf(id) }).toEqual({ id, area: homes[id] });
    // Each is in exactly one area's residents.
    for (const id of IDS) expect(AREAS.filter((a) => residentsOf(a.id).includes(id))).toHaveLength(1);
    expect(islandOf('bat-ray')).toBe('kelp-forest');
    expect(islandOf('blue-shark')).toBe('coral-reef'); // the Open Ocean has no island: its animals swim at Home
  });

  it('swim on the island with their family’s model: every shark, ray and mammal, none borrowed as a 3D model of its own', () => {
    const expected: Record<string, string> = {
      'bull-ray': 'spotted-eagle-ray', 'cownose-ray': 'spotted-eagle-ray', 'bat-ray': 'spotted-eagle-ray', 'blotched-fantail-ray': 'southern-stingray',
      angelshark: 'southern-stingray', 'epaulette-shark': 'whitetip-reef-shark', 'brownbanded-bamboo-shark': 'whitetip-reef-shark',
      'silvertip-shark': 'grey-reef-shark', 'blue-shark': 'oceanic-whitetip', 'short-finned-pilot-whale': 'orca', 'common-minke-whale': 'humpback-whale',
      'common-dolphin': 'bottlenose-dolphin',
    };
    for (const [id, model] of Object.entries(expected)) {
      expect({ id, model: marineModelFor(SPECIES_BY_ID.get(id)!) }).toEqual({ id, model });
      expect(speciesMarineModel(id)).toBeNull();
    }
    // The reef fish keep the fish family's model; the small macro animals have none, like the others.
    for (const id of ['bluestreak-cleaner-wrasse', 'picasso-triggerfish', 'masked-butterflyfish', 'pygmy-sweeper', 'longnose-hawkfish']) {
      expect(marineModelFor(SPECIES_BY_ID.get(id)!)).toBe('reef-fish');
    }
    for (const id of ['banded-coral-shrimp', 'varicose-wart-slug', 'hairy-squat-lobster']) expect(marineModelFor(SPECIES_BY_ID.get(id)!)).toBeNull();
    for (const s of SPECIES.filter((x) => ['shark', 'ray', 'mammal'].includes(x.category) && IDS.includes(x.id))) expect(marineModelFor(s)).not.toBeNull();
  });

  it('are found by the names divers use', () => {
    const first = (q: string) => searchSpecies(SPECIES, q)[0]?.id;
    expect(first('walking shark')).toBe('epaulette-shark');
    expect(first('bamboo shark')).toBe('brownbanded-bamboo-shark');
    expect(first('angel shark')).toBe('angelshark');
    expect(first('blue shark')).toBe('blue-shark');
    expect(first('duckbill ray')).toBe('bull-ray');
    expect(first('cow nose ray')).toBe('cownose-ray');
    expect(searchSpecies(SPECIES, 'pilot whale').map((s) => s.id)).toContain('short-finned-pilot-whale');
    expect(searchSpecies(SPECIES, 'minke').map((s) => s.id)).toContain('common-minke-whale');
    expect(searchSpecies(SPECIES, 'cleaner wrasse').map((s) => s.id)).toContain('bluestreak-cleaner-wrasse');
    expect(searchSpecies(SPECIES, 'humuhumu').map((s) => s.id)).toContain('picasso-triggerfish');
    expect(searchSpecies(SPECIES, 'squat lobster').map((s) => s.id)).toContain('hairy-squat-lobster');
    expect(searchSpecies(SPECIES, 'nudibranch').map((s) => s.id)).toContain('varicose-wart-slug');
    expect(searchSpecies(SPECIES, 'dolphin').map((s) => s.id)).toContain('common-dolphin');
  });

  it('the pods, schools and clouds swim in groups, with the style of their model', () => {
    for (const id of ['common-dolphin', 'short-finned-pilot-whale', 'cownose-ray', 'pygmy-sweeper']) {
      expect(GROUP_SIZES[id]).toBeDefined();
      expect(GROUP_STYLES[marineModelFor(SPECIES_BY_ID.get(id)!)!]).toBeDefined();
    }
    const sizes = groupSizes([{ id: 'common-dolphin', model: 'bottlenose-dolphin' }, { id: 'bat-ray', model: 'spotted-eagle-ray' }], 6, 0.5);
    expect(sizes[0]).toBeGreaterThan(1);
    expect(sizes[1]).toBe(1); // the bat ray goes alone
  });
});

describe('the same animal under two ids', () => {
  // The blotched fantail ray was added as an id of its own, but it is the animal the catalogue already
  // had as the marbled ray (both Taeniurops meyeni). Until one of them goes, the older keeps the name:
  // its records, its rarity and its divers’ sightings do not move.
  it('never takes the name, the records or the rarity of the animal that was there first', () => {
    const names = new Map<string, string[]>();
    for (const s of SPECIES) names.set(s.scientificName, [...(names.get(s.scientificName) ?? []), s.id]);
    const shared = [...names.values()].filter((ids) => ids.length > 1);
    expect(shared).toEqual([['marbled-ray', 'blotched-fantail-ray']]);
    expect(catalogMatcher.match('Taeniurops meyeni')).toBe('marbled-ray');
    expect(catalogMatcher.match('Taeniura meyeni')).toBe('marbled-ray');
    expect(catalogMatcher.classify(['Taeniurops meyeni'])).toEqual({ kind: 'matched', speciesId: 'marbled-ray' });
  });
});

describe('real records of the new animals', () => {
  const tiers = encounterRarity as { species: Record<string, { tier: string; sites: number; recordedAt: number }>; unresolved: { id: string; reason: string }[] };

  it('every new animal is tiered from encounters, or listed as unresolved with the reason; never both and never neither', () => {
    for (const id of IDS) {
      const tiered = id in tiers.species;
      const unresolved = tiers.unresolved.some((u) => u.id === id);
      expect({ id, tiered, unresolved }).toEqual({ id, tiered: !unresolved, unresolved: !tiered });
    }
  });

  it('the curated sites list the new animals that real records, or the dive, put there', () => {
    const at = (id: string) => SITES.find((s) => s.id === id)!.notableSpecies;
    expect(at('la-jolla-cove')).toEqual(expect.arrayContaining(['bat-ray', 'common-dolphin']));
    expect(at('north-horn')).toContain('silvertip-shark');
    expect(at('nudi-falls')).toEqual(expect.arrayContaining(['varicose-wart-slug', 'hairy-squat-lobster']));
    expect(at('shark-yolanda')).toEqual(expect.arrayContaining(['masked-butterflyfish', 'bluestreak-cleaner-wrasse']));
    // Each is a catalogue animal, listed once.
    for (const site of SITES) {
      expect(new Set(site.notableSpecies).size).toBe(site.notableSpecies.length);
      for (const id of site.notableSpecies) expect(SPECIES_BY_ID.has(id)).toBe(true);
    }
  });
});
