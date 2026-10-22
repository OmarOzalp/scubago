import { describe, expect, it } from '@jest/globals';

import { SPECIES_ALIASES } from '@/data/species-aliases';
import { SPECIES } from '@/data/species';
import { SITES } from '@/data/sites';
import { editDistance, matchScore, normalizeSearch, scoreSites, scoreSpecies, searchSites, searchSpecies } from '@/lib/text-search';
import type { DiveSite } from '@/lib/types';

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

/** The plain textbook version (a full matrix), which the allocation-free one must agree with. */
function referenceDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

describe('editDistance (the fast one)', () => {
  it('agrees with the plain matrix version on random words, long ones and empty ones', () => {
    let seed = 7;
    const random = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
    const word = () => Array.from({ length: Math.floor(random() * 14) }, () => 'abcde'[Math.floor(random() * 5)]).join('');
    for (let i = 0; i < 400; i++) {
      const a = word();
      const b = word();
      expect(editDistance(a, b)).toBe(referenceDistance(a, b));
    }
    const long = 'x'.repeat(200);
    expect(editDistance(long, `${long}y`)).toBe(1);
    expect(editDistance('', 'abc')).toBe(3);
    expect(editDistance('abc', '')).toBe(3);
  });
});

describe('matchScore', () => {
  it('scores a shown name above another name, and a typo below both', () => {
    expect(matchScore('shark', ['Shark'])).toBe(100);
    expect(matchScore('shark', ['Whale'], ['Shark'])).toBe(75);
    expect(matchScore('sharq', ['Shark'])).toBe(35);
    expect(matchScore('', ['Shark'])).toBe(0);
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

  it('finds a site by its name first, once (OpenStreetMap’s Cod Hole is the curated one)', () => {
    const found = searchSites(SITES, 'cod hole');
    expect(found.map((s) => s.id)).toEqual(['cod-hole']);
  });

  it('lists the curated site first among sites that match as well', () => {
    const at = (id: string, name: string): DiveSite => ({ id, name, lat: 0, lng: 0, region: 'Somewhere', country: 'Nowhere', blurb: '', notableSpecies: [], source: 'seed' });
    const found = searchSites([at('osm-node-1', 'Twin Rock'), at('twin-rock', 'Twin Rock')], 'twin rock');
    expect(found.map((s) => s.id)).toEqual(['twin-rock', 'osm-node-1']);
  });

  it('forgives a typo in a site’s name', () => {
    expect(searchSites(SITES, 'thistlegrom')[0]?.name).toBe('SS Thistlegorm');
    expect(searchSites(SITES, 'thistlegorm')[0]?.name).toBe('SS Thistlegorm');
    expect(searchSites(SITES, 'Ras Mohamed')[0]?.name).toBe('Shark & Yolanda Reef');
  });

  it('lists a region’s or a country’s sites, including the ones whose own region text is shorter', () => {
    const hurghada = searchSites(SITES, 'hurghada');
    // The Thistlegorm's own region is just "Red Sea"; regions.ts puts it at Hurghada & Safaga.
    expect(hurghada.map((s) => s.id)).toContain('ss-thistlegorm');
    expect(hurghada.length).toBeGreaterThan(80);
    expect(hurghada.every((s) => s.country === 'Egypt')).toBe(true);
    const redSea = searchSites(SITES, 'red sea');
    expect(redSea.length).toBeGreaterThanOrEqual(SITES.filter((s) => s.country === 'Egypt').length);
    expect(searchSites(SITES, 'egypt')).toHaveLength(SITES.filter((s) => s.country === 'Egypt').length);
  });

  it('finds a site by its name and where it is, together', () => {
    const found = searchSites(SITES, 'manta point egypt');
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ name: 'Manta Point', country: 'Egypt' });
    expect(searchSites(SITES, 'manta point indonesia')[0]).toMatchObject({ id: 'manta-point-penida' });
  });

  it('ranks a name above a region, and sites that match equally well curated first, then by name', () => {
    const sites: DiveSite[] = [
      { id: 'osm-node-2', name: 'Zebra Reef', region: 'Dahab', country: 'Egypt', lat: 0, lng: 0, blurb: '', notableSpecies: [], source: 'seed' },
      { id: 'osm-node-1', name: 'Anchor Reef', region: 'Dahab', country: 'Egypt', lat: 0, lng: 0, blurb: '', notableSpecies: [], source: 'seed' },
      { id: 'seed-1', name: 'Mid Reef', region: 'Dahab', country: 'Egypt', lat: 0, lng: 0, blurb: '', notableSpecies: [], source: 'seed' },
      { id: 'seed-2', name: 'Dahab Lighthouse', region: 'Elsewhere', country: 'Egypt', lat: 0, lng: 0, blurb: '', notableSpecies: [], source: 'seed' },
    ];
    expect(searchSites(sites, 'dahab').map((s) => s.id)).toEqual(['seed-2', 'seed-1', 'osm-node-1', 'osm-node-2']);
  });

  it('returns every site for an empty query, and none for nonsense', () => {
    expect(searchSites(SITES, '  ')).toHaveLength(SITES.length);
    expect(searchSites(SITES, 'qqqqqqq')).toEqual([]);
    expect(scoreSites(SITES, '')).toEqual([]);
    expect(scoreSpecies(SPECIES, '')).toEqual([]);
  });

  it('says how well each matched, best first', () => {
    const scores = scoreSites(SITES, 'cod hole').map((r) => r.score);
    expect(scores[0]).toBe(100);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    expect(scoreSpecies(SPECIES, 'whale shark')[0]).toMatchObject({ score: 100 });
  });

  it('is quick on a few hundred sites, even for a typo that has to try every name', () => {
    const many = SITES.flatMap((s, i) => [s, { ...s, id: `${s.id}-2`, name: `${s.name} ${i}` }, { ...s, id: `${s.id}-3`, name: `${s.name} ${i + 1000}` }]);
    searchSites(many, 'warm up the index');
    const start = performance.now();
    for (const query of ['d', 'da', 'dah', 'daha', 'dahab', 'dahav', 'zzzzqx']) searchSites(many, query);
    expect(performance.now() - start).toBeLessThan(1500);
  });
});
