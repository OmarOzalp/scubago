import { describe, expect, it, jest } from '@jest/globals';

import osmSites from '@/data/osm-sites.json';
import osmMeta from '@/data/osm-sites.meta.json';
import { REGIONS, REGIONS_BY_ID } from '@/data/regions';
import { RETIRED_SITE_IDS, SEED_SITES, SITES, SITES_BY_ID } from '@/data/sites';
import {
  IMPORT_AREAS,
  IMPORT_REGION_IDS,
  accessFromTags,
  assignRegion,
  blurbFor,
  classifyTags,
  dedupeWithinImport,
  difficultyFromTags,
  distanceM,
  diveTypesFromTags,
  importElements,
  looksTruncated,
  matchSeeds,
  mergeSites,
  mergeWithPrevious,
  namesSimilar,
  normaliseSiteName,
  osmElementToSite,
  parseDepthM,
  sortById,
  type OsmSiteRecord,
  type OverpassElement,
  type OverpassResponse,
} from '@/lib/site-import';
import type { DiveSite } from '@/lib/types';
// A HAND-WRITTEN fixture shaped like an Overpass response: invented "Fixture ..." names and made-up
// ids, never OSM data. It is also what `npx tsx scripts/osm-sites/import.ts --input` is tried on.
import fixtureJson from '../../../scripts/osm-sites/fixtures/overpass-sample.json';

const fixture = fixtureJson as unknown as OverpassResponse;
const DAY = '2026-10-22';

/** An element for a test, hand-written: a dive spot at a position unless the tags say otherwise. */
function node(id: number, lat: number, lon: number, tags: Record<string, string>): OverpassElement {
  return { type: 'node', id, lat, lon, tags };
}
const spot = (name: string, extra: Record<string, string> = {}) => ({ 'scuba_diving:divespot': 'yes', sport: 'scuba_diving', name, ...extra });

function siteOf(element: OverpassElement): DiveSite {
  const result = osmElementToSite(element, DAY);
  if (!result.ok) throw new Error(`skipped: ${result.reason}`);
  return result.site;
}

/** A site for the duplicate tests (a few fields, the rest left out). */
function plain(id: string, name: string, lat: number, lng: number, extra: Partial<DiveSite> = {}): DiveSite {
  return {
    id, name, lat, lng, region: 'R', country: 'C', blurb: 'B', notableSpecies: [], source: 'seed',
    externalIds: [{ scheme: 'osm', id: id.replace(/^osm-/, '').replace('-', '/'), relation: 'same_as' }],
    ...extra,
  };
}

describe('dive spots versus dive centres', () => {
  it('takes divespot=yes, and a wreck, reef or cave entrance tagged for scuba diving', () => {
    expect(classifyTags({ 'scuba_diving:divespot': 'yes' })).toBe('spot');
    expect(classifyTags({ sport: 'scuba_diving', historic: 'wreck' })).toBe('spot');
    expect(classifyTags({ sport: 'swimming;scuba_diving', natural: 'reef' })).toBe('spot');
    expect(classifyTags({ sport: 'scuba_diving', natural: 'cave_entrance' })).toBe('spot');
  });

  it('leaves out dive centres, shops, clubs, schools, hotels and resorts, even when they say divespot=yes', () => {
    const base = { sport: 'scuba_diving', 'scuba_diving:divespot': 'yes' };
    const businesses: Record<string, string>[] = [
      { sport: 'scuba_diving', amenity: 'dive_centre' },
      { ...base, amenity: 'dive_centre' },
      { sport: 'scuba_diving', shop: 'scuba_diving' },
      { sport: 'scuba_diving', club: 'scuba_diving' },
      { ...base, amenity: 'school' },
      { ...base, tourism: 'hotel' },
      { ...base, leisure: 'resort' },
      { ...base, office: 'travel_agent' },
    ];
    for (const tags of businesses) expect(classifyTags(tags)).toBe('dive-business');
  });

  it('takes sport=scuba_diving alone, the way real Great Barrier Reef and Red Sea sites are tagged', () => {
    expect(classifyTags({ sport: 'scuba_diving' })).toBe('spot');
    expect(classifyTags({ sport: 'scuba_diving', tourism: 'attraction', 'scuba_diving:entry:boat': 'yes', name: 'Anemone City' })).toBe('spot');
    expect(classifyTags({ sport: 'scuba_diving', mooring: 'yes', name: 'Plate Top' })).toBe('spot');
  });

  it('does not take a divespot=no, a bare wreck, or a place named like a dive business', () => {
    expect(classifyTags({ sport: 'scuba_diving', 'scuba_diving:divespot': 'no', historic: 'wreck' })).toBe('not-a-dive-spot');
    expect(classifyTags({ historic: 'wreck' })).toBe('not-a-dive-spot');
    expect(classifyTags({ sport: 'scuba_diving', tourism: 'attraction', name: 'Down Under Diving' })).toBe('dive-business');
    expect(classifyTags({ sport: 'scuba_diving', name: 'Blue Planet Dive Centre' })).toBe('dive-business');
    expect(classifyTags({ sport: 'scuba_diving', name: 'Coral Garden' })).toBe('spot');
    expect(classifyTags({ sport: 'scuba_diving', name: 'DECO International hyperbaric chamber' })).toBe('dive-business');
  });

  it('leaves out lakes, quarries and pools, which are not the sea', () => {
    expect(classifyTags({ 'scuba_diving:divespot': 'yes', water: 'lake' })).toBe('inland-water');
    expect(classifyTags({ 'scuba_diving:divespot': 'yes', landuse: 'quarry' })).toBe('inland-water');
  });

  it('reports the reason for each skipped element in the fixture', () => {
    const result = importElements(fixture.elements, { retrievedOn: DAY });
    expect(result.skippedByReason).toEqual({
      'dive-business': 5, 'not-a-dive-spot': 1, unnamed: 1, 'outside-area': 2, 'no-position': 1, 'inland-water': 1, 'repeated-element': 1,
    });
    const businessIds = ['node/9000000011', 'node/9000000012', 'node/9000000013', 'node/9000000014'];
    expect(result.sites.some((s) => businessIds.includes(s.externalIds?.[0].id ?? ''))).toBe(false);
  });
});

describe('positions and names', () => {
  it('uses a way’s or relation’s center, and a node’s own position', () => {
    const way: OverpassElement = { type: 'way', id: 7, center: { lat: 27.2, lon: 33.9 }, tags: spot('A Way') };
    const relation: OverpassElement = { type: 'relation', id: 8, center: { lat: -16.9, lon: 146.0 }, tags: spot('A Relation') };
    expect(siteOf(way)).toMatchObject({ id: 'osm-way-7', lat: 27.2, lng: 33.9, country: 'Egypt' });
    expect(siteOf(relation)).toMatchObject({ id: 'osm-relation-8', lat: -16.9, lng: 146, country: 'Australia' });
    expect(siteOf(node(9, 27.2, 33.9, spot('A Node')))).toMatchObject({ id: 'osm-node-9' });
  });

  it('rounds to five decimals and skips an element with no position', () => {
    expect(siteOf(node(1, 27.123456789, 33.987654321, spot('X')))).toMatchObject({ lat: 27.12346, lng: 33.98765 });
    expect(osmElementToSite({ type: 'way', id: 2, tags: spot('No centre') }, DAY)).toMatchObject({ ok: false, reason: 'no-position' });
  });

  it('prefers name:en to name, tidies whitespace, and skips an unnamed spot', () => {
    expect(siteOf(node(1, 27.2, 33.9, spot('الاسم', { 'name:en': '  Blue   Wall ' }))).name).toBe('Blue Wall');
    expect(siteOf(node(2, 27.2, 33.9, spot('Only Name'))).name).toBe('Only Name');
    const { name: _name, ...unnamed } = spot('x');
    expect(osmElementToSite(node(3, 27.2, 33.9, unnamed), DAY)).toMatchObject({ ok: false, reason: 'unnamed' });
  });

  it('keeps the stable id and the OSM external id', () => {
    const site = siteOf({ type: 'relation', id: 4455, center: { lat: 27.2, lon: 33.9 }, tags: spot('R') });
    expect(site.id).toBe('osm-relation-4455');
    expect(site.externalIds).toEqual([{ scheme: 'osm', id: 'relation/4455', relation: 'same_as' }]);
  });
});

describe('regions', () => {
  const regionAt = (lat: number, lng: number) => assignRegion(lat, lng)?.regionId ?? null;

  it('splits the Great Barrier Reef into the four management areas by latitude', () => {
    expect(regionAt(-12.5, 143.8)).toBe('gbr-far-northern');
    expect(regionAt(-14.59, 145.6)).toBe('gbr-far-northern');
    expect(regionAt(-14.67, 145.45)).toBe('gbr-cairns-cooktown');
    expect(regionAt(-16.9, 146.0)).toBe('gbr-cairns-cooktown');
    expect(regionAt(-17.99, 146.2)).toBe('gbr-cairns-cooktown');
    expect(regionAt(-18.01, 147.0)).toBe('gbr-townsville-whitsunday');
    expect(regionAt(-19.3, 147.6)).toBe('gbr-townsville-whitsunday');
    expect(regionAt(-20.64, 149.0)).toBe('gbr-townsville-whitsunday');
    expect(regionAt(-20.66, 150.0)).toBe('gbr-mackay-capricorn');
    expect(regionAt(-24.11, 152.7)).toBe('gbr-mackay-capricorn');
  });

  it('puts the Coral Sea reefs east of the outer barrier in coral-sea', () => {
    // Probe points at well-known reefs: outer barrier (Great Barrier Reef) and Coral Sea reefs beyond it.
    for (const [lat, lng] of [[-14.7, 145.65], [-16.85, 146.2], [-19.75, 149.2], [-21.7, 152.3]]) expect(regionAt(lat, lng)).toMatch(/^gbr-/);
    for (const [lat, lng] of [[-13.88, 146.55], [-15.47, 147.08], [-16.47, 147.85], [-17.73, 148.45], [-19.1, 152.3]]) expect(regionAt(lat, lng)).toBe('coral-sea');
  });

  it('leaves out what is north of the Marine Park, south of it, or somewhere else', () => {
    expect(regionAt(-10.58, 142.22)).toBeNull(); // Torres Strait
    expect(regionAt(-28.0, 153.4)).toBeNull(); // Gold Coast
    expect(regionAt(-17.7, 178.0)).toBeNull(); // Fiji
  });

  it('puts the Egyptian Red Sea areas where the rules say', () => {
    expect(regionAt(27.25, 33.8)).toBe('red-sea-hurghada'); // Hurghada
    expect(regionAt(26.75, 33.95)).toBe('red-sea-hurghada'); // Safaga
    expect(regionAt(27.81, 33.92)).toBe('red-sea-hurghada'); // Strait of Gubal
    expect(regionAt(27.73, 34.25)).toBe('red-sea-sinai'); // Ras Mohammed
    expect(regionAt(27.85, 34.3)).toBe('red-sea-sinai'); // Sharm el-Sheikh
    expect(regionAt(27.95, 34.55)).toBe('red-sea-sinai'); // Straits of Tiran
    expect(regionAt(28.5, 34.5)).toBe('red-sea-sinai'); // Dahab
    expect(regionAt(29.03, 34.65)).toBe('red-sea-sinai'); // Nuweiba
    expect(regionAt(25.07, 34.89)).toBe('red-sea-southern'); // Marsa Alam
    expect(regionAt(24.1, 35.4)).toBe('red-sea-southern'); // Fury Shoals
    expect(regionAt(26.1, 34.28)).toBe('red-sea-southern'); // Quseir
    expect(regionAt(29.9, 32.6)).toBe('gulf-of-suez'); // Suez
    expect(regionAt(28.36, 33.08)).toBe('gulf-of-suez'); // Ras Gharib
  });

  it('puts the offshore reefs in red-sea-offshore, ahead of the coast around them', () => {
    expect(regionAt(26.3, 34.85)).toBe('red-sea-offshore'); // Brothers
    expect(regionAt(25.31, 34.86)).toBe('red-sea-offshore'); // Elphinstone
    expect(regionAt(24.93, 35.87)).toBe('red-sea-offshore'); // Daedalus
    expect(regionAt(23.62, 36.2)).toBe('red-sea-offshore'); // Zabargad
    expect(regionAt(23.56, 36.25)).toBe('red-sea-offshore'); // Rocky Island
    expect(regionAt(22.4, 36.3)).toBe('red-sea-offshore'); // towards St John's
  });

  it('does not take the other shores of the Gulf of Aqaba or the Red Sea, or the Mediterranean', () => {
    expect(regionAt(29.56, 34.95)).toBeNull(); // Eilat
    expect(regionAt(28.4, 34.77)).toBeNull(); // Saudi shore opposite Dahab
    expect(regionAt(28.5, 35.0)).toBeNull();
    expect(regionAt(26.2, 36.45)).toBeNull(); // Saudi coast
    expect(regionAt(31.2, 29.9)).toBeNull(); // Mediterranean coast of Egypt
  });

  it('only gives region ids that exist, with parents that exist, and a blurb for each', () => {
    expect(IMPORT_REGION_IDS.length).toBeGreaterThanOrEqual(10);
    for (const id of IMPORT_REGION_IDS) {
      const region = REGIONS_BY_ID.get(id);
      expect(region).toBeDefined();
      if (region?.parentId) expect(REGIONS_BY_ID.has(region.parentId)).toBe(true);
      expect(blurbFor(['reef'], id)).not.toContain('in the sea');
    }
    for (const site of importElements(fixture.elements, { retrievedOn: DAY }).sites) expect(REGIONS_BY_ID.has(site.regionId ?? '')).toBe(true);
    expect(new Set(REGIONS.map((r) => r.id)).size).toBe(REGIONS.length);
    expect(REGIONS_BY_ID.get('red-sea')?.country).toBeUndefined();
    for (const id of ['red-sea-sinai', 'red-sea-hurghada', 'red-sea-southern', 'red-sea-offshore', 'gulf-of-suez']) {
      expect(REGIONS_BY_ID.get(id)).toMatchObject({ parentId: 'red-sea', country: 'Egypt' });
    }
  });

  it('keeps every import area’s regions inside the box that is queried', () => {
    for (const area of IMPORT_AREAS) {
      const [s, w, n, e] = area.bbox;
      expect(s).toBeLessThan(n);
      expect(w).toBeLessThan(e);
    }
    const [, egypt] = IMPORT_AREAS;
    expect(assignRegion(egypt.bbox[2] + 0.1, 33)).toBeNull();
    expect(assignRegion(egypt.bbox[0] - 0.1, 36.3)).toBeNull();
  });
});

describe('details come from tags, only when present', () => {
  it('reads depths in metres, feet and ranges, and ignores the unreadable', () => {
    expect(parseDepthM('30')).toEqual({ max: 30 });
    expect(parseDepthM('30 m')).toEqual({ max: 30 });
    expect(parseDepthM('30m')).toEqual({ max: 30 });
    expect(parseDepthM('18-32')).toEqual({ min: 18, max: 32 });
    expect(parseDepthM('18–32 m')).toEqual({ min: 18, max: 32 });
    expect(parseDepthM('100 ft')).toEqual({ max: 30.5 });
    expect(parseDepthM('24;30')).toEqual({ min: 24, max: 30 });
    expect(parseDepthM('12.5')).toEqual({ max: 12.5 });
    for (const bad of ['deep', '', '0', '-5', '300', '12 fathoms', 'about 20']) expect(parseDepthM(bad)).toBeNull();
    expect(parseDepthM(undefined)).toBeNull();
  });

  it('fills depth from scuba_diving:maxdepth first, then depth', () => {
    expect(siteOf(node(1, 27.2, 33.9, spot('A', { 'scuba_diving:maxdepth': '40', depth: '10' })))).toMatchObject({ depthMaxM: 40 });
    expect(siteOf(node(2, 27.2, 33.9, spot('B', { depth: '18-32' })))).toMatchObject({ depthMinM: 18, depthMaxM: 32 });
    expect(siteOf(node(3, 27.2, 33.9, spot('C', { 'scuba_diving:maxdepth': '300' }))).depthMaxM).toBeUndefined();
  });

  it('reads dive types from physical tags and from scuba_diving:type, in a fixed order', () => {
    expect(diveTypesFromTags({ historic: 'wreck' })).toEqual(['wreck']);
    expect(diveTypesFromTags({ natural: 'reef' })).toEqual(['reef']);
    expect(diveTypesFromTags({ natural: 'cave_entrance' })).toEqual(['cave']);
    expect(diveTypesFromTags({ 'scuba_diving:type': 'drift;wall' })).toEqual(['wall', 'drift']);
    expect(diveTypesFromTags({ 'scuba_diving:type:wreck': 'yes', natural: 'reef' })).toEqual(['reef', 'wreck']);
    expect(diveTypesFromTags({ 'scuba_diving:type': 'submarine', 'scuba_diving:type:wall': 'no' })).toEqual([]);
  });

  it('reads access and difficulty from the words it knows', () => {
    expect(accessFromTags({ 'scuba_diving:entry': 'shore;boat' })).toEqual(['boat', 'shore']);
    expect(accessFromTags({ 'scuba_diving:entry': 'beach' })).toEqual(['shore']);
    expect(accessFromTags({ 'scuba_diving:entry': 'helicopter' })).toEqual([]);
    expect(accessFromTags({})).toEqual([]);
    expect(difficultyFromTags({ 'scuba_diving:difficulty': 'Advanced' })).toBe('advanced');
    expect(difficultyFromTags({ 'scuba_diving:difficulty': 'easy' })).toBe('beginner');
    expect(difficultyFromTags({ 'scuba_diving:difficulty': '3' })).toBeUndefined();
  });

  it('names an OSM source for every detail filled in, and nothing else', () => {
    const full = siteOf(node(1, 27.2, 33.9, spot('Full', { historic: 'wreck', 'scuba_diving:maxdepth': '30', 'scuba_diving:entry': 'boat', 'scuba_diving:difficulty': 'technical' })));
    expect(full).toMatchObject({ depthMaxM: 30, diveTypes: ['wreck'], access: ['boat'], difficulty: 'technical' });
    expect(full.sources).toEqual([
      {
        fields: ['region', 'depth', 'difficulty', 'dive_types', 'access'],
        source: 'OpenStreetMap contributors',
        url: 'https://www.openstreetmap.org/node/1',
        license: 'ODbL 1.0',
        retrieved: DAY,
      },
    ]);

    const bare = siteOf(node(2, 27.2, 33.9, spot('Bare')));
    for (const key of ['depthMinM', 'depthMaxM', 'difficulty', 'diveTypes', 'access', 'conditions'] as const) expect(bare[key]).toBeUndefined();
    expect(bare.sources).toHaveLength(1);
    expect(bare.sources?.[0].fields).toEqual(['region']);
  });

  it('writes its own short blurb, never OSM’s description, and never guesses species', () => {
    const site = siteOf(node(1, 27.2, 33.9, spot('Described', { historic: 'wreck', description: 'Copied prose that belongs to someone else.', 'description:en': 'More prose.' })));
    expect(site.blurb).toBe('A wreck dive near Hurghada in the Red Sea.');
    expect(site.blurb).not.toMatch(/Copied|prose/);
    expect(site.notableSpecies).toEqual([]);
    expect(site.source).toBe('seed');
    expect(blurbFor([], 'coral-sea')).toBe('A dive site in the Coral Sea.');
    expect(blurbFor(['reef', 'wall'], 'gbr-cairns-cooktown')).toBe('A reef and wall dive in the Cairns/Cooktown part of the Great Barrier Reef.');
    expect(blurbFor(['reef', 'wall', 'drift'], 'coral-sea')).toBe('A dive site in the Coral Sea.');
  });

  it('shows the region as its path, as the site page does', () => {
    expect(siteOf(node(1, -16.9, 146.0, spot('A'))).region).toBe('Cairns/Cooktown, Great Barrier Reef');
    expect(siteOf(node(2, 27.2, 33.9, spot('B'))).region).toBe('Hurghada & Safaga, Red Sea');
  });
});

describe('duplicates within the import', () => {
  const a = plain('osm-node-5', 'Twin Reef', 27.25, 33.95);
  const b = plain('osm-way-6', 'Twin Reef', 27.2503, 33.9501);

  it('merges the same name within 3 km and keeps the node', () => {
    const { sites, merged } = dedupeWithinImport([b, a]);
    expect(sites.map((s) => s.id)).toEqual(['osm-node-5']);
    expect(merged).toEqual([{ kept: 'osm-node-5', dropped: ['osm-way-6'], name: 'Twin Reef' }]);
  });

  it('keeps a node over a way over a relation, and the lower id among equals', () => {
    const rel = plain('osm-relation-1', 'Twin Reef', 27.2501, 33.95);
    expect(dedupeWithinImport([rel, b]).sites.map((s) => s.id)).toEqual(['osm-way-6']);
    const n2 = plain('osm-node-9', 'Twin Reef', 27.2502, 33.95);
    expect(dedupeWithinImport([n2, a]).sites.map((s) => s.id)).toEqual(['osm-node-5']);
  });

  it('keeps a site imported before, so its id and sightings stay put', () => {
    const { sites } = dedupeWithinImport([a, b], { preferIds: new Set(['osm-way-6']) });
    expect(sites.map((s) => s.id)).toEqual(['osm-way-6']);
  });

  it('merges a reef drawn as an outline and marked with a point several hundred metres apart', () => {
    const point = plain('osm-node-7', 'Twin reef', 27.2545, 33.95); // about 500 m
    expect(dedupeWithinImport([a, point]).sites.map((s) => s.id)).toEqual(['osm-node-5']);
  });

  it('merges a wreck marked twice about 2 km apart (two “Kormoran” in the Strait of Tiran)', () => {
    const one = plain('osm-node-663869851', 'Kormoran', 28.0333, 34.4933);
    const two = plain('osm-node-663869852', 'Kormoran', 28.0167, 34.4933);
    expect(distanceM(one.lat, one.lng, two.lat, two.lng)).toBeGreaterThan(1800);
    expect(dedupeWithinImport([two, one]).sites.map((s) => s.id)).toEqual(['osm-node-663869851']);
  });

  it('leaves alone sites further apart than 3 km, or with different names', () => {
    const far = plain('osm-node-7', 'Twin Reef', 27.2775, 33.95); // about 3.06 km
    expect(distanceM(a.lat, a.lng, far.lat, far.lng)).toBeGreaterThan(3000);
    expect(dedupeWithinImport([a, far]).sites).toHaveLength(2);
    expect(dedupeWithinImport([a, plain('osm-node-8', 'Other Reef', 27.25, 33.95)]).sites).toHaveLength(2);
  });

  it('matches names ignoring case, accents, punctuation, “the” and “reef”', () => {
    expect(normaliseSiteName('The Étoile Reef')).toBe('etoile');
    expect(normaliseSiteName("Shark & Yolanda's Reef")).toBe('shark yolandas');
    expect(normaliseSiteName('SS Thistlegorm')).toBe('thistlegorm');
    expect(normaliseSiteName('Reef')).toBe('reef');
    expect(dedupeWithinImport([plain('osm-node-1', 'The Canyon Reef', 27.2, 33.9), plain('osm-node-2', 'canyon', 27.2002, 33.9)]).sites).toHaveLength(1);
  });

  it('is one place when A is near B and B near C, though A and C are further apart', () => {
    const chain = [0, 1, 2].map((i) => plain(`osm-node-${i + 1}`, 'Chain', 27.2 + i * 0.0010, 33.9));
    expect(distanceM(chain[0].lat, chain[0].lng, chain[2].lat, chain[2].lng)).toBeGreaterThan(150);
    expect(dedupeWithinImport(chain).sites).toHaveLength(1);
  });

  it('merges the fixture’s node and way into the node', () => {
    const result = importElements(fixture.elements, { retrievedOn: DAY });
    expect(result.merged).toEqual([{ kept: 'osm-node-9000000022', dropped: ['osm-way-9000000023'], name: 'Fixture Twin Reef' }]);
    expect(result.sites.map((s) => s.id)).not.toContain('osm-way-9000000023');
  });
});

describe('duplicates of the seed sites', () => {
  const seed = plain('seed-wreck', 'SS Thistlegorm', 27.813, 33.92, { externalIds: undefined });
  const near = (lat: number, lng: number, name: string, id = 'osm-node-1') => plain(id, name, lat, lng);
  /** Latitude offset in degrees for a distance in metres. */
  const north = (m: number) => m / 111195;

  it('matches within 60 m whatever the name, and keeps a differently named site 250 m away apart', () => {
    const [m] = matchSeeds([near(seed.lat + north(50), seed.lng, 'Completely Different')], [seed]);
    expect(m).toMatchObject({ importedId: 'osm-node-1', seedId: 'seed-wreck', basis: 'near' });
    expect(m.distanceM).toBeGreaterThan(45);
    // The Bells is about 250 m from the Blue Hole, and a dive of its own.
    expect(matchSeeds([near(seed.lat + north(250), seed.lng, 'Completely Different')], [seed])).toEqual([]);
  });

  it('matches within 1.5 km when the names are similar, but not beyond', () => {
    const km = (n: number) => seed.lat + north(n * 1000);
    expect(matchSeeds([near(km(1.2), seed.lng, 'Thistlegorm')], [seed])[0]).toMatchObject({ basis: 'name' });
    expect(matchSeeds([near(km(1.2), seed.lng, 'The Thistlegorm Wreck')], [seed])).toHaveLength(1);
    expect(matchSeeds([near(km(1.2), seed.lng, 'Something Else')], [seed])).toEqual([]);
    expect(matchSeeds([near(km(1.8), seed.lng, 'Thistlegorm Wreck Dive')], [seed])).toEqual([]);
  });

  it('matches within 3 km when the name is the same, as a seed’s position is approximate', () => {
    const km = (n: number) => seed.lat + north(n * 1000);
    // The seed "Cod Hole" is 2.6 km from OpenStreetMap's.
    expect(matchSeeds([near(km(2.6), seed.lng, 'SS Thistlegorm')], [seed])[0]).toMatchObject({ basis: 'name' });
    expect(matchSeeds([near(km(2.6), seed.lng, 'The Thistlegorm')], [seed])).toHaveLength(1);
    expect(matchSeeds([near(km(2.6), seed.lng, 'Thistlegorm Wreck Dive')], [seed])).toEqual([]);
    expect(matchSeeds([near(km(3.2), seed.lng, 'SS Thistlegorm')], [seed])).toEqual([]);
  });

  it('finds the seed “Cod Hole” in OpenStreetMap’s, and lists it once', () => {
    expect(SITES.filter((s) => normaliseSiteName(s.name) === 'cod hole').map((s) => s.id)).toEqual(['cod-hole']);
    expect(SITES.find((s) => s.id === 'cod-hole')?.externalIds).toContainEqual({ scheme: 'osm', id: 'node/270802348', relation: 'same_as' });
    expect(SITES_BY_ID.get('osm-node-270802348')?.name).toBe('Cod Hole');
  });

  it('judges names by words, accents and one stray letter', () => {
    expect(namesSimilar('Shark & Yolanda Reef', 'Shark and Yolanda')).toBe(true);
    expect(namesSimilar('Blue Hole', 'Dahab Blue Hole')).toBe(true);
    expect(namesSimilar('Elphinstone Reef', 'Elphinstone')).toBe(true);
    expect(namesSimilar('Thistlegorm', 'Thistlegorn')).toBe(true);
    expect(namesSimilar('Café Rock', 'Cafe Rock')).toBe(true);
    expect(namesSimilar('North Horn', 'South Horn')).toBe(false);
    expect(namesSimilar('Ras', 'Ras Mohammed')).toBe(false); // a lone short word is not enough
    expect(namesSimilar('', 'Anything')).toBe(false);
  });

  it('matches each imported site to the nearest qualifying seed only', () => {
    const other = plain('seed-other', 'Other', seed.lat + north(100), seed.lng);
    const [m] = matchSeeds([near(seed.lat + north(120), seed.lng, 'X')], [seed, other]);
    expect(m.seedId).toBe('seed-other');
  });

  it('finds the two seed duplicates in the fixture, among the real seed sites', () => {
    const { sites } = importElements(fixture.elements, { retrievedOn: DAY });
    const matches = matchSeeds(sites, SEED_SITES);
    expect(matches.map((m) => [m.importedId, m.seedId, m.basis])).toEqual([
      ['osm-node-9000000024', 'cod-hole', 'near'],
      ['osm-node-9000000025', 'ss-thistlegorm', 'name'],
    ]);
  });
});

describe('mergeSites', () => {
  const seeds: DiveSite[] = [
    plain('seed-a', 'Seed A', 10, 10, { externalIds: [{ scheme: 'wikidata', id: 'Q1', relation: 'same_as' }] }),
    plain('seed-b', 'Seed B', 20, 20, { externalIds: undefined }),
  ];
  const seedCopy = JSON.stringify(seeds);

  it('lists the seeds, then the new live imported sites; attaches the OSM id to a seed it matches', () => {
    const fresh = plain('osm-node-1', 'Imported One', 30, 30);
    const twin = plain('osm-node-2', 'Seed A Again', 10, 10.0005); // near seed-a
    const merged = mergeSites(seeds, [fresh, twin]);
    expect(merged.sites.map((s) => s.id)).toEqual(['seed-a', 'seed-b', 'osm-node-1']);
    expect(merged.sites[0].externalIds).toEqual([
      { scheme: 'wikidata', id: 'Q1', relation: 'same_as' },
      { scheme: 'osm', id: 'node/2', relation: 'same_as' },
    ]);
    expect(merged.duplicates).toMatchObject([{ importedId: 'osm-node-2', seedId: 'seed-a' }]);
    expect(merged.byId.get('osm-node-2')?.name).toBe('Seed A Again'); // a duplicate still resolves
    expect(JSON.stringify(seeds)).toBe(seedCopy); // the seed objects themselves are untouched
  });

  it('keeps retired sites out of the list but findable by id', () => {
    const live = plain('osm-node-1', 'Live', 30, 30);
    const gone: OsmSiteRecord = { ...plain('osm-node-3', 'Gone', 31, 31), retired: true, retiredOn: DAY };
    const merged = mergeSites(seeds, [gone, live]);
    expect(merged.sites.map((s) => s.id)).not.toContain('osm-node-3');
    expect(merged.byId.get('osm-node-3')?.name).toBe('Gone');
    expect(merged.byId.get('osm-node-3')).not.toHaveProperty('retired');
    expect([...merged.retiredIds]).toEqual(['osm-node-3']);
  });

  it('does not attach an OSM id twice, and a retired site never attaches', () => {
    const seedWithOsm = plain('seed-c', 'Seed C', 40, 40, { externalIds: [{ scheme: 'osm', id: 'node/4', relation: 'same_as' }] });
    const merged = mergeSites([seedWithOsm], [plain('osm-node-4', 'Seed C', 40, 40), { ...plain('osm-node-5', 'Seed C', 40, 40), retired: true }]);
    expect(merged.sites).toHaveLength(1);
    expect(merged.sites[0].externalIds).toHaveLength(1);
  });

  it('copes with several hundred sites and keeps every id unique', () => {
    const many = Array.from({ length: 500 }, (_, i) => plain(`osm-node-${1000 + i}`, `Site ${i}`, -15 + (i % 25) * 0.1, 146 + Math.floor(i / 25) * 0.1));
    const merged = mergeSites(seeds, many);
    expect(merged.sites).toHaveLength(502);
    expect(new Set(merged.sites.map((s) => s.id)).size).toBe(502);
  });

  it('the real fixture import merges into the real seeds without touching them', () => {
    const { sites } = importElements(fixture.elements, { retrievedOn: DAY });
    const before = JSON.stringify(SEED_SITES);
    const merged = mergeSites(SEED_SITES, sites);
    expect(JSON.stringify(SEED_SITES)).toBe(before);
    expect(merged.sites).toHaveLength(SEED_SITES.length + sites.length - 2);
    expect(merged.sites.find((s) => s.id === 'ss-thistlegorm')?.externalIds).toContainEqual({ scheme: 'osm', id: 'node/9000000025', relation: 'same_as' });
    expect(merged.sites.find((s) => s.id === 'cod-hole')?.externalIds).toContainEqual({ scheme: 'osm', id: 'node/9000000024', relation: 'same_as' });
    expect(merged.sites.map((s) => s.id)).not.toContain('osm-node-9000000025');
  });
});

describe('merging with the file from last time', () => {
  const a = plain('osm-node-1', 'A', 27.2, 33.9);
  const b = plain('osm-node-2', 'B', 27.3, 33.9);
  const c = plain('osm-node-3', 'C', 27.4, 33.9);

  it('adds new sites, keeps old ids, and retires one OSM no longer lists', () => {
    const { records, stats } = mergeWithPrevious([a, b], [b, c], { retiredOn: DAY });
    expect(records.map((r) => r.id)).toEqual(['osm-node-1', 'osm-node-2', 'osm-node-3']);
    expect(stats).toMatchObject({ added: ['osm-node-3'], retired: ['osm-node-1'], unchanged: 1, updated: [], revived: [] });
    const retired = records.find((r) => r.id === 'osm-node-1');
    expect(retired).toMatchObject({ retired: true, retiredOn: DAY, name: 'A', lat: 27.2 }); // all its data stays
  });

  it('never drops a record, however many imports in a row miss it', () => {
    let records: OsmSiteRecord[] = [a, b];
    for (const day of ['2026-11-01', '2026-12-01', '2027-01-01']) records = mergeWithPrevious(records, [c], { retiredOn: day }).records;
    expect(records.map((r) => r.id)).toEqual(['osm-node-1', 'osm-node-2', 'osm-node-3']);
    expect(records.find((r) => r.id === 'osm-node-1')?.retiredOn).toBe('2026-11-01'); // the first miss, not the latest
  });

  it('lists a retired site again if it comes back, and updates one whose details changed', () => {
    const retired: OsmSiteRecord = { ...a, retired: true, retiredOn: '2026-11-01' };
    const renamed = { ...b, name: 'B renamed' };
    const { records, stats } = mergeWithPrevious([retired, b], [a, renamed], { retiredOn: DAY });
    expect(stats).toMatchObject({ revived: ['osm-node-1'], updated: ['osm-node-2'], retired: [] });
    expect(records.find((r) => r.id === 'osm-node-1')).not.toHaveProperty('retired');
    expect(records.find((r) => r.id === 'osm-node-2')?.name).toBe('B renamed');
  });

  it('does not call a re-run on another day a change', () => {
    const dated = (d: string) => ({ ...a, sources: [{ fields: ['region' as const], source: 'S', retrieved: d }] });
    const { records, stats } = mergeWithPrevious([dated('2026-10-01')], [dated('2026-10-22')], { retiredOn: DAY });
    expect(stats.unchanged).toBe(1);
    expect(records[0].sources?.[0].retrieved).toBe('2026-10-22');
  });

  it('flags an import that found under half of a list of twenty or more', () => {
    expect(looksTruncated(100, 49)).toBe(true);
    expect(looksTruncated(100, 50)).toBe(false);
    expect(looksTruncated(10, 0)).toBe(false);
    expect(looksTruncated(0, 0)).toBe(false);
  });
});

describe('stable order', () => {
  it('sorts by id the same way whatever the input order', () => {
    const forward = importElements(fixture.elements, { retrievedOn: DAY });
    const backward = importElements([...fixture.elements].reverse(), { retrievedOn: DAY });
    const ids = forward.sites.map((s) => s.id);
    expect(ids).toEqual([...ids].sort());
    expect(backward.sites.map((s) => s.id)).toEqual(ids);
    expect(JSON.stringify(backward.sites)).toBe(JSON.stringify(forward.sites));
  });

  it('sorts by plain code-unit order, not by locale', () => {
    expect(sortById([{ id: 'osm-way-2' }, { id: 'osm-node-10' }, { id: 'osm-node-9' }, { id: 'osm-relation-1' }]).map((x) => x.id)).toEqual([
      'osm-node-10', 'osm-node-9', 'osm-relation-1', 'osm-way-2',
    ]);
  });

  it('gives the same ids when the same elements are imported twice', () => {
    const first = importElements(fixture.elements, { retrievedOn: DAY }).sites;
    const second = importElements(fixture.elements, { retrievedOn: '2027-01-01' }).sites;
    expect(second.map((s) => s.id)).toEqual(first.map((s) => s.id));
  });
});

describe('the fixture as a whole', () => {
  it('turns the hand-written elements into the expected sites by region', () => {
    const result = importElements(fixture.elements, { retrievedOn: DAY });
    expect(result.acceptedByArea).toEqual({ gbr: 6, egypt: 8 });
    expect(result.sites).toHaveLength(13);
    expect(result.byRegion).toEqual({
      'gbr-far-northern': 1, 'gbr-cairns-cooktown': 2, 'gbr-townsville-whitsunday': 1, 'gbr-mackay-capricorn': 1, 'coral-sea': 1,
      'red-sea-hurghada': 3, 'red-sea-sinai': 1, 'red-sea-southern': 1, 'red-sea-offshore': 1, 'gulf-of-suez': 1,
    });
    const charlie = result.sites.find((s) => s.id === 'osm-relation-9000000003');
    expect(charlie).toMatchObject({ name: 'Fixture Charlie English', diveTypes: ['wall', 'drift'], difficulty: 'advanced' });
    const foxtrot = result.sites.find((s) => s.id === 'osm-node-9000000006');
    expect(foxtrot).toMatchObject({ depthMaxM: 30.5, access: ['boat', 'shore'], diveTypes: ['wreck'] });
  });
});

describe('the committed OSM import', () => {
  const records = osmSites as unknown as OsmSiteRecord[];

  it('is sorted, has unique osm- ids, and every record names OpenStreetMap as its source', () => {
    const ids = records.map((r) => r.id);
    expect(ids).toEqual([...ids].sort());
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of records) {
      expect(r.id).toMatch(/^osm-(node|way|relation)-\d+$/);
      expect(r.externalIds).toEqual([{ scheme: 'osm', id: r.id.replace(/^osm-/, '').replace('-', '/'), relation: 'same_as' }]);
      expect(r.notableSpecies).toEqual([]);
      expect(r.sources).toHaveLength(1);
      expect(r.sources?.[0]).toMatchObject({ source: 'OpenStreetMap contributors', license: 'ODbL 1.0' });
      expect(r.sources?.[0].url).toBe(`https://www.openstreetmap.org/${r.externalIds?.[0].id}`);
      expect(REGIONS_BY_ID.has(r.regionId ?? '')).toBe(true);
    }
  });

  it('agrees with its meta file, which carries the licence', () => {
    expect(osmMeta.count).toBe(records.length);
    expect(osmMeta.retired).toBe(records.filter((r) => r.retired).length);
    expect(osmMeta.licence).toBe('ODbL-1.0');
    expect(osmMeta.attribution).toBe('© OpenStreetMap contributors');
  });

  it('is what SITES is made of: seeds first, no retired sites listed, every site findable by id', () => {
    expect(SITES.slice(0, SEED_SITES.length).map((s) => s.id)).toEqual(SEED_SITES.map((s) => s.id));
    expect(new Set(SITES.map((s) => s.id)).size).toBe(SITES.length);
    for (const s of SITES) expect(SITES_BY_ID.get(s.id)?.id).toBe(s.id);
    for (const id of RETIRED_SITE_IDS) {
      expect(SITES.some((s) => s.id === id)).toBe(false);
      expect(SITES_BY_ID.has(id)).toBe(true);
    }
    for (const s of SITES) if (s.id.startsWith('osm-')) expect(s.notableSpecies).toEqual([]);
  });
});

describe('SITES built from a populated import', () => {
  it('lists the seeds and the live imported sites, resolves a retired one, and keeps the integrity rules', () => {
    const { sites } = importElements(fixture.elements, { retrievedOn: DAY });
    const retired: OsmSiteRecord = { ...plain('osm-node-1', 'Retired One', -16.9, 146.0, { regionId: 'gbr-cairns-cooktown' }), retired: true, retiredOn: DAY };
    const records = sortById([...sites, retired]);
    jest.isolateModules(() => {
      jest.doMock('../../data/osm-sites.json', () => records);
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const data: typeof import('@/data/sites') = require('@/data/sites');
      // 13 imported, 2 of them are seeds already; one retired record is findable but not listed.
      expect(data.SEED_SITES).toHaveLength(SEED_SITES.length);
      expect(data.SITES).toHaveLength(SEED_SITES.length + 11);
      expect(data.SITES.slice(0, SEED_SITES.length).map((x) => x.id)).toEqual(SEED_SITES.map((x) => x.id));
      expect(new Set(data.SITES.map((x) => x.id)).size).toBe(data.SITES.length);
      expect(data.SITES.some((x) => x.id === 'osm-node-1')).toBe(false);
      expect(data.SITES_BY_ID.get('osm-node-1')?.name).toBe('Retired One');
      expect([...data.RETIRED_SITE_IDS]).toEqual(['osm-node-1']);
      expect(data.SITES_BY_ID.size).toBe(data.SITES.length + 1 + 2); // the retired site and the two seed duplicates
      expect(data.SITES.find((x) => x.id === 'ss-thistlegorm')?.externalIds).toContainEqual({ scheme: 'osm', id: 'node/9000000025', relation: 'same_as' });

      // The same rules src/data/__tests__/integrity.test.ts holds the whole list to.
      for (const site of data.SITES) {
        expect(REGIONS_BY_ID.has(site.regionId ?? 'none') || !site.regionId).toBe(true);
        const checks: [string, boolean][] = [
          ['depth', site.depthMinM != null || site.depthMaxM != null],
          ['difficulty', site.difficulty != null],
          ['dive_types', !!site.diveTypes?.length],
          ['access', !!site.access?.length],
        ];
        for (const [field, filled] of checks) {
          if (filled) expect(site.sources?.some((src) => src.fields.some((f) => f === field))).toBe(true);
        }
        for (const depth of [site.depthMinM, site.depthMaxM]) if (depth != null) expect(depth).toBeLessThanOrEqual(150);
      }
    });
  });
});
