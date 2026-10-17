import { describe, expect, it } from '@jest/globals';

import { SPECIES_ALIASES } from '@/data/species-aliases';
import { SPECIES } from '@/data/species';
import { SITES } from '@/data/sites';
import { editDistance, normalizeSearch, searchSites, searchSpecies } from '@/lib/text-search';

const top = (query: string) => searchSpecies(SPECIES, query)[0]?.commonName;
const ids = (query: string) => searchSpecies(SPECIES, query).map((s) => s.id);

describe('normalizeSearch', () => {
  it('drops accents, apostrophes of either kind and punctuation, and picks one spelling', () => {
    expect(normalizeSearch('Galápagos Shark')).toBe('galapagos shark');
    expect(normalizeSearch('Munk’s Devil Ray')).toBe(normalizeSearch("munk's devil ray"));
    expect(normalizeSearch('Zebra (Leopard) Shark')).toBe('zebra leopard shark');
    expect(normalizeSearch('Grey Reef')).toBe(normalizeSearch('gray reef'));
    expect(normalizeSearch('Harbour Seal')).toBe('harbor seal');
  });
});

describe('editDistance', () => {
  it('counts a swapped pair of letters as one typo', () => {
    expect(editDistance('hamemrhead', 'hammerhead')).toBe(1);
    expect(editDistance('octpus', 'octopus')).toBe(1);
    expect(editDistance('shark', 'shark')).toBe(0);
  });
});

describe('searchSpecies', () => {
  it('finds the searches that used to come back empty', () => {
    expect(top('galapagos')).toBe('Galápagos Shark');
    expect(top("munk's")).toBe('Munk’s Devil Ray');
    expect(top('gray reef')).toBe('Grey Reef Shark');
    expect(top('harbour seal')).toBe('Harbor Seal');
    expect(top('humphead wrasse')).toBe('Napoleon Wrasse');
    expect(ids('nudibranch')).toEqual(expect.arrayContaining(['spanish-dancer', 'pikachu-nudibranch', 'anna-chromodoris']));
  });

  it('knows the names divers actually use', () => {
    expect(top('killer whale')).toBe('Orca');
    expect(ids('manta').slice(0, 2).sort()).toEqual(['oceanic-manta', 'reef-manta']);
    expect(top('nemo')).toBe('Ocellaris Clownfish');
    expect(top('sea horse')).toBe('Common Seahorse');
    expect(top('Rhincodon')).toBe('Whale Shark');
  });

  it('forgives a typo or two', () => {
    expect(top('whale shrak')).toBe('Whale Shark');
    expect(ids('hamerhead')).toEqual(expect.arrayContaining(['great-hammerhead', 'scalloped-hammerhead']));
    expect(top('cuttlefsh')).toMatch(/Cuttlefish/);
    expect(top('baracuda')).toMatch(/Barracuda/);
  });

  it('puts the obvious match first', () => {
    expect(top('tiger shark')).toBe('Tiger Shark');
    expect(top('whale')).toBe('Whale Shark');
    expect(top('reef manta')).toBe('Reef Manta Ray');
  });

  it('doesn’t match everything for a short or unrelated query', () => {
    expect(searchSpecies(SPECIES, 'xyz')).toEqual([]);
    expect(searchSpecies(SPECIES, 'qqqqqq')).toEqual([]);
    expect(searchSpecies(SPECIES, '  ')).toHaveLength(SPECIES.length);
  });

  it('only lists aliases for species that exist', () => {
    const known = new Set(SPECIES.map((s) => s.id));
    expect(Object.keys(SPECIES_ALIASES).filter((id) => !known.has(id))).toEqual([]);
  });
});

describe('searchSites', () => {
  it('matches names, regions and countries without accents or exact spelling', () => {
    expect(searchSites(SITES, 'richelieu')[0]?.name).toBe('Richelieu Rock');
    expect(searchSites(SITES, 'richleu')[0]?.name).toBe('Richelieu Rock');
    expect(searchSites(SITES, 'egypt').every((s) => s.country === 'Egypt')).toBe(true);
  });
});
