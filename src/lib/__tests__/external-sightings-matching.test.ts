import { describe, expect, it } from '@jest/globals';

import { SPECIES } from '@/data/species';
import { catalogMatcher, createNameMatcher, isAboveSpecies, normalizeScientificName } from '@/lib/external-sightings/names';
import { SYNONYMS } from '@/lib/external-sightings/synonyms';

describe('normalising scientific names', () => {
  it('lowercases and keeps genus and species', () => {
    expect(normalizeScientificName('Mobula alfredi')).toBe('mobula alfredi');
    expect(normalizeScientificName('  Rhincodon   typus ')).toBe('rhincodon typus');
    expect(normalizeScientificName('RHINCODON TYPUS')).toBe('rhincodon typus');
  });

  it('strips author strings', () => {
    expect(normalizeScientificName('Mobula alfredi (Krefft, 1868)')).toBe('mobula alfredi');
    expect(normalizeScientificName('Carcharias taurus Rafinesque, 1810')).toBe('carcharias taurus');
    expect(normalizeScientificName('Hypanus americanus (Hildebrand & Schroeder, 1928)')).toBe('hypanus americanus');
    expect(normalizeScientificName('Sepia (Sepia) apama Gray, 1849')).toBe('sepia apama');
  });

  it('collapses subspecies and trinomials to the binomial', () => {
    expect(normalizeScientificName('Chelonia mydas japonica')).toBe('chelonia mydas');
    expect(normalizeScientificName('Mastigias papua etpisoni Hamner & Hamner, 1998')).toBe('mastigias papua');
    expect(normalizeScientificName('Trichechus manatus latirostris')).toBe('trichechus manatus');
  });

  it('refuses anything that is not a species', () => {
    for (const name of ['Mobula', 'Mobula sp.', 'Mobula spp', 'Mobula cf. alfredi', 'Mobula Rafinesque, 1810', 'Mobulidae', '', '   ']) {
      expect(normalizeScientificName(name)).toBeNull();
    }
    expect(normalizeScientificName('Amphiprion × leucokranos')).toBeNull();
    expect(normalizeScientificName(undefined)).toBeNull();
    expect(normalizeScientificName(42)).toBeNull();
    expect(normalizeScientificName({})).toBeNull();
  });

  it('knows which ranks are above species', () => {
    expect(isAboveSpecies('genus')).toBe(true);
    expect(isAboveSpecies('Family')).toBe(true);
    expect(isAboveSpecies('species')).toBe(false);
    expect(isAboveSpecies('subspecies')).toBe(false);
    expect(isAboveSpecies(undefined)).toBe(false);
  });
});

describe('matching names to the catalogue', () => {
  it('matches every catalogue species by its own scientific name', () => {
    for (const species of SPECIES) {
      expect(catalogMatcher.match(species.scientificName)).toBe(species.id);
    }
  });

  it('gives every catalogue species a different name', () => {
    const names = SPECIES.map((species) => normalizeScientificName(species.scientificName));
    expect(names.every((name) => name !== null)).toBe(true);
    expect(new Set(names).size).toBe(SPECIES.length);
  });

  it('matches through authors and subspecies', () => {
    expect(catalogMatcher.match('Mobula alfredi (Krefft, 1868)')).toBe('reef-manta');
    expect(catalogMatcher.match('Chelonia mydas japonica')).toBe('green-turtle');
    expect(catalogMatcher.match('MOBULA BIROSTRIS')).toBe('oceanic-manta');
  });

  it('follows renames and splits', () => {
    expect(catalogMatcher.match('Manta alfredi')).toBe('reef-manta');
    expect(catalogMatcher.match('Manta birostris')).toBe('oceanic-manta');
    expect(catalogMatcher.match('Mobula birostris')).toBe('oceanic-manta');
    expect(catalogMatcher.match('Eugomphodus taurus')).toBe('sand-tiger-shark');
    expect(catalogMatcher.match('Odontaspis taurus')).toBe('sand-tiger-shark');
    expect(catalogMatcher.match('Carcharias taurus')).toBe('sand-tiger-shark');
    expect(catalogMatcher.match('Epinephelus quinquefasciatus')).toBe('goliath-grouper');
    expect(catalogMatcher.match('Epinephelus itajara')).toBe('goliath-grouper');
    expect(catalogMatcher.match('Stegostoma fasciatum')).toBe('zebra-shark');
    expect(catalogMatcher.match('Aetobatus ocellatus')).toBe('spotted-eagle-ray');
    expect(catalogMatcher.match('Pristis microdon')).toBe('sawfish');
  });

  it('does not match other species of the same genus', () => {
    expect(catalogMatcher.match('Mobula tarapacana')).toBeUndefined();
    expect(catalogMatcher.match('Epinephelus coioides')).toBeUndefined();
    expect(catalogMatcher.match('Carcharhinus plumbeus')).toBeUndefined();
  });

  it('only maps synonyms to ids the catalogue holds', () => {
    const ids = new Set(SPECIES.map((species) => species.id));
    for (const [name, id] of Object.entries(SYNONYMS)) {
      expect({ name, known: ids.has(id) }).toEqual({ name, known: true });
    }
  });

  it('writes synonym keys as normalised binomials, and never takes a catalogue species’ own name', () => {
    const own = new Set(SPECIES.map((species) => normalizeScientificName(species.scientificName)));
    for (const name of Object.keys(SYNONYMS)) {
      expect({ name, normalised: normalizeScientificName(name) }).toEqual({ name, normalised: name });
      expect({ name, own: own.has(name) }).toEqual({ name, own: false });
    }
  });

  it('classifies a record as matched, unmatched or ignored', () => {
    expect(catalogMatcher.classify(['Chelonia mydas'])).toEqual({ kind: 'matched', speciesId: 'green-turtle' });
    expect(catalogMatcher.classify(['Acropora millepora'])).toEqual({ kind: 'unmatched' });
    // Above species: ignored, not counted as unmatched.
    expect(catalogMatcher.classify(['Chelonia'], 'genus')).toEqual({ kind: 'ignored' });
    expect(catalogMatcher.classify(['Cheloniidae'])).toEqual({ kind: 'ignored' });
    expect(catalogMatcher.classify(['Acropora'], 'genus')).toEqual({ kind: 'ignored' });
    // The second name is tried when the first is not ours.
    expect(catalogMatcher.classify(['Manta birostris', 'Mobula birostris'])).toEqual({ kind: 'matched', speciesId: 'oceanic-manta' });
    expect(catalogMatcher.classify(['Unknownus nameless', 'Mobula alfredi'])).toEqual({ kind: 'matched', speciesId: 'reef-manta' });
  });

  it('can be built over a smaller catalogue, ignoring synonyms for species it lacks', () => {
    const matcher = createNameMatcher([{ id: 'reef-manta', scientificName: 'Mobula alfredi' }]);
    expect(matcher.match('Manta alfredi')).toBe('reef-manta');
    expect(matcher.match('Manta birostris')).toBeUndefined();
  });
});
