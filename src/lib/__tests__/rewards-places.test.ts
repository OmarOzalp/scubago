import { describe, expect, it } from '@jest/globals';
import { REGIONS_BY_ID } from '@/data/regions';
import { SITE_ALIASES, SITES, SITES_BY_ID } from '@/data/sites';
import { CATALOG_BY_ID } from '@/lib/catalog';
import { evaluateBadges, REGION_BADGES, type BadgeResult, type RewardsInput } from '@/lib/rewards';
import type { Dive, DiveSite, Region, Sighting } from '@/lib/types';

// All the sightings, dives and sites below are hand-written test data, not anyone's log.
const seen = (siteId: string, sightedOn: string, over: Partial<Sighting> = {}): Sighting => ({
  id: `${siteId}@${sightedOn}`, userId: 'me', username: 'me', speciesId: 'clownfish', siteId, sightedOn,
  isDemo: false, synced: true, createdAt: `${sightedOn}T10:00:00.000Z`, ...over,
});
const dived = (siteId: string, divedOn: string, number = 1): Dive => ({
  id: `dive-${siteId}@${divedOn}`, userId: 'me', number, siteId, divedOn, synced: true, createdAt: `${divedOn}T09:00:00.000Z`,
});
const site = (id: string, over: Partial<DiveSite> = {}): DiveSite => ({
  id, name: id, lat: 0, lng: 0, region: 'Test Sea', country: 'Testland', blurb: '', notableSpecies: [], source: 'user', ...over,
});
const lookup = (...sites: DiveSite[]) => new Map(sites.map((s) => [s.id, s]));
const evaluate = (sites: ReadonlyMap<string, DiveSite>, over: Partial<RewardsInput>) =>
  evaluateBadges({ sightings: [], dives: [], sites, catalog: CATALOG_BY_ID, ...over });
const badge = (results: BadgeResult[], id: string) => results.find((b) => b.id === id)!;
const day = (n: number) => `2026-03-${String(n).padStart(2, '0')}`;
/** n sites named `${prefix}-1` to `${prefix}-n`, each with the same extras. */
const many = (prefix: string, n: number, over: Partial<DiveSite>) => [...Array(n)].map((_, i) => site(`${prefix}-${i + 1}`, over));

describe('dive sites visited', () => {
  const sites = lookup(...many('s', 6, {}));

  it('count distinct sites, from dives and sightings alike, earned on the day the nth was first visited', () => {
    // Out of order, with repeat visits, and one site only ever seen through a sighting.
    const log: Partial<RewardsInput> = {
      sightings: [seen('s-5', day(9)), seen('s-2', day(2)), seen('s-2', day(30))],
      dives: [dived('s-4', day(8)), dived('s-1', day(1)), dived('s-3', day(4), 2), dived('s-1', day(20), 3), dived('s-6', day(25), 4)],
    };
    const results = evaluate(sites, log);
    // First visits: s-1 day 1, s-2 day 2, s-3 day 4, s-4 day 8, s-5 day 9, s-6 day 25.
    expect(badge(results, 'sites-5')).toMatchObject({ earned: true, earnedOn: day(9), progress: { have: 5, need: 5 } });
    expect(badge(results, 'sites-10')).toMatchObject({ earned: false, progress: { have: 6, need: 10 }, hint: '4 more dive sites' });
  });

  it('count sightings of species the catalog lacks, since the diver was there all the same', () => {
    const log = { sightings: [seen('s-1', day(1), { speciesId: 'unlisted', customName: 'Odd one' }), seen('s-2', day(2), { speciesId: 'made-up' })] };
    expect(badge(evaluate(sites, log), 'sites-5').progress).toEqual({ have: 2, need: 5 });
  });

  it('leave out a site the lookup does not know', () => {
    const log = { dives: [dived('s-1', day(1)), dived('gone', day(2), 2), dived('s-2', day(3), 3)] };
    expect(badge(evaluate(sites, log), 'sites-5').progress).toEqual({ have: 2, need: 5 });
  });

  it('count a hidden copy of a site at the site it stands for', () => {
    // OpenStreetMap's Cod Hole is hidden as a copy of the seed, and its Yolanda Reef was merged into
    // Shark & Yolanda Reef; a sighting logged at either before still names it.
    expect(SITE_ALIASES.get('osm-node-270802348')).toBe('cod-hole');
    expect(SITE_ALIASES.get('osm-node-278086478')).toBe('shark-yolanda');
    const log = {
      dives: [dived('cod-hole', day(1)), dived('osm-node-270802348', day(2), 2), dived('shark-yolanda', day(3), 3)],
      sightings: [seen('osm-node-278086478', day(4)), seen('osm-node-271182010', day(5))],
    };
    expect(badge(evaluate(SITES_BY_ID, log), 'sites-5').progress).toEqual({ have: 2, need: 5 });
  });
});

describe('countries', () => {
  it('count each country once however it is written, earned on the day the nth was first visited', () => {
    const sites = lookup(
      site('th-1', { country: 'Thailand' }), site('th-2', { country: ' thailand ' }), site('eg-1', { country: 'Egypt' }),
      site('au-1', { country: 'Australia' }), site('none', { country: '' }),
    );
    const log = {
      dives: [dived('au-1', day(20)), dived('th-2', day(3)), dived('th-1', day(1), 2), dived('eg-1', day(10), 3), dived('none', day(12), 4)],
    };
    const results = evaluate(sites, log);
    // Thailand day 1, Egypt day 10, Australia day 20; a site with no country has none to count.
    expect(badge(results, 'countries-3')).toMatchObject({ earned: true, earnedOn: day(20), progress: { have: 3, need: 3 } });
    expect(badge(results, 'countries-5')).toMatchObject({ earned: false, progress: { have: 3, need: 5 }, hint: '2 more countries' });
    expect(badge(evaluate(sites, { dives: [log.dives[1], log.dives[2]] }), 'countries-3').progress).toEqual({ have: 1, need: 3 });
  });
});

describe('region badges', () => {
  it('follow a site\'s regionId up its parents, so any site under the Great Barrier Reef counts', () => {
    const sites = lookup(
      site('reef-root', { regionId: 'great-barrier-reef', country: 'Australia' }),
      site('reef-cairns', { regionId: 'gbr-cairns-cooktown', country: 'Australia' }),
      site('osprey', { regionId: 'coral-sea', country: 'Australia', region: 'Coral Sea' }),
    );
    const earned = (ids: string[]) => badge(evaluate(sites, { dives: ids.map((id, i) => dived(id, day(i + 1), i + 1)) }), 'region-great-barrier-reef');
    expect(earned(['reef-cairns'])).toMatchObject({ earned: true, earnedOn: day(1) });
    expect(earned(['reef-root'])).toMatchObject({ earned: true });
    // The Coral Sea is its own region, not part of the Reef.
    expect(earned(['osprey'])).toMatchObject({ earned: false, hint: 'Dive any Great Barrier Reef site.' });
    expect(earned(['osprey', 'reef-cairns']).earnedOn).toBe(day(2));
  });

  it('fall back to country and region text for a site with no regionId', () => {
    const sites = lookup(
      // Shaped like the seed sites in src/data/sites.ts, which have no regionId.
      site('red-1', { region: 'Red Sea', country: 'Egypt' }),
      site('red-2', { region: 'Ras Mohammed', country: 'Egypt' }),
      site('red-3', { region: 'Marsa Alam', country: 'Egypt' }),
      site('red-4', { region: 'Gulf of Aqaba', country: 'Jordan' }),
      site('red-5', { region: 'red sea', country: 'Saudi Arabia' }),
      site('med-1', { region: 'Mediterranean Sea', country: 'Egypt' }),
      site('tha-1', { region: 'Andaman Sea', country: 'Thailand' }),
      site('not-red', { region: 'Red Sea', country: 'Thailand' }),
      site('gbr-1', { region: 'Great Barrier Reef', country: 'Australia' }),
      site('aus-1', { region: 'Byron Bay', country: 'Australia' }),
    );
    const inRedSea = (id: string) => badge(evaluate(sites, { dives: [dived(id, day(1))] }), 'region-red-sea').earned;
    const inReef = (id: string) => badge(evaluate(sites, { dives: [dived(id, day(1))] }), 'region-great-barrier-reef').earned;
    for (const id of ['red-1', 'red-2', 'red-3', 'red-4', 'red-5']) expect(inRedSea(id)).toBe(true);
    for (const id of ['med-1', 'tha-1', 'not-red', 'gbr-1', 'aus-1']) expect(inRedSea(id)).toBe(false);
    expect(inReef('gbr-1')).toBe(true);
    for (const id of ['aus-1', 'red-1', 'tha-1']) expect(inReef(id)).toBe(false);
  });

  it('work with the ids an importer picks, by id or by the name of any region above the site', () => {
    const regions = new Map<string, Region>([
      ...REGIONS_BY_ID,
      ['red-sea-egypt', { id: 'red-sea-egypt', name: 'Egypt', parentId: 'red-sea', source: 'test' }],
      ['gulf-of-aqaba', { id: 'gulf-of-aqaba', name: 'Gulf of Aqaba', parentId: 'rs-top', source: 'test' }],
      ['rs-top', { id: 'rs-top', name: 'The Red Sea', source: 'test' }],
    ]);
    const sites = lookup(
      // 'red-sea' is not in the map at all: the id alone is enough.
      site('by-id', { regionId: 'red-sea-egypt', country: 'Egypt', region: '' }),
      site('by-name', { regionId: 'gulf-of-aqaba', country: 'Jordan', region: '' }),
      site('elsewhere', { regionId: 'coral-sea', country: 'Australia', region: '' }),
    );
    const earned = (id: string) => badge(evaluate(sites, { regions, dives: [dived(id, day(1))] }), 'region-red-sea').earned;
    expect(earned('by-id')).toBe(true);
    expect(earned('by-name')).toBe(true);
    expect(earned('elsewhere')).toBe(false);
  });

  it('are earned on the day of the first visit to any site in the region', () => {
    const sites = lookup(...many('red', 2, { region: 'Red Sea', country: 'Egypt' }), site('home'));
    const results = evaluate(sites, { sightings: [seen('red-2', day(9))], dives: [dived('home', day(1)), dived('red-1', day(12), 2)] });
    expect(badge(results, 'region-red-sea').earnedOn).toBe(day(9));
  });

  it('are keyed in a small table, one entry per badge region', () => {
    expect(Object.keys(REGION_BADGES).sort()).toEqual(['great-barrier-reef', 'red-sea']);
    expect(REGIONS_BY_ID.has('great-barrier-reef')).toBe(true);
  });
});

describe('the Great Barrier Reef and Red Sea explorer ladders', () => {
  // 16 reef sites and 6 Red Sea sites, as an import might bring them: new ids, with a regionId or without.
  const sites = lookup(
    ...many('reef', 16, { regionId: 'gbr-far-northern', country: 'Australia', region: 'Far Northern' }),
    ...many('rs', 6, { region: 'Red Sea', country: 'Egypt' }),
  );
  // One new site a day, the reef sites first; the log is given newest first.
  const visits = [...many('reef', 16, {}), ...many('rs', 6, {})].map((s, i) => dived(s.id, day(i + 1), i + 1));
  const results = evaluate(sites, { dives: [...visits].reverse() });

  it('count distinct sites in each region and earn each rung on the day it was reached', () => {
    expect(badge(results, 'gbr-sites-5')).toMatchObject({ earned: true, earnedOn: day(5) });
    expect(badge(results, 'gbr-sites-15')).toMatchObject({ earned: true, earnedOn: day(15), progress: { have: 15, need: 15 } });
    expect(badge(results, 'gbr-sites-40')).toMatchObject({ earned: false, progress: { have: 16, need: 40 }, hint: '24 more Great Barrier Reef sites' });
    expect(badge(results, 'red-sea-sites-5')).toMatchObject({ earned: true, earnedOn: day(21) });
    expect(badge(results, 'red-sea-sites-15')).toMatchObject({ earned: false, progress: { have: 6, need: 15 }, hint: '9 more Red Sea sites' });
  });

  it('do not mix the two regions up, and the sites ladder counts them all', () => {
    expect(badge(results, 'region-great-barrier-reef').earnedOn).toBe(day(1));
    expect(badge(results, 'region-red-sea').earnedOn).toBe(day(17));
    expect(badge(results, 'sites-10').earned).toBe(true);
    expect(badge(results, 'sites-25').progress).toEqual({ have: 22, need: 25 });
  });
});

describe('the seed sites', () => {
  const seed = new Map(SITES.map((s) => [s.id, s]));

  it('earn the Red Sea and Great Barrier Reef badges through region and country as they are', () => {
    // The Red Sea sites carry no regionId yet; the Reef's carry one.
    for (const id of ['ss-thistlegorm', 'shark-yolanda', 'blue-hole-dahab', 'elphinstone', 'daedalus', 'brothers-islands']) {
      expect(seed.has(id)).toBe(true);
      expect(badge(evaluate(seed, { dives: [dived(id, day(1))] }), 'region-red-sea').earned).toBe(true);
    }
    for (const id of ['yongala', 'cod-hole']) expect(badge(evaluate(seed, { dives: [dived(id, day(1))] }), 'region-great-barrier-reef').earned).toBe(true);
    for (const id of ['north-horn', 'navy-pier', 'richelieu-rock']) {
      const results = evaluate(seed, { dives: [dived(id, day(1))] });
      expect(badge(results, 'region-great-barrier-reef').earned).toBe(false);
      expect(badge(results, 'region-red-sea').earned).toBe(false);
    }
  });
});
