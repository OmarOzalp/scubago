import { describe, expect, it } from '@jest/globals';
import { REGIONS_BY_ID } from '@/data/regions';
import { CATALOG_BY_ID } from '@/lib/catalog';
import { evaluatePassport, siteStamp, type PassportGroup, type RewardsInput } from '@/lib/rewards';
import type { Dive, DiveSite, Region, Sighting } from '@/lib/types';

// All the sightings, dives and sites below are hand-written test data, not anyone's log.
const seen = (siteId: string, sightedOn: string, speciesId = 'clownfish', over: Partial<Sighting> = {}): Sighting => ({
  id: `${speciesId}@${siteId}@${sightedOn}`, userId: 'me', username: 'me', speciesId, siteId, sightedOn,
  isDemo: false, synced: true, createdAt: `${sightedOn}T10:00:00.000Z`, ...over,
});
const dived = (siteId: string, divedOn: string, number: number): Dive => ({
  id: `dive-${number}`, userId: 'me', number, siteId, divedOn, synced: true, createdAt: `${divedOn}T09:00:00.000Z`,
});
const site = (id: string, over: Partial<DiveSite> = {}): DiveSite => ({
  id, name: `Site ${id}`, lat: 0, lng: 0, region: 'Test Sea', country: 'Testland', blurb: '', notableSpecies: [], source: 'user', ...over,
});
const lookup = (...sites: DiveSite[]) => new Map(sites.map((s) => [s.id, s]));
const group = (groups: PassportGroup[], id: string) => groups.find((g) => g.id === id)!;

// The Red Sea does not have a region of its own in src/data/regions.ts yet; an import is expected to add one.
const regions = new Map<string, Region>([...REGIONS_BY_ID, ['red-sea', { id: 'red-sea', name: 'Red Sea', source: 'test' }]]);

describe('the passport', () => {
  const sites = lookup(
    site('gbr-a', { regionId: 'gbr-cairns-cooktown', country: 'Australia' }),
    site('gbr-b', { regionId: 'great-barrier-reef', country: 'Australia' }),
    site('gbr-unvisited', { regionId: 'gbr-far-northern', country: 'Australia' }),
    site('rs-seed', { region: 'Red Sea', country: 'Egypt' }),
    site('rs-import', { regionId: 'red-sea', region: 'Red Sea', country: 'Egypt' }),
    site('rs-unvisited', { regionId: 'red-sea', country: 'Sudan' }),
    site('th-a', { country: 'Thailand' }),
    site('th-b', { country: 'thailand ' }),
    site('th-unvisited', { country: 'Thailand' }),
    site('nowhere', { country: '' }),
  );
  const input: RewardsInput = {
    sightings: [seen('th-a', '2026-01-05'), seen('rs-seed', '2026-02-10'), seen('nowhere', '2026-01-01', 'clownfish')],
    dives: [dived('gbr-a', '2026-03-01', 1), dived('gbr-b', '2026-03-09', 2), dived('rs-import', '2026-02-12', 3), dived('th-b', '2026-04-01', 4)],
    sites, catalog: CATALOG_BY_ID, regions,
  };
  const groups = evaluatePassport(input);

  it('groups visited sites by top-level region, walking regionId up its parents, else by country', () => {
    expect(groups.map((g) => g.id).sort()).toEqual(['country:', 'country:thailand', 'region:great-barrier-reef', 'region:red-sea']);
    expect(group(groups, 'region:great-barrier-reef')).toMatchObject({ kind: 'region', name: 'Great Barrier Reef' });
    expect(group(groups, 'country:thailand')).toMatchObject({ kind: 'country', name: 'Thailand' });
    expect(group(groups, 'country:')).toMatchObject({ kind: 'country', name: 'Elsewhere' });
    expect(group(groups, 'region:great-barrier-reef').stamps.map((s) => s.siteId).sort()).toEqual(['gbr-a', 'gbr-b']);
  });

  it('puts a seed site with no regionId and an imported one in the same sea on one page', () => {
    const redSea = group(groups, 'region:red-sea');
    expect(redSea.name).toBe('Red Sea');
    expect(redSea.stamps.map((s) => s.siteId).sort()).toEqual(['rs-import', 'rs-seed']);
  });

  it('counts the sites the lookup knows in each group, visited or not', () => {
    expect(group(groups, 'region:great-barrier-reef').knownSites).toBe(3);
    expect(group(groups, 'region:red-sea').knownSites).toBe(3);
    expect(group(groups, 'country:thailand').knownSites).toBe(3);
    expect(group(groups, 'country:').knownSites).toBe(1);
  });

  it('lists the most recently visited group first, and its stamps most recent first', () => {
    expect(groups.map((g) => g.id)).toEqual(['country:thailand', 'region:great-barrier-reef', 'region:red-sea', 'country:']);
    expect(group(groups, 'region:great-barrier-reef').stamps.map((s) => s.siteId)).toEqual(['gbr-b', 'gbr-a']);
    expect(group(groups, 'region:red-sea').stamps.map((s) => s.siteId)).toEqual(['rs-import', 'rs-seed']);
    expect(group(groups, 'region:great-barrier-reef')).toMatchObject({ firstVisitedOn: '2026-03-01', lastVisitedOn: '2026-03-09' });
    expect(group(groups, 'country:thailand')).toMatchObject({ firstVisitedOn: '2026-01-05', lastVisitedOn: '2026-04-01' });
  });

  it('does not list sites that were never visited, or that the lookup does not know', () => {
    const all = groups.flatMap((g) => g.stamps.map((s) => s.siteId));
    expect(all).not.toContain('gbr-unvisited');
    const withStranger = evaluatePassport({ ...input, sightings: [...input.sightings, seen('deleted-site', '2026-05-01')] });
    expect(withStranger.flatMap((g) => g.stamps)).toHaveLength(all.length);
  });
});

describe('a stamp', () => {
  const sites = lookup(site('reef', { name: 'The Reef' }), site('other'));
  const base = { sites, catalog: CATALOG_BY_ID };
  // Out of order on purpose: a dive and two sightings on one day, one on another, and a dive on a third.
  const input = {
    ...base,
    sightings: [
      seen('reef', '2026-06-02', 'reef-manta'),
      seen('reef', '2026-05-01', 'green-turtle', { createdAt: '2026-05-01T08:00:00.000Z' }),
      seen('reef', '2026-05-01', 'clownfish'),
      seen('reef', '2026-06-02', 'unlisted', { customName: 'Odd one' }),
      seen('reef', '2026-06-02', 'made-up-species'),
      seen('reef', '2026-07-09', 'reef-manta', { id: 'again' }),
      seen('other', '2026-01-01'),
    ],
    dives: [dived('reef', '2026-05-01', 1), dived('reef', '2026-08-15', 2), dived('other', '2026-01-01', 3)],
  };

  it('carries the site, first and last day, distinct visit days, dives and species seen there', () => {
    expect(siteStamp('reef', input)).toEqual({
      siteId: 'reef',
      siteName: 'The Reef',
      firstVisitedOn: '2026-05-01',
      lastVisitedOn: '2026-08-15',
      // 1 May (a dive and two sightings), 2 June, 9 July and 15 August.
      visits: 4,
      dives: 2,
      // In the order first seen (the turtle was logged earlier that day than the clownfish), with "something else" and the unknown species left out.
      speciesIds: ['green-turtle', 'clownfish', 'reef-manta'],
    });
  });

  it('is the same one the passport shows', () => {
    const stamp = evaluatePassport({ ...input, sightings: [...input.sightings] }).flatMap((g) => g.stamps).find((s) => s.siteId === 'reef');
    expect(stamp).toEqual(siteStamp('reef', input));
  });

  it('is null for a site never visited or not in the lookup', () => {
    expect(siteStamp('nowhere', input)).toBeNull();
    expect(siteStamp('reef', { ...base, sightings: [], dives: [] })).toBeNull();
    expect(siteStamp('reef', { ...base, sites: lookup(site('other')), sightings: input.sightings, dives: input.dives })).toBeNull();
  });

  it('is made by a single sighting, with one visit and no dives', () => {
    expect(siteStamp('other', { ...base, sightings: [seen('other', '2026-01-01')], dives: [] })).toMatchObject({ visits: 1, dives: 0, speciesIds: ['clownfish'] });
  });
});
