import { describe, expect, it } from '@jest/globals';

import { SPECIES } from '@/data/species';
import {
  MIN_SITES_FOR_OBSERVED_RARITY,
  observedRarity,
  observedTiers,
  RARITY_THRESHOLDS,
  tierForShare,
} from '@/lib/external-sightings/observed-rarity';
import type { SiteSightings, SourceStatus } from '@/lib/external-sightings/types';
import type { Rarity } from '@/lib/types';

// Hand-made summaries, not real records: each site simply lists which species it "recorded".

const source = (id: 'inaturalist' | 'obis', ok: boolean): SourceStatus => ({
  id,
  ok,
  fetchedAt: '2026-10-01T00:00:00.000Z',
  attribution: id,
  licenceNote: id,
  url: 'https://example.test',
});

function site(siteId: string, speciesIds: string[], extra: Partial<SiteSightings> = {}): SiteSightings {
  return {
    siteId,
    radiusKm: 3,
    fetchedAt: '2026-10-01T00:00:00.000Z',
    sources: [source('inaturalist', true), source('obis', true)],
    species: speciesIds.map((speciesId) => ({ speciesId, inaturalist: { observations: 1 } })),
    recent: [],
    unmatched: { inaturalist: 0, obis: 0 },
    ...extra,
  };
}

/** 100 sites; the first `count` of them record `speciesId`. */
function hundredSites(plan: Record<string, number>): SiteSightings[] {
  return Array.from({ length: 100 }, (_, i) =>
    site(`site-${i}`, Object.entries(plan).filter(([, count]) => i < count).map(([id]) => id)));
}

describe('tiers from the share of sites', () => {
  it('uses the documented cut-offs', () => {
    expect(RARITY_THRESHOLDS.map((t) => [t.tier, t.minShare])).toEqual([
      ['common', 0.25], ['uncommon', 0.1], ['rare', 0.04], ['epic', 0.015], ['legendary', 0],
    ]);
    const cases: [number, Rarity][] = [
      [1, 'common'], [0.25, 'common'], [0.2499, 'uncommon'], [0.1, 'uncommon'], [0.0999, 'rare'], [0.04, 'rare'],
      [0.0399, 'epic'], [0.015, 'epic'], [0.0149, 'legendary'], [0.0001, 'legendary'],
    ];
    for (const [share, tier] of cases) expect({ share, tier: tierForShare(share) }).toEqual({ share, tier });
  });

  it('puts each species in the tier its share of sites earns', () => {
    const summaries = hundredSites({ 'green-turtle': 60, 'reef-manta': 25, 'whale-shark': 10, 'bull-shark': 4, 'tiger-shark': 2, dugong: 1 });
    const result = observedRarity(summaries, SPECIES);
    expect(result.get('green-turtle')).toEqual({ tier: 'common', share: 0.6, sites: 60 });
    expect(result.get('reef-manta')).toEqual({ tier: 'common', share: 0.25, sites: 25 });
    expect(result.get('whale-shark')?.tier).toBe('uncommon');
    expect(result.get('bull-shark')?.tier).toBe('rare');
    expect(result.get('tiger-shark')?.tier).toBe('epic');
    expect(result.get('dugong')).toEqual({ tier: 'legendary', share: 0.01, sites: 1 });
  });

  it('counts a species once per site, however many records it has', () => {
    const summaries = [
      ...hundredSites({}).slice(0, 99),
      site('busy', ['green-turtle', 'green-turtle'], { species: [
        { speciesId: 'green-turtle', inaturalist: { observations: 900 }, obis: { records: 5000 } },
        { speciesId: 'green-turtle', obis: { records: 1 } },
      ] }),
    ];
    expect(observedRarity(summaries, SPECIES).get('green-turtle')?.sites).toBe(1);
  });

  it('leaves out species that no site recorded, so their catalogue tier stands', () => {
    const result = observedRarity(hundredSites({ 'green-turtle': 50 }), SPECIES);
    expect([...result.keys()]).toEqual(['green-turtle']);
  });

  it('only reports catalogue species', () => {
    const result = observedRarity(hundredSites({ 'green-turtle': 50, 'not-in-catalogue': 50 }), SPECIES);
    expect(result.has('not-in-catalogue')).toBe(false);
  });
});

describe('when there is not enough data', () => {
  it('gives an empty map below the minimum number of sites', () => {
    expect(MIN_SITES_FOR_OBSERVED_RARITY).toBe(10);
    const nine = Array.from({ length: 9 }, (_, i) => site(`s${i}`, ['green-turtle']));
    expect(observedRarity(nine, SPECIES).size).toBe(0);
    expect(observedTiers(nine, SPECIES).size).toBe(0);
    expect(observedRarity([], SPECIES).size).toBe(0);
    const ten = Array.from({ length: 10 }, (_, i) => site(`s${i}`, ['green-turtle']));
    expect(observedRarity(ten, SPECIES).get('green-turtle')).toEqual({ tier: 'common', share: 1, sites: 10 });
  });

  it('does not count a site where every source failed', () => {
    const failed = (id: string) => site(id, [], { sources: [source('inaturalist', false), source('obis', false)] });
    const summaries = [
      ...Array.from({ length: 8 }, (_, i) => site(`ok-${i}`, ['green-turtle'])),
      failed('f1'), failed('f2'), failed('f3'),
    ];
    expect(observedRarity(summaries, SPECIES).size).toBe(0); // only 8 count
    const more = [...summaries, site('ok-8', []), site('ok-9', [])];
    expect(observedRarity(more, SPECIES).get('green-turtle')).toEqual({ tier: 'common', share: 0.8, sites: 8 });
  });

  it('counts a site where one source failed and the other answered', () => {
    const half = (id: string) => site(id, ['green-turtle'], { sources: [source('inaturalist', true), source('obis', false)] });
    const summaries = Array.from({ length: 10 }, (_, i) => half(`h${i}`));
    expect(observedRarity(summaries, SPECIES).get('green-turtle')?.sites).toBe(10);
  });

  it('lets the caller change the minimum', () => {
    const three = [site('a', ['green-turtle']), site('b', []), site('c', [])];
    expect(observedRarity(three, SPECIES).size).toBe(0);
    expect(observedRarity(three, SPECIES, { minSites: 3 }).get('green-turtle')?.share).toBeCloseTo(1 / 3);
  });
});

describe('scoping to some sites', () => {
  const summaries = [
    ...Array.from({ length: 20 }, (_, i) => site(`reef-${i}`, i < 15 ? ['green-turtle'] : [])),
    ...Array.from({ length: 20 }, (_, i) => site(`kelp-${i}`, i < 1 ? ['green-turtle', 'garibaldi'] : ['garibaldi'])),
  ];

  it('judges each region against its own sites', () => {
    const reef = new Set(Array.from({ length: 20 }, (_, i) => `reef-${i}`));
    const kelp = Array.from({ length: 20 }, (_, i) => `kelp-${i}`);
    expect(observedRarity(summaries, SPECIES, { siteIds: reef }).get('green-turtle')).toEqual({ tier: 'common', share: 0.75, sites: 15 });
    expect(observedRarity(summaries, SPECIES, { siteIds: kelp }).get('green-turtle')).toEqual({ tier: 'rare', share: 0.05, sites: 1 });
    expect(observedRarity(summaries, SPECIES, { siteIds: reef }).has('garibaldi')).toBe(false);
    // All 40 sites together.
    expect(observedRarity(summaries, SPECIES).get('green-turtle')?.sites).toBe(16);
  });

  it('gives nothing when the scope holds too few summarised sites', () => {
    expect(observedRarity(summaries, SPECIES, { siteIds: ['reef-0', 'reef-1', 'unknown-site'] }).size).toBe(0);
    expect(observedRarity(summaries, SPECIES, { siteIds: [] }).size).toBe(0);
  });
});

describe('repeated sites', () => {
  it('uses the newest summary of a site, once', () => {
    const old = site('a', ['green-turtle'], { fetchedAt: '2026-01-01T00:00:00.000Z' });
    const fresh = site('a', ['reef-manta'], { fetchedAt: '2026-10-01T00:00:00.000Z' });
    const others = Array.from({ length: 9 }, (_, i) => site(`o${i}`, []));
    const result = observedRarity([old, fresh, ...others], SPECIES);
    expect(result.has('green-turtle')).toBe(false);
    expect(result.get('reef-manta')).toEqual({ tier: 'uncommon', share: 0.1, sites: 1 });
  });
});

describe('observedTiers', () => {
  it('returns species id to tier, in the shape the rewards engine takes', () => {
    const tiers: ReadonlyMap<string, Rarity> = observedTiers(hundredSites({ 'green-turtle': 60, dugong: 1 }), SPECIES);
    expect(tiers.get('green-turtle')).toBe('common');
    expect(tiers.get('dugong')).toBe('legendary');
    expect(tiers.size).toBe(2);
  });

  it('is empty with too little data, so every catalogue tier stands', () => {
    expect(observedTiers([site('a', ['green-turtle'])], SPECIES).size).toBe(0);
  });

  it('accepts a scope like observedRarity', () => {
    const tiers = observedTiers(hundredSites({ 'green-turtle': 60 }), SPECIES, { siteIds: Array.from({ length: 20 }, (_, i) => `site-${i}`) });
    expect(tiers.get('green-turtle')).toBe('common');
  });
});
