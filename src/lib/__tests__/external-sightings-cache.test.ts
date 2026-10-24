import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  CACHE_INDEX_KEY,
  CACHE_PREFIX,
  CACHE_TTL_MS,
  cacheKey,
  clearCachedSightings,
  isStale,
  MAX_CACHED_SITES,
  PARTIAL_RETRY_MS,
  parseSiteSightings,
  readCachedSightings,
  readCachedSummaries,
  writeCachedSightings,
} from '@/lib/external-sightings/cache';
import type { FetchImpl, ResponseLike } from '@/lib/external-sightings/http';
import { HostQueue } from '@/lib/external-sightings/queue';
import { createSightingsService, FAILURE_BACKOFF_MS } from '@/lib/external-sightings/service';
import type { SiteSightings, SourceStatus } from '@/lib/external-sightings/types';

// Every response and summary below is hand-written to match the documented shapes. None of it is
// a real record, and the ids are made up for the tests.

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 9, 22, 8, 0, 0);
const iso = (ms: number) => new Date(ms).toISOString();

function status(id: 'inaturalist' | 'obis', fetchedAt: number, extra: Partial<SourceStatus> = {}): SourceStatus {
  return { id, ok: true, fetchedAt: iso(fetchedAt), attribution: `credit ${id}`, licenceNote: `licence ${id}`, url: `https://example.test/${id}`, ...extra };
}

function summary(siteId: string, fetchedAt = T0, extra: Partial<SiteSightings> = {}): SiteSightings {
  return {
    siteId,
    radiusKm: 3,
    fetchedAt: iso(fetchedAt),
    sources: [status('inaturalist', fetchedAt), status('obis', fetchedAt)],
    species: [{ speciesId: 'green-turtle', inaturalist: { observations: 4, lastObservedOn: '2026-10-01' }, obis: { records: 9 } }],
    recent: [],
    unmatched: { inaturalist: 1, obis: 2 },
    ...extra,
  };
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('how long a summary is good for', () => {
  it('is fresh for a week when every source answered', () => {
    const s = summary('a');
    expect(CACHE_TTL_MS).toBe(7 * DAY);
    expect(isStale(s, T0)).toBe(false);
    expect(isStale(s, T0 + 6 * DAY)).toBe(false);
    expect(isStale(s, T0 + 7 * DAY)).toBe(false);
    expect(isStale(s, T0 + 7 * DAY + 1)).toBe(true);
  });

  it('judges each source by when its data was fetched', () => {
    const s = summary('a', T0, { sources: [status('inaturalist', T0), status('obis', T0 - 8 * DAY)] });
    expect(isStale(s, T0)).toBe(true);
  });

  it('is retried after an hour when a source failed or only partly refreshed', () => {
    const failed = summary('a', T0, { sources: [status('inaturalist', T0), status('obis', T0, { ok: false, error: 'down' })] });
    expect(PARTIAL_RETRY_MS).toBe(60 * 60 * 1000);
    expect(isStale(failed, T0 + 59 * 60 * 1000)).toBe(false);
    expect(isStale(failed, T0 + 61 * 60 * 1000)).toBe(true);
    const kept = summary('a', T0, { sources: [status('inaturalist', T0), status('obis', T0 - DAY, { error: 'No connection.' })] });
    expect(isStale(kept, T0 + 61 * 60 * 1000)).toBe(true);
  });

  it('treats unreadable times and an empty source list as stale', () => {
    expect(isStale(summary('a', T0, { sources: [] }), T0)).toBe(true);
    expect(isStale(summary('a', T0, { sources: [{ ...status('obis', T0), fetchedAt: 'yesterday-ish' }] }), T0)).toBe(true);
  });
});

describe('storing summaries', () => {
  it('uses one key per site and an index', async () => {
    await writeCachedSightings(summary('richelieu-rock'));
    expect(CACHE_PREFIX).toBe('scubago.realSightings.v1.');
    expect(await AsyncStorage.getItem('scubago.realSightings.v1.richelieu-rock')).not.toBeNull();
    expect(JSON.parse((await AsyncStorage.getItem(CACHE_INDEX_KEY)) ?? '{}')).toEqual({ v: 1, ids: ['richelieu-rock'] });
    expect(await readCachedSightings('richelieu-rock')).toEqual(summary('richelieu-rock'));
    expect(await readCachedSightings('nowhere')).toBeNull();
  });

  it('overwrites a site’s entry without adding it to the index twice', async () => {
    await writeCachedSightings(summary('a'));
    await writeCachedSightings(summary('a', T0 + DAY));
    expect(JSON.parse((await AsyncStorage.getItem(CACHE_INDEX_KEY)) ?? '{}').ids).toEqual(['a']);
    expect((await readCachedSightings('a'))?.fetchedAt).toBe(iso(T0 + DAY));
  });

  it('drops the least recently used sites beyond the limit', async () => {
    for (const id of ['a', 'b', 'c', 'd', 'e']) await writeCachedSightings(summary(id), 3);
    expect(await readCachedSightings('a')).toBeNull();
    expect(await readCachedSightings('b')).toBeNull();
    for (const id of ['c', 'd', 'e']) expect(await readCachedSightings(id)).not.toBeNull();
    expect(JSON.parse((await AsyncStorage.getItem(CACHE_INDEX_KEY)) ?? '{}').ids).toEqual(['c', 'd', 'e']);
    expect(await AsyncStorage.getItem(cacheKey('a'))).toBeNull();
  });

  it('counts a read as a use', async () => {
    for (const id of ['a', 'b', 'c']) await writeCachedSightings(summary(id), 3);
    await readCachedSightings('a');
    await writeCachedSightings(summary('d'), 3);
    expect(await readCachedSightings('b')).toBeNull();
    expect(await readCachedSightings('a')).not.toBeNull();
  });

  it('holds 300 sites by default', async () => {
    expect(MAX_CACHED_SITES).toBe(300);
    for (let i = 0; i < 303; i += 1) await writeCachedSightings(summary(`site-${i}`));
    const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_INDEX_KEY);
    expect(keys).toHaveLength(300);
    expect(await readCachedSightings('site-0')).toBeNull();
    expect(await readCachedSightings('site-2')).toBeNull();
    expect(await readCachedSightings('site-3')).not.toBeNull();
    expect(await readCachedSightings('site-302')).not.toBeNull();
  });

  it('reads many summaries without reordering them', async () => {
    for (const id of ['a', 'b', 'c']) await writeCachedSightings(summary(id), 3);
    const found = await readCachedSummaries(['a', 'missing', 'b']);
    expect(found.map((s) => s.siteId)).toEqual(['a', 'b']);
    expect(JSON.parse((await AsyncStorage.getItem(CACHE_INDEX_KEY)) ?? '{}').ids).toEqual(['a', 'b', 'c']);
  });

  it('forgets one site or all of them', async () => {
    for (const id of ['a', 'b']) await writeCachedSightings(summary(id));
    await clearCachedSightings('a');
    expect(await readCachedSightings('a')).toBeNull();
    expect(await readCachedSightings('b')).not.toBeNull();
    await clearCachedSightings();
    expect(await readCachedSightings('b')).toBeNull();
    expect(await AsyncStorage.getItem(CACHE_INDEX_KEY)).toBeNull();
  });

  it('is best effort: a storage failure is not an error', async () => {
    // The AsyncStorage mock is made of jest.fn()s, so a one-off failure is queued rather than spied on and restored.
    jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('disk full'));
    await expect(writeCachedSightings(summary('a'))).resolves.toBeUndefined();
    expect(await readCachedSightings('a')).toBeNull();
    await writeCachedSightings(summary('a'));
    jest.mocked(AsyncStorage.getItem).mockRejectedValueOnce(new Error('locked'));
    await expect(readCachedSightings('a')).resolves.toBeNull();
  });
});

describe('entries that cannot be trusted', () => {
  it('ignores, and removes, corrupt entries', async () => {
    const bad: Record<string, string> = {
      notjson: 'not json at all',
      array: '[]',
      noversion: JSON.stringify({ summary: summary('noversion') }),
      wrongversion: JSON.stringify({ v: 2, summary: summary('wrongversion') }),
      nosummary: JSON.stringify({ v: 1 }),
      nosources: JSON.stringify({ v: 1, summary: { ...summary('nosources'), sources: [] } }),
      badtime: JSON.stringify({ v: 1, summary: { ...summary('badtime'), fetchedAt: 'never' } }),
      badradius: JSON.stringify({ v: 1, summary: { ...summary('badradius'), radiusKm: 'wide' } }),
      speciesnotlist: JSON.stringify({ v: 1, summary: { ...summary('speciesnotlist'), species: 'many' } }),
      // An entry stored under another site's key.
      swapped: JSON.stringify({ v: 1, summary: summary('someone-else') }),
    };
    for (const [id, raw] of Object.entries(bad)) await AsyncStorage.setItem(cacheKey(id), raw);
    for (const id of Object.keys(bad)) {
      expect({ id, found: await readCachedSightings(id) }).toEqual({ id, found: null });
      expect(await AsyncStorage.getItem(cacheKey(id))).toBeNull();
    }
  });

  it('keeps the word that the recent observations could not be read', () => {
    const failed = summary('a', T0, { sources: [status('inaturalist', T0, { error: 'Recent observations: No connection.', recentFailed: true }), status('obis', T0)] });
    expect(parseSiteSightings(failed)?.sources[0]).toMatchObject({ recentFailed: true });
    expect(parseSiteSightings(summary('a'))?.sources[0].recentFailed).toBeUndefined();
  });

  it('rebuilds the field-by-field shape and drops what does not check out', () => {
    const parsed = parseSiteSightings({
      ...summary('a'),
      extra: 'ignored',
      species: [
        { speciesId: 'green-turtle', inaturalist: { observations: 4 }, extra: 1 },
        { speciesId: '', obis: { records: 3 } },
        { speciesId: 'no-evidence' },
        { speciesId: 'bad-count', inaturalist: { observations: 'many' } },
        'junk',
      ],
      recent: [
        // A CC BY-NC record that somehow got in is dropped on the way out.
        { source: 'inaturalist', observationId: 1, speciesId: 'green-turtle', observedOn: '2026-10-01', observer: 'A', observerLogin: 'a', licence: 'cc-by-nc', url: 'https://x.test' },
        // An open record keeps its fields, with the link rebuilt and a photo from a host we do not trust dropped.
        {
          source: 'inaturalist', observationId: 2, speciesId: 'green-turtle', observedOn: '2026-10-02', observer: 'B', observerLogin: 'b', licence: 'cc-by',
          url: 'https://evil.test/phish', distanceKm: 2, lat: -16.5, lng: 145.9,
          photo: { url: 'https://evil.test/x.jpg', licence: 'cc-by', attribution: 'x' },
        },
        { source: 'inaturalist', observationId: 3, speciesId: 'green-turtle', observedOn: 'soon', observer: 'C', observerLogin: 'c', licence: 'cc-by' },
        {
          source: 'inaturalist', observationId: 4, speciesId: 'green-turtle', observedOn: '2026-10-04', observer: 'D', observerLogin: 'd', licence: 'cc0',
          photo: { url: 'https://inaturalist-open-data.s3.amazonaws.com/photos/4/square.jpg', licence: 'cc-by-nc', attribution: 'x' },
        },
      ],
    });
    expect(parsed?.species).toEqual([{ speciesId: 'green-turtle', inaturalist: { observations: 4 } }]);
    expect(parsed?.recent.map((r) => r.observationId)).toEqual([2, 4]);
    expect(parsed?.recent[0]).toEqual({
      source: 'inaturalist',
      observationId: 2,
      speciesId: 'green-turtle',
      observedOn: '2026-10-02',
      observer: 'B',
      observerLogin: 'b',
      url: 'https://www.inaturalist.org/observations/2',
      licence: 'cc-by',
      credit: '© B, CC BY 4.0 (iNaturalist)',
      distanceKm: 2,
    });
    expect(parsed?.recent[1].photo).toBeUndefined();
    expect(parsed).not.toHaveProperty('extra');
  });

  it('rebuilds a lost or damaged index from the entries, so eviction still works', async () => {
    for (const id of ['a', 'b', 'c']) await writeCachedSightings(summary(id), 3);
    await AsyncStorage.setItem(CACHE_INDEX_KEY, '{not json');
    await writeCachedSightings(summary('d'), 3);
    const kept = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_INDEX_KEY);
    expect(kept).toHaveLength(3);
    expect(await readCachedSightings('d')).not.toBeNull();
    await AsyncStorage.removeItem(CACHE_INDEX_KEY);
    await writeCachedSightings(summary('e'), 3);
    expect((await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_INDEX_KEY)).toHaveLength(3);
  });
});

// ── The service: cache first, then refresh ─────────────────────────────────────────────────────

const SITE = { id: 'test-reef', lat: -16.5, lng: 145.9 };

function ok(body: unknown): ResponseLike {
  return { ok: true, status: 200, json: async () => body };
}

const speciesCounts = {
  total_results: 3,
  results: [
    { count: 12, taxon: { id: 1001, name: 'Chelonia mydas', rank: 'species' } },
    { count: 5, taxon: { id: 1002, name: 'Mobula alfredi', rank: 'species' } },
    { count: 30, taxon: { id: 1003, name: 'Acropora millepora', rank: 'species' } },
  ],
};
const observations = {
  results: [
    {
      id: 501, quality_grade: 'research', observed_on: '2026-10-01', license_code: 'cc-by', user: { login: 'a_diver', name: 'A. Diver' },
      taxon: { id: 1001, name: 'Chelonia mydas', rank: 'species' }, geojson: { coordinates: [145.91, -16.5] }, photos: [],
    },
  ],
};
const checklist = {
  total: 2,
  results: [
    { scientificName: 'Chelonia mydas', records: 40 },
    { scientificName: 'Manta birostris', acceptedNameUsage: 'Mobula birostris', records: 7 },
  ],
};

interface World {
  inatDown?: 'offline' | 'http';
  obisDown?: 'offline' | 'http';
  calls: string[];
}

function makeWorld(): { world: World; fetchImpl: FetchImpl } {
  const world: World = { calls: [] };
  const fetchImpl: FetchImpl = async (url) => {
    world.calls.push(url);
    const inat = url.includes('api.inaturalist.org');
    const down = inat ? world.inatDown : world.obisDown;
    if (down === 'offline') throw new TypeError('Network request failed');
    if (down === 'http') return { ok: false, status: 503, json: async () => ({}) };
    if (url.includes('/species_counts')) return ok(speciesCounts);
    if (inat) return ok(observations);
    return ok(checklist);
  };
  return { world, fetchImpl };
}

function makeService(fetchImpl: FetchImpl, clock: { time: number }) {
  const queue = new HostQueue({ now: () => clock.time, sleep: async (ms) => void (clock.time += ms) });
  return createSightingsService({ fetchImpl, queue, now: () => clock.time });
}

describe('stale-while-revalidate', () => {
  it('fetches, stores and returns a summary when nothing is cached', async () => {
    const { world, fetchImpl } = makeWorld();
    const clock = { time: T0 };
    const service = makeService(fetchImpl, clock);
    const result = await service.load(SITE);
    expect(result).toMatchObject({ status: 'ready', stale: false, refreshed: true });
    expect(result.summary?.species.map((s) => s.speciesId)).toEqual(['green-turtle', 'reef-manta', 'oceanic-manta']);
    expect(result.summary?.recent.map((r) => r.observationId)).toEqual([501]);
    // fetchedAt is when the refresh finished, after the 1.1 s the queue waited between iNaturalist requests.
    expect(result.summary?.fetchedAt).toBe(iso(clock.time));
    expect(await readCachedSightings(SITE.id)).toEqual(result.summary);
    // Counts first, then observations for the catalogue taxa the counts found; OBIS alongside.
    expect(world.calls.filter((url) => url.includes('inaturalist'))).toEqual([
      'https://api.inaturalist.org/v1/observations/species_counts?lat=-16.5&lng=145.9&radius=3&quality_grade=research&verifiable=true&iconic_taxa=Actinopterygii,Animalia,Mammalia,Mollusca,Reptilia&per_page=200',
      'https://api.inaturalist.org/v1/observations?lat=-16.5&lng=145.9&radius=3&quality_grade=research&verifiable=true&license=cc0,cc-by&order_by=observed_on&order=desc&per_page=30&taxon_id=1001,1002',
    ]);
    expect(world.calls.filter((url) => url.includes('obis'))).toHaveLength(1);
    // The two iNaturalist requests were spaced out; the clock moved by at least 1.1 s.
    expect(clock.time - T0).toBeGreaterThanOrEqual(1100);
  });

  it('returns a fresh cache at once and makes no request', async () => {
    const { world, fetchImpl } = makeWorld();
    const clock = { time: T0 };
    await writeCachedSightings(summary(SITE.id, T0 - 2 * DAY));
    const seen: boolean[] = [];
    const result = await makeService(fetchImpl, clock).load(SITE, { onCached: ({ stale }) => void seen.push(stale) });
    expect(world.calls).toEqual([]);
    expect(seen).toEqual([false]);
    expect(result).toMatchObject({ status: 'ready', stale: false, refreshed: false });
    expect(result.summary?.fetchedAt).toBe(iso(T0 - 2 * DAY));
  });

  it('hands over the stale cache before any request, then refreshes in the background', async () => {
    const { world, fetchImpl } = makeWorld();
    const clock = { time: T0 };
    await writeCachedSightings(summary(SITE.id, T0 - 9 * DAY));
    const order: string[] = [];
    const tracing: FetchImpl = async (url, init) => {
      order.push('fetch');
      return fetchImpl(url, init);
    };
    const result = await makeService(tracing, clock).load(SITE, {
      onCached: ({ summary: cached, stale }) => order.push(`cached ${cached.fetchedAt === iso(T0 - 9 * DAY)} stale=${stale}`),
    });
    expect(order[0]).toBe('cached true stale=true');
    expect(order.slice(1).every((entry) => entry === 'fetch')).toBe(true);
    expect(world.calls.length).toBeGreaterThan(0);
    expect(result).toMatchObject({ status: 'ready', refreshed: true });
    expect(result.summary?.fetchedAt).toBe(iso(clock.time));
    expect((await readCachedSightings(SITE.id))?.fetchedAt).toBe(iso(clock.time));
  });

  it('keeps the cached summary and reports it when offline', async () => {
    const { world, fetchImpl } = makeWorld();
    world.inatDown = 'offline';
    world.obisDown = 'offline';
    const clock = { time: T0 };
    const old = summary(SITE.id, T0 - 9 * DAY);
    await writeCachedSightings(old);
    const result = await makeService(fetchImpl, clock).load(SITE);
    expect(result).toMatchObject({ status: 'offline', stale: true, refreshed: false, error: 'No connection.' });
    expect(result.summary).toEqual(old);
    expect(await readCachedSightings(SITE.id)).toEqual(old);
  });

  it('reports an error, with the cached copy, when the servers fail', async () => {
    const { world, fetchImpl } = makeWorld();
    world.inatDown = 'http';
    world.obisDown = 'http';
    const old = summary(SITE.id, T0 - 9 * DAY);
    await writeCachedSightings(old);
    const result = await makeService(fetchImpl, { time: T0 }).load(SITE);
    expect(result).toMatchObject({ status: 'error', stale: true, summary: old });
    expect(result.error).toMatch(/HTTP 503/);
  });

  it('shows nothing, not something made up, when offline with no cache', async () => {
    const { world, fetchImpl } = makeWorld();
    world.inatDown = 'offline';
    world.obisDown = 'offline';
    const result = await makeService(fetchImpl, { time: T0 }).load(SITE);
    expect(result).toMatchObject({ summary: null, status: 'offline', stale: false });
    expect(await readCachedSightings(SITE.id)).toBeNull();
  });

  it('does not retry at once after a failure, unless asked', async () => {
    const { world, fetchImpl } = makeWorld();
    world.inatDown = 'offline';
    world.obisDown = 'offline';
    const clock = { time: T0 };
    const service = makeService(fetchImpl, clock);
    await service.load(SITE);
    const afterFirst = world.calls.length;
    await service.load(SITE);
    expect(world.calls.length).toBe(afterFirst);
    await service.load(SITE, { forceRefresh: true });
    expect(world.calls.length).toBeGreaterThan(afterFirst);
    const afterForced = world.calls.length;
    clock.time += FAILURE_BACKOFF_MS + 1;
    await service.load(SITE);
    expect(world.calls.length).toBeGreaterThan(afterForced);
  });

  it('gives a summary from the source that worked, and tries the other again within the hour', async () => {
    const { world, fetchImpl } = makeWorld();
    world.obisDown = 'http';
    const clock = { time: T0 };
    const service = makeService(fetchImpl, clock);
    const first = await service.load(SITE);
    expect(first.status).toBe('ready');
    expect(first.summary?.sources.map((s) => [s.id, s.ok])).toEqual([['inaturalist', true], ['obis', false]]);
    expect(first.summary?.species.map((s) => s.speciesId)).toEqual(['green-turtle', 'reef-manta']);

    // Soon after: the partial summary is still used as it is.
    clock.time += 30 * 60 * 1000;
    const callsBefore = world.calls.length;
    expect((await service.load(SITE)).refreshed).toBe(false);
    expect(world.calls.length).toBe(callsBefore);

    // After the hour OBIS is back, and the summary completes.
    world.obisDown = undefined;
    clock.time += 31 * 60 * 1000;
    const healed = await service.load(SITE);
    expect(healed.refreshed).toBe(true);
    expect(healed.summary?.sources.map((s) => s.ok)).toEqual([true, true]);
    expect(healed.summary?.species.map((s) => s.speciesId)).toEqual(['green-turtle', 'reef-manta', 'oceanic-manta']);
  });

  it('a later page of species counts that fails is a partial answer, tried again within the hour', async () => {
    const { world, fetchImpl } = makeWorld();
    const page = { total_results: 450, results: Array.from({ length: 200 }, (_, i) => ({ count: 200 - i, taxon: { id: 2000 + i, name: `Taxon ${i}`, rank: 'species' } })) };
    page.results[199] = { count: 1, taxon: { id: 1001, name: 'Chelonia mydas', rank: 'species' } };
    const paging: FetchImpl = async (url, init) => {
      if (!url.includes('/species_counts')) return fetchImpl(url, init);
      world.calls.push(url);
      return url.includes('&page=2') ? { ok: false, status: 502, json: async () => ({}) } : ok(page);
    };
    const clock = { time: T0 };
    const result = await makeService(paging, clock).load(SITE);
    const inat = result.summary?.sources.find((s) => s.id === 'inaturalist');
    expect(inat).toMatchObject({ ok: true, error: expect.stringMatching(/HTTP 502/) });
    expect(inat?.truncated).toBeUndefined();
    expect(result.summary?.species.map((s) => s.speciesId)).toContain('green-turtle');
    const cached = await readCachedSightings(SITE.id);
    expect(isStale(cached!, clock.time + 30 * 60 * 1000)).toBe(false);
    expect(isStale(cached!, clock.time + PARTIAL_RETRY_MS + 1)).toBe(true);
  });

  it('keeps one source’s older data when only the other fails to refresh', async () => {
    const { world, fetchImpl } = makeWorld();
    const clock = { time: T0 };
    const service = makeService(fetchImpl, clock);
    const firstAt = (await service.load(SITE)).summary?.fetchedAt;
    world.obisDown = 'offline';
    clock.time += 8 * DAY;
    const result = await service.load(SITE);
    const obis = result.summary?.sources.find((s) => s.id === 'obis');
    expect(obis).toMatchObject({ ok: true, error: 'No connection.', fetchedAt: firstAt });
    expect(result.summary?.species.find((s) => s.speciesId === 'oceanic-manta')?.obis?.records).toBe(7);
    // iNaturalist did refresh.
    expect(result.summary?.sources.find((s) => s.id === 'inaturalist')?.fetchedAt).toBe(iso(clock.time));
  });

  it('refreshes when asked to, even if the cache is fresh', async () => {
    const { world, fetchImpl } = makeWorld();
    await writeCachedSightings(summary(SITE.id, T0));
    const result = await makeService(fetchImpl, { time: T0 }).load(SITE, { forceRefresh: true });
    expect(result.refreshed).toBe(true);
    expect(world.calls.length).toBeGreaterThan(0);
  });

  it('refreshes a cached summary made for another radius', async () => {
    const { world, fetchImpl } = makeWorld();
    await writeCachedSightings(summary(SITE.id, T0));
    const result = await makeService(fetchImpl, { time: T0 }).load(SITE, { radiusKm: 5 });
    expect(result.refreshed).toBe(true);
    expect(result.summary?.radiusKm).toBe(5);
    expect(world.calls[0]).toContain('radius=5');
  });

  it('shares one refresh between two callers for the same site', async () => {
    const { world, fetchImpl } = makeWorld();
    const service = makeService(fetchImpl, { time: T0 });
    const [a, b] = await Promise.all([service.load(SITE), service.load(SITE)]);
    expect(a.summary).toEqual(b.summary);
    expect(world.calls.filter((url) => url.includes('species_counts'))).toHaveLength(1);
    expect(world.calls.filter((url) => url.includes('obis'))).toHaveLength(1);
  });

  it('rejects with AbortError only when the caller aborts, and fetches nothing then', async () => {
    const { world, fetchImpl } = makeWorld();
    const controller = new AbortController();
    controller.abort();
    await expect(makeService(fetchImpl, { time: T0 }).load(SITE, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(world.calls).toEqual([]);
  });

  it('refuses a site without a usable position, without calling anything', async () => {
    const { world, fetchImpl } = makeWorld();
    const service = makeService(fetchImpl, { time: T0 });
    for (const site of [{ id: 'x', lat: 91, lng: 0 }, { id: 'x', lat: Number.NaN, lng: 0 }, { id: '', lat: 0, lng: 0 }]) {
      expect(await service.load(site)).toMatchObject({ summary: null, status: 'error' });
    }
    expect(world.calls).toEqual([]);
  });

  it('survives a listener that throws', async () => {
    const { fetchImpl } = makeWorld();
    await writeCachedSightings(summary(SITE.id, T0));
    const result = await makeService(fetchImpl, { time: T0 }).load(SITE, { onCached: () => { throw new Error('listener bug'); } });
    expect(result.status).toBe('ready');
  });

  it('prefetches stale sites in turn and stops when there is no connection', async () => {
    const { world, fetchImpl } = makeWorld();
    const clock = { time: T0 };
    await writeCachedSightings(summary('fresh-one', T0));
    const service = makeService(fetchImpl, clock);
    const sites = [{ id: 'fresh-one', lat: 1, lng: 1 }, { id: 'new-one', lat: 2, lng: 2 }, { id: 'newer-one', lat: 3, lng: 3 }];
    expect(await service.prefetch(sites)).toEqual({ refreshed: 2, skipped: 1, failed: 0 });

    world.inatDown = 'offline';
    world.obisDown = 'offline';
    clock.time += 10 * DAY;
    world.calls.length = 0;
    const result = await service.prefetch(sites);
    expect(result).toEqual({ refreshed: 0, skipped: 0, failed: 1 });
  });
});
