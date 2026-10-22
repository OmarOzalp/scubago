import { describe, expect, it } from '@jest/globals';

import { SOURCE_CREDITS } from '@/lib/external-sightings/attribution';
import type { InatObservation } from '@/lib/external-sightings/inaturalist';
import {
  buildSiteSightings,
  DEFAULT_RADIUS_KM,
  MAX_RECENT,
  MAX_RECENT_PER_SPECIES,
  radiusForSite,
  type BuildInput,
  type InatData,
  type ObisData,
  type SourceOutcome,
} from '@/lib/external-sightings/summary';
import type { SiteSightings } from '@/lib/external-sightings/types';

// Hand-written inputs shaped like what the clients return after parsing the documented responses.
// None of it is a real record.

const SITE = { id: 'test-reef', lat: -16.5, lng: 145.9, radiusKm: 3 };
const NOW = '2026-10-22T08:00:00.000Z';

function observation(id: number, taxonName: string, observedOn: string, extra: Partial<InatObservation> = {}): InatObservation {
  return {
    id,
    taxonName,
    observedOn,
    observer: `Observer ${id}`,
    observerLogin: `observer_${id}`,
    url: `https://www.inaturalist.org/observations/${id}`,
    licence: 'cc-by',
    credit: `© Observer ${id}, CC BY 4.0 (iNaturalist)`,
    locationObscured: false,
    ...extra,
  };
}

const inatData: InatData = {
  truncated: false,
  counts: [
    { taxonId: 1, name: 'Chelonia mydas', rank: 'species', count: 12 },
    { taxonId: 2, name: 'Mobula alfredi', rank: 'species', count: 5 },
    { taxonId: 3, name: 'Acropora millepora', rank: 'species', count: 30 },
    { taxonId: 4, name: 'Acropora', rank: 'genus', count: 99 },
    { taxonId: 5, name: 'Cheloniidae', rank: 'family', count: 1 },
    { taxonId: 6, name: 'Eretmochelys imbricata', rank: 'species', count: 2 },
  ],
  observations: [
    observation(11, 'Chelonia mydas', '2026-09-01'),
    observation(12, 'Mobula alfredi', '2026-10-03'),
    observation(13, 'Chelonia mydas', '2026-10-10'),
    observation(14, 'Acropora millepora', '2026-10-12'),
  ],
};

const obisData: ObisData = {
  truncated: false,
  taxa: [
    { names: ['Chelonia mydas'], records: 40 },
    { names: ['Manta birostris', 'Mobula birostris'], records: 7 },
    { names: ['Mobula alfredi'], records: 3 },
    { names: ['Acropora millepora'], records: 500 },
    { names: ['Porites lobata'], records: 20 },
    { names: ['Pomacentridae'], rank: 'family', records: 80 },
  ],
};

const okInat: SourceOutcome<InatData> = { ok: true, data: inatData };
const okObis: SourceOutcome<ObisData> = { ok: true, data: obisData };
const down = (error: string): SourceOutcome<never> => ({ ok: false, error, offline: false });

function build(input: Partial<BuildInput> = {}): SiteSightings {
  return buildSiteSightings({ site: SITE, fetchedAt: NOW, inat: okInat, obis: okObis, ...input });
}

describe('merging the two sources into a site summary', () => {
  const summary = build();

  it('describes the site and the refresh', () => {
    expect(summary.siteId).toBe('test-reef');
    expect(summary.radiusKm).toBe(3);
    expect(summary.fetchedAt).toBe(NOW);
  });

  it('keeps matched catalogue species from both sources, best evidence first', () => {
    expect(summary.species).toEqual([
      // Seen by both sources, most iNaturalist observations first.
      { speciesId: 'green-turtle', inaturalist: { observations: 12, lastObservedOn: '2026-10-10' }, obis: { records: 40 } },
      { speciesId: 'reef-manta', inaturalist: { observations: 5, lastObservedOn: '2026-10-03' }, obis: { records: 3 } },
      // One source each: iNaturalist before OBIS-only.
      { speciesId: 'hawksbill-turtle', inaturalist: { observations: 2 } },
      { speciesId: 'oceanic-manta', obis: { records: 7 } },
    ]);
  });

  it('counts unmatched species-level taxa per source, and ignores ranks above species', () => {
    // Acropora millepora and Porites lobata are not in the catalogue; the genus and family rows are not counted.
    expect(summary.unmatched).toEqual({ inaturalist: 1, obis: 2 });
  });

  it('records a status, credit and link for each source', () => {
    expect(summary.sources.map((source) => [source.id, source.ok])).toEqual([['inaturalist', true], ['obis', true]]);
    const [inat, obis] = summary.sources;
    expect(inat.attribution).toBe(SOURCE_CREDITS.inaturalist.attribution);
    expect(obis.attribution).toBe('OBIS and its data providers (obis.org)');
    expect(inat.licenceNote).toMatch(/CC0 or CC BY/);
    expect(inat.url).toBe('https://www.inaturalist.org/observations?lat=-16.5&lng=145.9&radius=3&quality_grade=research&verifiable=true');
    expect(obis.url).toBe('https://obis.org');
    expect(inat.fetchedAt).toBe(NOW);
    expect(inat.error).toBeUndefined();
  });

  it('lists recent observations that match the catalogue, newest first, with credit', () => {
    expect(summary.recent.map((r) => [r.observationId, r.speciesId, r.observedOn])).toEqual([
      [13, 'green-turtle', '2026-10-10'],
      [12, 'reef-manta', '2026-10-03'],
      [11, 'green-turtle', '2026-09-01'],
    ]);
    expect(summary.recent[0]).toMatchObject({
      source: 'inaturalist',
      observer: 'Observer 13',
      url: 'https://www.inaturalist.org/observations/13',
      licence: 'cc-by',
      credit: '© Observer 13, CC BY 4.0 (iNaturalist)',
    });
  });

  it('counts a subspecies row once for iNaturalist (the species row has it) but adds it up for OBIS', () => {
    const merged = build({
      inat: {
        ok: true,
        data: {
          truncated: false,
          observations: [],
          counts: [
            { taxonId: 1, name: 'Chelonia mydas', rank: 'species', count: 10 },
            { taxonId: 91, name: 'Chelonia mydas japonica', rank: 'subspecies', count: 4 },
          ],
        },
      },
      obis: {
        ok: true,
        data: {
          truncated: false,
          taxa: [
            { names: ['Chelonia mydas'], records: 10 },
            { names: ['Chelonia mydas japonica'], rank: 'subspecies', records: 4 },
          ],
        },
      },
    });
    expect(merged.species).toEqual([{ speciesId: 'green-turtle', inaturalist: { observations: 10 }, obis: { records: 14 } }]);
  });

  it('counts a renamed species under its catalogue entry', () => {
    const merged = build({ inat: { ok: true, data: { truncated: false, observations: [], counts: [{ name: 'Manta alfredi', rank: 'species', count: 2 }, { name: 'Mobula alfredi', rank: 'species', count: 3 }] } } });
    expect(merged.species.find((s) => s.speciesId === 'reef-manta')?.inaturalist?.observations).toBe(5);
  });
});

describe('recent observations are capped', () => {
  it('keeps at most three of one species and twenty in all', () => {
    const turtles = Array.from({ length: 8 }, (_, i) => observation(100 + i, 'Chelonia mydas', `2026-10-${String(20 - i).padStart(2, '0')}`));
    const summary = build({ inat: { ok: true, data: { ...inatData, observations: turtles } } });
    expect(summary.recent).toHaveLength(MAX_RECENT_PER_SPECIES);
    expect(summary.recent.map((r) => r.observationId)).toEqual([100, 101, 102]);
    // The newest date is still known for the species, whichever rows are kept.
    expect(summary.species.find((s) => s.speciesId === 'green-turtle')?.inaturalist?.lastObservedOn).toBe('2026-10-20');

    const names = [
      'Chelonia mydas', 'Mobula alfredi', 'Eretmochelys imbricata', 'Carcharias taurus', 'Rhincodon typus', 'Sphyrna lewini', 'Dugong dugon',
      'Tursiops truncatus', 'Pterois volitans', 'Zanclus cornutus', 'Octopus cyanea', 'Sepia apama', 'Tridacna gigas', 'Caretta caretta',
      'Taeniura lymma', 'Triaenodon obesus', 'Carcharhinus melanopterus', 'Mola mola', 'Cheilinus undulatus', 'Caranx ignobilis',
      'Sphyraena barracuda', 'Amphiprion ocellaris', 'Balistoides conspicillum',
    ];
    const many = names.map((name, i) => observation(200 + i, name, `2026-09-${String(28 - (i % 28)).padStart(2, '0')}`));
    const wide = build({ inat: { ok: true, data: { ...inatData, observations: many } } });
    expect(wide.recent).toHaveLength(MAX_RECENT);
    const dates = wide.recent.map((r) => r.observedOn);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it('lists an observation once even if it arrives twice, and leaves out species we do not catalogue', () => {
    const summary = build({
      inat: { ok: true, data: { ...inatData, observations: [observation(1, 'Chelonia mydas', '2026-10-01'), observation(1, 'Chelonia mydas', '2026-10-01'), observation(2, 'Porites lobata', '2026-10-02')] } },
    });
    expect(summary.recent.map((r) => r.observationId)).toEqual([1]);
  });

  it('carries distance, obscured flag and photo through, and nothing positional', () => {
    const photo = { url: 'https://inaturalist-open-data.s3.amazonaws.com/photos/1/square.jpg', licence: 'cc-by' as const, attribution: '(c) X, some rights reserved (CC BY)' };
    const summary = build({
      inat: {
        ok: true,
        data: {
          ...inatData,
          observations: [
            observation(1, 'Chelonia mydas', '2026-10-01', { distanceKm: 2, photo }),
            observation(2, 'Mobula alfredi', '2026-10-02', { locationObscured: true }),
          ],
        },
      },
    });
    const byId = new Map(summary.recent.map((r) => [r.observationId, r]));
    expect(byId.get(1)).toMatchObject({ distanceKm: 2, photo });
    expect(byId.get(1)?.locationObscured).toBeUndefined();
    expect(byId.get(2)?.locationObscured).toBe(true);
    expect(byId.get(2)?.distanceKm).toBeUndefined();
    expect(JSON.stringify(summary.recent)).not.toMatch(/lat|lng|coordinates/i);
  });
});

describe('when one source fails', () => {
  it('still gives a summary from the other', () => {
    const noObis = build({ obis: down('OBIS is busy (HTTP 429). Try again later.') });
    expect(noObis.sources.map((s) => [s.id, s.ok])).toEqual([['inaturalist', true], ['obis', false]]);
    expect(noObis.sources[1].error).toBe('OBIS is busy (HTTP 429). Try again later.');
    expect(noObis.species.every((s) => s.obis === undefined)).toBe(true);
    expect(noObis.species.map((s) => s.speciesId)).toEqual(['green-turtle', 'reef-manta', 'hawksbill-turtle']);
    expect(noObis.unmatched.obis).toBe(0);

    const noInat = build({ inat: down('No connection.') });
    expect(noInat.sources.map((s) => [s.id, s.ok])).toEqual([['inaturalist', false], ['obis', true]]);
    expect(noInat.species.every((s) => s.inaturalist === undefined)).toBe(true);
    expect(noInat.species.map((s) => s.speciesId)).toEqual(['green-turtle', 'oceanic-manta', 'reef-manta']);
    expect(noInat.recent).toEqual([]);
  });

  it('is empty, not invented, when both fail', () => {
    const none = build({ inat: down('a'), obis: down('b') });
    expect(none.species).toEqual([]);
    expect(none.recent).toEqual([]);
    expect(none.sources.every((s) => !s.ok)).toBe(true);
  });

  it('keeps the data the previous summary held for the source that failed, and says why it is old', () => {
    const previous = build({ fetchedAt: '2026-10-01T00:00:00.000Z' });
    const refreshed = build({ fetchedAt: NOW, obis: down('OBIS did not answer in time.'), previous });
    const obis = refreshed.sources.find((s) => s.id === 'obis');
    expect(obis).toMatchObject({ ok: true, error: 'OBIS did not answer in time.', fetchedAt: '2026-10-01T00:00:00.000Z' });
    expect(refreshed.species.find((s) => s.speciesId === 'oceanic-manta')?.obis?.records).toBe(7);
    expect(refreshed.unmatched.obis).toBe(2);
    expect(refreshed.sources.find((s) => s.id === 'inaturalist')?.fetchedAt).toBe(NOW);
    expect(refreshed.fetchedAt).toBe(NOW);
  });

  it('keeps iNaturalist’s earlier data when it fails, including the recent list', () => {
    const previous = build({ fetchedAt: '2026-10-01T00:00:00.000Z' });
    const refreshed = build({ inat: down('No connection.'), previous });
    expect(refreshed.recent).toEqual(previous.recent);
    expect(refreshed.species.find((s) => s.speciesId === 'green-turtle')?.inaturalist).toEqual({ observations: 12, lastObservedOn: '2026-10-10' });
    expect(refreshed.sources[0]).toMatchObject({ ok: true, error: 'No connection.', fetchedAt: '2026-10-01T00:00:00.000Z' });
  });

  it('does not borrow from a previous summary that never had the data', () => {
    const previous = build({ inat: down('x'), fetchedAt: '2026-10-01T00:00:00.000Z' });
    const refreshed = build({ inat: down('y'), previous });
    expect(refreshed.sources[0]).toMatchObject({ ok: false, error: 'y' });
    expect(refreshed.species.every((s) => s.inaturalist === undefined)).toBe(true);
  });

  it('keeps the last recent list when only the recent observations could not be read', () => {
    const previous = build({ fetchedAt: '2026-10-01T00:00:00.000Z' });
    const refreshed = build({
      inat: { ok: true, data: { ...inatData, observations: [], observationsError: 'Recent observations: No connection.' } },
      previous,
    });
    expect(refreshed.recent).toEqual(previous.recent);
    expect(refreshed.sources[0]).toMatchObject({ ok: true, error: 'Recent observations: No connection.', fetchedAt: NOW });
  });

  it('flags a source that had more taxa than one refresh reads', () => {
    const truncated = build({ inat: { ok: true, data: { ...inatData, truncated: true } }, obis: { ok: true, data: { ...obisData, truncated: true } } });
    expect(truncated.sources.map((s) => s.truncated)).toEqual([true, true]);
    expect(summaryHasNoTruncation(build())).toBe(true);
  });
});

function summaryHasNoTruncation(summary: SiteSightings): boolean {
  return summary.sources.every((s) => s.truncated === undefined);
}

describe('the radius', () => {
  it('defaults to 3 km and accepts an override within sensible limits', () => {
    expect(DEFAULT_RADIUS_KM).toBe(3);
    expect(radiusForSite()).toBe(3);
    expect(radiusForSite(5)).toBe(5);
    expect(radiusForSite(0)).toBe(0.5);
    expect(radiusForSite(-4)).toBe(0.5);
    expect(radiusForSite(10_000)).toBe(50);
    expect(radiusForSite(Number.NaN)).toBe(3);
    expect(radiusForSite(Infinity)).toBe(3);
  });
});
