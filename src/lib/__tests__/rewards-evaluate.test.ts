import { describe, expect, it, jest } from '@jest/globals';
import { CATALOG_BY_ID } from '@/lib/catalog';
import { evaluateBadges, evaluateCollections, evaluateIslands, evaluatePassport, evaluateRewards, type RewardsInput } from '@/lib/rewards';
import type { Dive, DiveSite, Sighting } from '@/lib/types';

// These tests pin the rewards engine's own rules against the catalogue's hand-assigned tiers, so they must
// not move when src/data/encounter-rarity.json is regenerated: the generated tiers are switched off here.
jest.mock('@/data/encounter-rarity.json', () => ({ generatedAt: null, species: {} }));

// All the sightings, dives and sites below are hand-written test data, not anyone's log.
const seen = (speciesId: string, siteId: string, sightedOn: string): Sighting => ({
  id: `${speciesId}@${sightedOn}`, userId: 'me', username: 'me', speciesId, siteId, sightedOn,
  isDemo: false, synced: true, createdAt: `${sightedOn}T10:00:00.000Z`,
});
const dived = (number: number, siteId: string, divedOn: string): Dive => ({
  id: `dive-${number}`, userId: 'me', number, siteId, divedOn, synced: true, createdAt: `${divedOn}T09:00:00.000Z`, kinds: number === 2 ? ['night'] : undefined,
});
const site = (id: string, over: Partial<DiveSite>): DiveSite => ({
  id, name: id, lat: 0, lng: 0, region: 'Test Sea', country: 'Testland', blurb: '', notableSpecies: [], source: 'user', ...over,
});
const sites = new Map([
  ['reef', site('reef', { regionId: 'gbr-cairns-cooktown', country: 'Australia' })],
  ['wreck', site('wreck', { country: 'Egypt', region: 'Red Sea', diveTypes: ['wreck'] })],
]);
const logbook: RewardsInput = {
  sightings: [seen('grey-reef-shark', 'reef', '2026-03-02'), seen('lingcod', 'wreck', '2026-04-10'), seen('green-turtle', 'reef', '2026-03-02')],
  dives: [dived(2, 'wreck', '2026-04-10'), dived(1, 'reef', '2026-03-02')],
  sites, catalog: CATALOG_BY_ID,
};

describe('evaluateRewards', () => {
  const rewards = evaluateRewards(logbook);

  it('returns the badges, collections, passport and islands in one call, the same as each on its own', () => {
    expect(Object.keys(rewards).sort()).toEqual(['badges', 'collections', 'islands', 'passport']);
    expect(rewards.badges).toEqual(evaluateBadges(logbook));
    expect(rewards.collections).toEqual(evaluateCollections(logbook));
    expect(rewards.passport).toEqual(evaluatePassport(logbook));
    expect(rewards.islands).toEqual(evaluateIslands(logbook));
  });

  it('puts a small logbook together', () => {
    // The green turtle lives in the Mangroves & Seagrass, so that island rises too.
    const earned = rewards.badges.filter((b) => b.earned).map((b) => [b.id, b.earnedOn]);
    expect(earned).toEqual([
      ['first-sighting', '2026-03-02'],
      ['first-shark', '2026-03-02'],
      ['first-turtle', '2026-03-02'],
      ['first-night-dive', '2026-04-10'],
      ['first-wreck-dive', '2026-04-10'],
      ['dives-1', '2026-03-02'],
      ['region-great-barrier-reef', '2026-03-02'],
      ['region-red-sea', '2026-04-10'],
    ]);
    expect(rewards.passport.map((g) => g.id)).toEqual(['region:red-sea', 'region:great-barrier-reef']);
    expect(rewards.islands.filter((i) => i.unlocked).map((i) => [i.id, i.unlockedOn])).toEqual([['coral-reef', undefined], ['kelp-forest', '2026-04-10'], ['mangroves', '2026-03-02']]);
  });

  it('does not depend on the order of its input, and leaves its input as it was', () => {
    const frozen: RewardsInput = {
      ...logbook,
      sightings: Object.freeze([...logbook.sightings].reverse().map((s) => Object.freeze({ ...s }))),
      dives: Object.freeze([...logbook.dives].reverse().map((d) => Object.freeze({ ...d }))),
    };
    expect(evaluateRewards(frozen)).toEqual(rewards);
    expect(logbook.sightings[0].speciesId).toBe('grey-reef-shark');
    expect(logbook.dives[0].number).toBe(2);
  });

  it('is empty-handed for an empty logbook, except for Home\'s island', () => {
    const empty = evaluateRewards({ sightings: [], dives: [], sites, catalog: CATALOG_BY_ID });
    expect(empty.badges.some((b) => b.earned)).toBe(false);
    expect(empty.collections.every((c) => c.found === 0 && !c.completed)).toBe(true);
    expect(empty.passport).toEqual([]);
    expect(empty.islands.filter((i) => i.unlocked).map((i) => i.id)).toEqual(['coral-reef']);
  });
});
