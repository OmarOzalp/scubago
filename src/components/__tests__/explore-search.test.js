import { describe, expect, it } from '@jest/globals';

import { SEARCH_EXAMPLES, boundsOfSites, buildPlaces, searchExplore, searchPlaces, sectionLimit } from '@/components/explore/search';
import { SITES } from '@/data/sites';
import { CATALOG } from '@/lib/catalog';
import { normalizeSearch } from '@/lib/text-search';

const places = buildPlaces(SITES);
const search = (query) => searchExplore({ sites: SITES, places, species: CATALOG, query });
const kinds = (query) => search(query).sections.map((s) => s.kind);
const section = (query, kind) => search(query).sections.find((s) => s.kind === kind);
const names = (query, kind) => section(query, kind)?.items.map((i) => (i.kind === 'site' ? i.site.name : i.kind === 'place' ? i.place.name : i.species.commonName)) ?? [];
const egypt = SITES.filter((s) => s.country === 'Egypt');

describe('the places', () => {
  it('are the countries and the regions the sites are in, with the child regions’ sites counted in the parent', () => {
    const byId = new Map(places.map((p) => [p.id, p]));
    expect(byId.get('country:Egypt').siteIds).toHaveLength(egypt.length);
    expect(byId.get('country:Egypt').detail).toBe('Country');
    expect(byId.get('red-sea').siteIds).toHaveLength(egypt.length);
    expect(byId.get('red-sea').detail).toBe('Region');
    expect(byId.get('red-sea-hurghada').detail).toBe('Red Sea, Egypt');
    expect(byId.get('red-sea-hurghada').siteIds).toContain('ss-thistlegorm');
    const parts = ['red-sea-sinai', 'red-sea-hurghada', 'red-sea-southern', 'red-sea-offshore'].reduce((n, id) => n + byId.get(id).siteIds.length, 0);
    expect(parts).toBe(byId.get('red-sea').siteIds.length);
    expect(byId.get('great-barrier-reef').siteIds.length).toBeGreaterThanOrEqual(byId.get('gbr-cairns-cooktown').siteIds.length);
    // Every site is in its country's place, and a region without sites isn't offered.
    expect(places.filter((p) => p.id.startsWith('country:')).reduce((n, p) => n + p.siteIds.length, 0)).toBe(SITES.length);
    expect(places.every((p) => p.siteIds.length > 0)).toBe(true);
    expect(new Set(places.map((p) => p.id)).size).toBe(places.length);
  });

  it('are found by name, and "red sea" offers the parts of the Red Sea after the sea itself', () => {
    expect(searchPlaces(places, 'red sea').map((r) => r.place.name)).toEqual(['Red Sea', 'Hurghada & Safaga', 'Marsa Alam & the south', 'Sinai', 'Offshore reefs']);
    expect(searchPlaces(places, 'sinai')[0].place.id).toBe('red-sea-sinai');
    expect(searchPlaces(places, 'hurgada')[0].place.id).toBe('red-sea-hurghada');
    expect(searchPlaces(places, 'qqqqqq')).toEqual([]);
  });
});

describe('searching Explore', () => {
  it('finds "cod hole" under dive sites, once, and nothing else', () => {
    expect(kinds('cod hole')).toEqual(['sites']);
    expect(names('cod hole', 'sites')).toEqual(['Cod Hole']);
    expect(search('cod hole').top).toMatchObject({ kind: 'site', id: 'cod-hole' });
  });

  it('finds "manta" under animals as well as the Manta sites', () => {
    expect(kinds('manta')).toEqual(['sites', 'animals']);
    expect(names('manta', 'animals').slice(0, 2)).toEqual(['Reef Manta Ray', 'Oceanic Manta Ray']);
    expect(names('manta', 'sites')).toEqual(expect.arrayContaining(['Manta Point', 'Manta Sandy', 'Manta Alley']));
  });

  it('lists the Red Sea sites for "egypt" and for "hurghada", the place first', () => {
    for (const query of ['egypt', 'hurghada']) {
      expect(kinds(query)).toEqual(['places', 'sites']);
      expect(section(query, 'sites').items.every((i) => i.site.country === 'Egypt')).toBe(true);
    }
    expect(section('egypt', 'sites').items).toHaveLength(egypt.length);
    expect(section('hurghada', 'sites').items.length).toBeGreaterThan(80);
    expect(search('egypt').top).toMatchObject({ kind: 'place', id: 'country:Egypt' });
    expect(search('hurghada').top).toMatchObject({ kind: 'place', id: 'red-sea-hurghada' });
    expect(names('red sea', 'places')[0]).toBe('Red Sea');
    expect(names('great barrier reef', 'places')[0]).toBe('Great Barrier Reef');
  });

  it('forgives a typo in a site’s name', () => {
    expect(names('thistlegrom', 'sites')).toEqual(['SS Thistlegorm']);
    expect(search('ras moh').top).toMatchObject({ kind: 'site', id: 'shark-yolanda' });
    expect(names('whale shrak', 'animals')[0]).toBe('Whale Shark');
  });

  it('puts the section the query matches best first, sites before places before animals when they match equally', () => {
    expect(kinds('whale shark')).toEqual(['animals']);
    expect(search('whale shark').top).toMatchObject({ kind: 'animal', id: 'whale-shark' });
    // Exactly a site's name beats an animal's word.
    expect(kinds('blue hole')[0]).toBe('sites');
    // A country named in full beats the sites in it.
    expect(kinds('egypt')[0]).toBe('places');
    const equal = search('manta');
    expect(equal.sections[0].score).toBeGreaterThanOrEqual(equal.sections[1].score);
  });

  it('has nothing to say to an empty query or to nonsense', () => {
    expect(search('  ').sections).toEqual([]);
    expect(search('  ').top).toBeNull();
    expect(search('xyzzy').sections).toEqual([]);
  });

  it('keeps every match (the screen caps what it shows), best first', () => {
    const sites = section('egypt', 'sites');
    expect(sites.items).toHaveLength(egypt.length);
    // Curated sites first, then the imported ones by name.
    expect(sites.items[0].site.id.startsWith('osm-')).toBe(false);
    const imported = sites.items.map((i) => i.site).filter((s) => s.id.startsWith('osm-'));
    const keys = imported.map((s) => normalizeSearch(s.name));
    expect(keys.length).toBeGreaterThan(100);
    expect(keys).toEqual([...keys].sort());
  });

  it('shows six rows of a lone section, and fewer when several share the panel', () => {
    expect(sectionLimit(0, 1)).toBe(6);
    expect(sectionLimit(0, 2)).toBe(4);
    expect(sectionLimit(1, 2)).toBe(3);
    expect(sectionLimit(2, 3)).toBe(3);
  });

  it('is quick: a few hundred sites, the places and the whole catalogue', () => {
    search('warm up');
    const start = performance.now();
    for (const query of ['d', 'da', 'dah', 'daha', 'dahab', 'dahav', 'ras moh', 'zzzzqx']) search(query);
    expect(performance.now() - start).toBeLessThan(1500);
  });
});

describe('the suggestions for an empty search', () => {
  it('each find something of the kind they promise', () => {
    expect(SEARCH_EXAMPLES.map((e) => e.kind)).toEqual(['sites', 'places', 'animals']);
    for (const example of SEARCH_EXAMPLES) expect(kinds(example.query)).toContain(example.kind);
  });
});

describe('boundsOfSites', () => {
  it('is the box round some sites, or round all of them, or nothing', () => {
    const box = boundsOfSites(SITES, new Set(['ss-thistlegorm', 'shark-yolanda']));
    expect(box.south).toBeCloseTo(27.723);
    expect(box.north).toBeCloseTo(27.813);
    expect(box.west).toBeCloseTo(33.92);
    expect(box.east).toBeCloseTo(34.257);
    expect(boundsOfSites(SITES).south).toBeLessThan(box.south);
    expect(boundsOfSites(SITES, new Set(['nothing-here']))).toBeNull();
  });
});
