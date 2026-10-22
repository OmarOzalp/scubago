import { describe, expect, it } from '@jest/globals';

import { HttpError, ParseError } from '@/lib/external-sightings/errors';
import { boxAround, boxToWkt, haversineKm } from '@/lib/external-sightings/geo';
import { buildQuery, fetchJson, hostOf, type FetchImpl, type ResponseLike } from '@/lib/external-sightings/http';
import {
  fetchInatSpeciesCounts,
  inatExploreUrl,
  observationsUrl,
  parseObservations,
  parseSpeciesCounts,
  speciesCountsUrl,
} from '@/lib/external-sightings/inaturalist';
import { checklistUrl, fetchObisChecklist, parseChecklist } from '@/lib/external-sightings/obis';

// Every response below is hand-written JSON shaped like the documented iNaturalist v1 and OBIS v3
// responses. None of it is a real record, and the ids and names are made up for the tests.

const SITE = { lat: -16.5, lng: 145.9, radiusKm: 3 };
const OPEN_PHOTO = 'https://inaturalist-open-data.s3.amazonaws.com/photos/1001/square.jpg';

function ok(body: unknown, headers: Record<string, string> = {}): ResponseLike {
  return { ok: true, status: 200, headers: { get: (name) => headers[name.toLowerCase()] ?? null }, json: async () => body };
}

function failing(status: number, headers: Record<string, string> = {}): ResponseLike {
  return { ok: false, status, headers: { get: (name) => headers[name.toLowerCase()] ?? null }, json: async () => ({}) };
}

describe('request URLs for a site', () => {
  it('builds the iNaturalist and OBIS requests', () => {
    expect(speciesCountsUrl(SITE)).toBe(
      'https://api.inaturalist.org/v1/observations/species_counts?lat=-16.5&lng=145.9&radius=3&quality_grade=research&verifiable=true&iconic_taxa=Actinopterygii,Animalia,Mammalia,Mollusca,Reptilia&per_page=200',
    );
    expect(speciesCountsUrl(SITE, 2)).toContain('&page=2');
    expect(observationsUrl(SITE, [1001, 1002])).toBe(
      'https://api.inaturalist.org/v1/observations?lat=-16.5&lng=145.9&radius=3&quality_grade=research&verifiable=true&license=cc0,cc-by&order_by=observed_on&order=desc&per_page=30&taxon_id=1001,1002',
    );
    expect(observationsUrl(SITE)).not.toContain('taxon_id');
    expect(checklistUrl(SITE)).toBe(
      'https://api.obis.org/v3/checklist?geometry=POLYGON((145.8719%20-16.5269,145.9281%20-16.5269,145.9281%20-16.4731,145.8719%20-16.4731,145.8719%20-16.5269))',
    );
    expect(inatExploreUrl(SITE)).toBe(
      'https://www.inaturalist.org/observations?lat=-16.5&lng=145.9&radius=3&quality_grade=research&verifiable=true',
    );
  });

  it('encodes values but leaves commas readable, and skips undefined', () => {
    expect(buildQuery({ a: 'x y', b: 'p,q', c: undefined, d: true, e: 0 })).toBe('?a=x%20y&b=p,q&d=true&e=0');
    expect(buildQuery({})).toBe('');
    expect(hostOf('https://api.inaturalist.org/v1/observations?x=1')).toBe('api.inaturalist.org');
    expect(hostOf('not a url')).toBe('');
  });
});

describe('the OBIS search box', () => {
  it('widens east-west with latitude', () => {
    const equator = boxAround(0, 10, 3);
    const north = boxAround(60, 10, 3);
    const equatorWidth = equator.east - equator.west;
    const northWidth = north.east - north.west;
    const height = north.north - north.south;
    expect(northWidth / height).toBeCloseTo(2, 1); // 1 / cos(60°)
    expect(equatorWidth / (equator.north - equator.south)).toBeCloseTo(1, 5);
  });

  it('is a counter-clockwise closed ring, longitude first', () => {
    expect(boxToWkt({ south: -1, north: 1, west: 10, east: 12 })).toBe('POLYGON((10 -1,12 -1,12 1,10 1,10 -1))');
  });

  it('splits into two boxes across the antimeridian', () => {
    expect(boxToWkt({ south: -1, north: 1, west: 179, east: 181 })).toBe(
      'MULTIPOLYGON(((179 -1,180 -1,180 1,179 1,179 -1)),((-180 -1,-179 -1,-179 1,-180 1,-180 -1)))',
    );
    expect(boxToWkt({ south: -1, north: 1, west: -181, east: -179 })).toBe(
      'MULTIPOLYGON(((179 -1,180 -1,180 1,179 1,179 -1)),((-180 -1,-179 -1,-179 1,-180 1,-180 -1)))',
    );
  });

  it('stays inside the globe near a pole', () => {
    const box = boxAround(89.9, 0, 50);
    expect(box.north).toBeLessThanOrEqual(90);
    expect(box.east - box.west).toBeLessThanOrEqual(360);
  });

  it('measures distance in km', () => {
    expect(haversineKm({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(111.19, 1);
    expect(haversineKm({ lat: 10, lng: 10 }, { lat: 10, lng: 10 })).toBe(0);
  });
});

describe('fetching JSON', () => {
  it('returns the parsed body', async () => {
    const fetchImpl: FetchImpl = async () => ok({ hello: 'sea' });
    expect(await fetchJson('https://example.test/a', { fetchImpl })).toEqual({ hello: 'sea' });
  });

  it('throws HttpError with the status and Retry-After', async () => {
    const fetchImpl: FetchImpl = async () => failing(429, { 'retry-after': '30' });
    await expect(fetchJson('https://example.test/a', { fetchImpl })).rejects.toMatchObject({ name: 'HttpError', status: 429, retryAfterMs: 30_000 });
    await expect(fetchJson('https://example.test/a', { fetchImpl: async () => failing(503) })).rejects.toBeInstanceOf(HttpError);
  });

  it('throws ParseError when the body is not JSON', async () => {
    const fetchImpl: FetchImpl = async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad'); } });
    await expect(fetchJson('https://example.test/a', { fetchImpl })).rejects.toBeInstanceOf(ParseError);
  });
});

describe('iNaturalist species counts', () => {
  it('reads taxa and counts, skipping rows that are not the documented shape', () => {
    const page = parseSpeciesCounts({
      total_results: 9,
      results: [
        { count: 12, taxon: { id: 1001, name: 'Chelonia mydas', rank: 'species' } },
        { count: '5', taxon: { id: 1002, name: 'Mobula alfredi', rank: 'Species' } },
        { count: 0, taxon: { id: 1003, name: 'Zero count', rank: 'species' } },
        { count: 4, taxon: { id: 1004, rank: 'species' } },
        { count: 4 },
        { taxon: { id: 1005, name: 'No count' } },
        { count: 'many', taxon: { id: 1006, name: 'Not a number' } },
        'garbage',
        null,
        42,
      ],
    });
    expect(page.rows).toBe(10);
    expect(page.total).toBe(9);
    expect(page.counts).toEqual([
      { taxonId: 1001, name: 'Chelonia mydas', rank: 'species', count: 12 },
      { taxonId: 1002, name: 'Mobula alfredi', rank: 'species', count: 5 },
    ]);
  });

  it('refuses a response with no results array', () => {
    for (const bad of [null, undefined, 'text', 42, [], {}, { results: 'x' }, { results: null }]) {
      expect(() => parseSpeciesCounts(bad)).toThrow(ParseError);
    }
    expect(parseSpeciesCounts({ results: [] })).toEqual({ counts: [], total: undefined, rows: 0 });
  });

  it('reads further pages until the total, and says when it stopped early', async () => {
    const pageOf = (start: number, size: number) => ({
      total_results: 450,
      results: Array.from({ length: size }, (_, i) => ({ count: 1, taxon: { id: start + i, name: `Taxon ${start + i}`, rank: 'species' } })),
    });
    const urls: string[] = [];
    const fetchImpl: FetchImpl = async (url) => {
      urls.push(url);
      if (url.endsWith('&page=3')) return ok(pageOf(401, 50));
      if (url.endsWith('&page=2')) return ok(pageOf(201, 200));
      return ok(pageOf(1, 200));
    };
    const all = await fetchInatSpeciesCounts(SITE, { fetchImpl });
    expect(all.counts).toHaveLength(450);
    expect(all.truncated).toBe(false);
    expect(urls).toHaveLength(3);

    const limited = await fetchInatSpeciesCounts(SITE, { fetchImpl, maxPages: 2 });
    expect(limited.counts).toHaveLength(400);
    expect(limited.truncated).toBe(true);
  });

  it('keeps earlier pages when a later one fails, but fails when the first does', async () => {
    const first = { total_results: 450, results: Array.from({ length: 200 }, (_, i) => ({ count: 1, taxon: { id: i + 1, name: `Taxon ${i}`, rank: 'species' } })) };
    const fetchImpl: FetchImpl = async (url) => (url.endsWith('&page=2') ? failing(503) : ok(first));
    const partial = await fetchInatSpeciesCounts(SITE, { fetchImpl });
    expect(partial.counts).toHaveLength(200);
    expect(partial.truncated).toBe(true);
    await expect(fetchInatSpeciesCounts(SITE, { fetchImpl: async () => failing(500) })).rejects.toBeInstanceOf(HttpError);
  });

  it('does not count a taxon twice when pages overlap', async () => {
    const row = { count: 3, taxon: { id: 7, name: 'Chelonia mydas', rank: 'species' } };
    const filler = Array.from({ length: 199 }, (_, i) => ({ count: 1, taxon: { id: 100 + i, name: `Taxon ${i}`, rank: 'species' } }));
    const fetchImpl: FetchImpl = async () => ok({ total_results: 400, results: [row, ...filler] });
    const result = await fetchInatSpeciesCounts(SITE, { fetchImpl, maxPages: 2 });
    expect(result.counts.filter((c) => c.taxonId === 7)).toHaveLength(1);
  });
});

describe('iNaturalist observations: licences, dates and privacy', () => {
  const base = {
    id: 101,
    quality_grade: 'research',
    observed_on: '2025-03-04',
    created_at: '2025-04-01T10:00:00+00:00',
    license_code: 'cc-by',
    user: { login: 'diver_a', name: 'Ada Diver' },
    taxon: { id: 1001, name: 'Chelonia mydas', rank: 'species' },
    geojson: { type: 'Point', coordinates: [145.905, -16.5] },
    photos: [{ url: OPEN_PHOTO, license_code: 'cc-by', attribution: '(c) Ada Diver, some rights reserved (CC BY)' }],
  };

  it('keeps an openly licensed observation with its credit, date, link and photo', () => {
    const { observations, dropped } = parseObservations({ results: [base] }, SITE);
    expect(dropped).toBe(0);
    expect(observations).toEqual([
      {
        id: 101,
        taxonName: 'Chelonia mydas',
        taxonId: 1001,
        observedOn: '2025-03-04',
        observer: 'Ada Diver',
        observerLogin: 'diver_a',
        url: 'https://www.inaturalist.org/observations/101',
        licence: 'cc-by',
        credit: '© Ada Diver, CC BY 4.0 (iNaturalist)',
        distanceKm: 1,
        locationObscured: false,
        photo: { url: OPEN_PHOTO, licence: 'cc-by', attribution: '(c) Ada Diver, some rights reserved (CC BY)' },
      },
    ]);
  });

  it('drops an observation that is not CC0 or CC BY', () => {
    const results = [
      { ...base, id: 1, license_code: 'cc-by-nc' },
      { ...base, id: 2, license_code: 'cc-by-sa' },
      { ...base, id: 3, license_code: 'cc-by-nc-nd' },
      { ...base, id: 4, license_code: null },
      { ...base, id: 5 },
      { ...base, id: 6, license_code: 'CC0' },
    ];
    const { observations, dropped } = parseObservations({ results }, SITE);
    expect(observations.map((o) => o.id)).toEqual([5, 6]);
    expect(observations[1].licence).toBe('cc0');
    expect(observations[1].credit).toBe('Ada Diver, CC0 (iNaturalist)');
    expect(dropped).toBe(4);
  });

  it('drops a photo that is not CC0 or CC BY, but keeps the observation', () => {
    const results = [
      { ...base, id: 1, photos: [{ url: OPEN_PHOTO, license_code: 'cc-by-nc', attribution: 'x' }] },
      { ...base, id: 2, photos: [{ url: OPEN_PHOTO, license_code: null, attribution: 'x' }] },
      { ...base, id: 3, photos: [{ url: OPEN_PHOTO, license_code: 'cc-by-nc' }, { url: OPEN_PHOTO.replace('1001', '1002'), license_code: 'cc0' }] },
      { ...base, id: 4, photos: [{ url: 'https://static.inaturalist.org/photos/1001/square.jpg', license_code: 'cc-by', attribution: 'x' }] },
      { ...base, id: 5, photos: [{ url: 'http://inaturalist-open-data.s3.amazonaws.com/photos/1/square.jpg', license_code: 'cc-by' }] },
      { ...base, id: 6, photos: [{ url: 'https://evil.test/inaturalist-open-data.s3.amazonaws.com/x.jpg', license_code: 'cc-by' }] },
      { ...base, id: 7, photos: 'nope' },
    ];
    const { observations } = parseObservations({ results }, SITE);
    expect(observations.map((o) => o.id)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(observations[0].photo).toBeUndefined();
    expect(observations[1].photo).toBeUndefined();
    expect(observations[2].photo).toEqual({
      url: OPEN_PHOTO.replace('1001', '1002'),
      licence: 'cc0',
      attribution: 'no rights reserved, uploaded by Ada Diver (CC0)',
    });
    for (const o of observations.slice(3)) expect(o.photo).toBeUndefined();
  });

  it('uses the observation date, never the upload date', () => {
    const results = [
      { ...base, id: 1, observed_on: undefined, observed_on_details: { date: '2024-12-31' } },
      { ...base, id: 2, observed_on: undefined },
      { ...base, id: 3, observed_on: null, observed_on_details: null },
      { ...base, id: 4, observed_on: '2025-02-30' },
      { ...base, id: 5, observed_on: 'last Tuesday' },
    ];
    const { observations } = parseObservations({ results }, SITE);
    expect(observations.map((o) => [o.id, o.observedOn])).toEqual([[1, '2024-12-31']]);
    expect(JSON.stringify(observations)).not.toContain('2025-04-01');
  });

  it('drops rows that are not research grade, not a species, or have nobody to credit', () => {
    const results = [
      { ...base, id: 1, quality_grade: 'needs_id' },
      { ...base, id: 2, taxon: { id: 5, name: 'Chelonia', rank: 'genus' } },
      { ...base, id: 3, taxon: null },
      { ...base, id: 4, user: null },
      { ...base, id: 5, user: { name: 'No Login' } },
      { ...base, id: 0 },
      { ...base, id: 'x' },
      null,
      'garbage',
      { ...base, id: 9, user: { login: 'just_login' }, quality_grade: undefined },
    ];
    const { observations, dropped } = parseObservations({ results }, SITE);
    expect(observations.map((o) => o.id)).toEqual([9]);
    expect(observations[0].observer).toBe('just_login');
    expect(dropped).toBe(9);
  });

  it('never keeps a coordinate: only a distance rounded up to whole km', () => {
    const results = [
      { ...base, id: 1, geojson: { coordinates: [145.92, -16.5] } },
      { ...base, id: 2, geojson: null, location: '-16.5,145.905' },
      { ...base, id: 3, geojson: null, location: 'unknown' },
      { ...base, id: 4, geojson: { coordinates: [999, 999] } },
    ];
    const { observations } = parseObservations({ results }, SITE);
    expect(observations.map((o) => o.distanceKm)).toEqual([3, 1, undefined, undefined]);
    const text = JSON.stringify(observations);
    for (const leak of ['145.9', '-16.5', '16.5', 'geojson', 'coordinates', 'latitude', 'longitude', 'location"']) {
      expect(text).not.toContain(leak);
    }
  });

  it('gives no distance when the observer or the species hides the location', () => {
    const results = [
      { ...base, id: 1, obscured: true },
      { ...base, id: 2, geoprivacy: 'obscured' },
      { ...base, id: 3, taxon_geoprivacy: 'private' },
      { ...base, id: 4, geoprivacy: null, taxon_geoprivacy: null, obscured: false },
    ];
    const { observations } = parseObservations({ results }, SITE);
    expect(observations.map((o) => [o.distanceKm, o.locationObscured])).toEqual([
      [undefined, true],
      [undefined, true],
      [undefined, true],
      [1, false],
    ]);
  });

  it('refuses a response with no results array', () => {
    expect(() => parseObservations({ nope: [] }, SITE)).toThrow(ParseError);
    expect(() => parseObservations(null, SITE)).toThrow(ParseError);
  });
});

describe('OBIS checklist', () => {
  it('reads names and record counts, skipping malformed rows', () => {
    const page = parseChecklist({
      total: 7,
      results: [
        { taxonID: 9001, scientificName: 'Chelonia mydas', records: 40 },
        { taxonID: 9002, scientificName: 'Manta birostris', acceptedNameUsage: 'Mobula birostris', records: '7' },
        { taxonID: 9003, scientificName: 'Mobula', taxonRank: 'Genus', records: 99 },
        { taxonID: 9004, scientificName: 'Records missing' },
        { taxonID: 9005, scientificName: 'Records many', records: 'many' },
        { taxonID: 9006, records: 5 },
        { taxonID: 9007, scientificName: 'Zero records', records: 0 },
        null,
        'garbage',
      ],
    });
    expect(page.rows).toBe(9);
    expect(page.total).toBe(7);
    expect(page.taxa).toEqual([
      { names: ['Chelonia mydas'], rank: undefined, records: 40 },
      { names: ['Manta birostris', 'Mobula birostris'], rank: undefined, records: 7 },
      { names: ['Mobula'], rank: 'genus', records: 99 },
    ]);
  });

  it('refuses a response with no results array', () => {
    for (const bad of [null, {}, { results: {} }, 'x']) expect(() => parseChecklist(bad)).toThrow(ParseError);
  });

  it('says when OBIS holds more taxa than it returned', async () => {
    const results = [{ scientificName: 'Chelonia mydas', records: 4 }];
    expect((await fetchObisChecklist(SITE, { fetchImpl: async () => ok({ total: 1, results }) })).truncated).toBe(false);
    expect((await fetchObisChecklist(SITE, { fetchImpl: async () => ok({ total: 500, results }) })).truncated).toBe(true);
    expect((await fetchObisChecklist(SITE, { fetchImpl: async () => ok({ results }) })).truncated).toBe(false);
  });
});
