import { describe, expect, it, jest } from '@jest/globals';
import { residentsOf } from '@/lib/archipelago';
import { CATALOG_BY_ID } from '@/lib/catalog';
import { BADGES, earnedIds, effectiveRarity, evaluateBadges, newlyEarned, type BadgeResult, type RewardsInput } from '@/lib/rewards';
import type { Dive, DiveSite, Rarity, Sighting } from '@/lib/types';

// These tests pin the rewards engine's own rules against the catalogue's hand-assigned tiers, so they must
// not move when src/data/encounter-rarity.json is regenerated: the generated tiers are switched off here.
jest.mock('@/data/encounter-rarity.json', () => ({ generatedAt: null, species: {} }));

// All the sightings, dives and sites below are hand-written test data, not anyone's log.
const seen = (speciesId: string, sightedOn: string, over: Partial<Sighting> = {}): Sighting => ({
  id: `${speciesId}@${sightedOn}`, userId: 'me', username: 'me', speciesId, siteId: 'site-a', sightedOn,
  isDemo: false, synced: true, createdAt: `${sightedOn}T10:00:00.000Z`, ...over,
});
const dived = (number: number, divedOn: string, over: Partial<Dive> = {}): Dive => ({
  id: `dive-${number}`, userId: 'me', number, siteId: 'site-a', divedOn, synced: true, createdAt: `${divedOn}T09:00:00.000Z`, ...over,
});
const site = (id: string, over: Partial<DiveSite> = {}): DiveSite => ({
  id, name: id, lat: 0, lng: 0, region: 'Test Sea', country: 'Testland', blurb: '', notableSpecies: [], source: 'user', ...over,
});
const SITES = new Map([['site-a', site('site-a')], ['wreck-site', site('wreck-site', { diveTypes: ['wreck'] })]]);
const evaluate = (over: Partial<RewardsInput>) => evaluateBadges({ sightings: [], dives: [], sites: SITES, catalog: CATALOG_BY_ID, ...over });
const badge = (results: BadgeResult[], id: string) => results.find((b) => b.id === id)!;
const IDS = [...CATALOG_BY_ID.keys()];
const day = (n: number) => `2026-02-${String(n).padStart(2, '0')}`;

describe('the badge list', () => {
  it('has the badges the diver was promised, each once', () => {
    const ids = BADGES.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    const wanted = [
      'first-sighting', 'first-shark', 'first-ray', 'first-turtle', 'first-mammal', 'first-rare', 'first-epic', 'first-legendary', 'first-night-dive', 'first-wreck-dive',
      ...[10, 25, 50, 100].map((n) => `species-${n}`),
      ...[1, 10, 25, 50, 100, 250, 500].map((n) => `dives-${n}`),
      ...[5, 10, 25, 50].map((n) => `sites-${n}`),
      ...[3, 5].map((n) => `countries-${n}`),
      'region-great-barrier-reef', 'region-red-sea',
      ...[5, 15, 40].flatMap((n) => [`gbr-sites-${n}`, `red-sea-sites-${n}`]),
    ];
    for (const id of wanted) expect(ids).toContain(id);
    expect(BADGES.some((b) => b.kind === 'collection')).toBe(true);
  });

  it('gives every badge a title, a description, an emblem and a kind, and orders ladders from the easiest rung', () => {
    for (const b of BADGES) {
      expect(b.title.length).toBeGreaterThan(0);
      expect(b.description.length).toBeGreaterThan(0);
      expect(['first', 'collection', 'milestone', 'place']).toContain(b.kind);
      expect(b.emblem.length).toBeGreaterThan(0);
      if (b.tier) expect(['bronze', 'silver', 'gold']).toContain(b.tier);
    }
    const rungs = (ladder: string) => BADGES.filter((b) => b.ladder === ladder).map((b) => Number(b.id.split('-').pop()));
    for (const ladder of ['species', 'dives', 'sites', 'countries', 'gbr-sites', 'red-sea-sites']) {
      const needs = rungs(ladder);
      expect(needs.length).toBeGreaterThan(1);
      expect(needs).toEqual([...needs].sort((a, b) => a - b));
    }
  });

  it('reports every badge in the same order, unearned with a hint and an empty bar for a diver with no log', () => {
    const results = evaluate({});
    expect(results.map((b) => b.id)).toEqual(BADGES.map((b) => b.id));
    for (const b of results) {
      expect(b.earned).toBe(false);
      expect(b.earnedOn).toBeUndefined();
      expect(b.progress.have).toBe(0);
      expect(b.progress.need).toBeGreaterThan(0);
      expect(b.hint).toBeTruthy();
    }
  });
});

describe('firsts', () => {
  it('are earned on the day each first happened, whatever order the log is in', () => {
    const sightings = [
      seen('green-turtle', '2026-04-01'),
      seen('clownfish', '2026-03-10'),
      seen('grey-reef-shark', '2026-02-01'),
      seen('whitetip-reef-shark', '2026-06-01'),
      seen('bottlenose-dolphin', '2026-05-05'),
      seen('reef-manta', '2026-01-15'),
    ];
    const results = evaluate({ sightings });
    expect(badge(results, 'first-sighting').earnedOn).toBe('2026-01-15');
    expect(badge(results, 'first-ray').earnedOn).toBe('2026-01-15');
    expect(badge(results, 'first-shark').earnedOn).toBe('2026-02-01');
    expect(badge(results, 'first-turtle').earnedOn).toBe('2026-04-01');
    expect(badge(results, 'first-mammal').earnedOn).toBe('2026-05-05');
    expect(badge(results, 'first-ray')).toMatchObject({ earned: true, progress: { have: 1, need: 1 } });
    expect(badge(results, 'first-ray').hint).toBeUndefined();
  });

  it('are not earned until they happen, and say what to do', () => {
    const results = evaluate({ sightings: [seen('clownfish', '2026-03-10')] });
    expect(badge(results, 'first-sighting').earned).toBe(true);
    expect(badge(results, 'first-shark')).toMatchObject({ earned: false, progress: { have: 0, need: 1 }, hint: 'Log your first shark.' });
    expect(badge(results, 'first-mammal').hint).toBe('Log your first marine mammal.');
    expect(badge(results, 'first-legendary').hint).toBe('Find a legendary animal.');
    expect(badge(results, 'first-epic').hint).toBe('Find an epic animal or better.');
  });

  it('count the first night dive and the first wreck dive, by dive kind or by the site', () => {
    const dives = [
      dived(3, '2026-06-10', { siteId: 'wreck-site', kinds: ['reef'] }),
      dived(1, '2026-04-02', { kinds: ['wreck'] }),
      dived(2, '2026-05-03', { kinds: ['reef', 'night'] }),
    ];
    const results = evaluate({ dives });
    expect(badge(results, 'first-night-dive').earnedOn).toBe('2026-05-03');
    expect(badge(results, 'first-wreck-dive').earnedOn).toBe('2026-04-02');
    // Without the dive marked 'wreck', the dive at a wreck site is the first.
    expect(badge(evaluate({ dives: [dives[0]] }), 'first-wreck-dive').earnedOn).toBe('2026-06-10');
    expect(badge(evaluate({ dives: [dived(1, '2026-04-02', { kinds: ['reef'] })] }), 'first-wreck-dive')).toMatchObject({ earned: false, hint: 'Log a wreck dive.' });
    expect(badge(evaluate({}), 'first-night-dive').hint).toBe('Log a night dive.');
  });
});

describe('effective rarity', () => {
  it('is the observed tier when there is one, else the catalog\'s', () => {
    const whaleShark = CATALOG_BY_ID.get('whale-shark')!;
    expect(effectiveRarity(whaleShark)).toBe('legendary');
    expect(effectiveRarity(whaleShark, new Map())).toBe('legendary');
    expect(effectiveRarity(whaleShark, new Map<string, Rarity>([['whale-shark', 'rare']]))).toBe('rare');
    expect(effectiveRarity(whaleShark, new Map<string, Rarity>([['clownfish', 'common']]))).toBe('legendary');
    // A tier that is not one of the five is not trusted.
    expect(effectiveRarity(whaleShark, new Map([['whale-shark', 'mythic']]) as unknown as Map<string, Rarity>)).toBe('legendary');
  });

  it('decides the rare, epic and legendary firsts from the catalog when nothing is observed', () => {
    const results = evaluate({ sightings: [seen('clownfish', '2026-01-01'), seen('napoleon-wrasse', '2026-02-01'), seen('mola-mola', '2026-03-01'), seen('whale-shark', '2026-04-01')] });
    expect(badge(results, 'first-rare').earnedOn).toBe('2026-02-01');
    expect(badge(results, 'first-epic').earnedOn).toBe('2026-03-01');
    expect(badge(results, 'first-legendary').earnedOn).toBe('2026-04-01');
  });

  it('lets observed records override the catalog both ways', () => {
    const sightings = [seen('clownfish', '2026-01-01'), seen('whale-shark', '2026-04-01'), seen('mola-mola', '2026-06-01')];
    // Real records say the clownfish is a rare sight and the whale shark an ordinary one here.
    const observed = new Map<string, Rarity>([['clownfish', 'epic'], ['whale-shark', 'uncommon']]);
    const results = evaluate({ sightings, observed });
    expect(badge(results, 'first-rare').earnedOn).toBe('2026-01-01');
    expect(badge(results, 'first-epic').earnedOn).toBe('2026-01-01');
    // The whale shark no longer counts as legendary, and nothing else here is.
    expect(badge(results, 'first-legendary')).toMatchObject({ earned: false, progress: { have: 0, need: 1 } });
    // And with no observed tiers, the catalog's say so again.
    expect(badge(evaluate({ sightings }), 'first-legendary').earnedOn).toBe('2026-04-01');
    expect(badge(evaluate({ sightings }), 'first-epic').earnedOn).toBe('2026-04-01');
  });
});

describe('species milestones', () => {
  // Twelve species, one sighting each on days 1 to 12, and the twelfth was also seen on day 2.
  const sightings = [...IDS.slice(0, 12).map((id, i) => seen(id, day(i + 1))), seen(IDS[11], day(2)), seen(IDS[0], day(20))];

  it('are earned on the day the nth different species was first logged, whatever order the log is in', () => {
    for (const log of [sightings, [...sightings].reverse()]) {
      const results = evaluate({ sightings: log });
      // Days 1, 2, 2, 3, 4, 5, 6, 7, 8, 9: the tenth species arrived on day 9.
      expect(badge(results, 'species-10')).toMatchObject({ earned: true, earnedOn: day(9), progress: { have: 10, need: 10 } });
    }
  });

  it('show progress up the ladder, with a hint for the next step', () => {
    const results = evaluate({ sightings });
    expect(badge(results, 'species-25')).toMatchObject({ earned: false, progress: { have: 12, need: 25 }, hint: '13 more species' });
    expect(badge(results, 'species-100')).toMatchObject({ earned: false, progress: { have: 12, need: 100 } });
    expect(badge(results, 'species-25').earnedOn).toBeUndefined();
  });

  it('count each species once', () => {
    const results = evaluate({ sightings: [...Array(30)].map((_, i) => seen('clownfish', day(i % 28 + 1), { id: `c-${i}` })) });
    expect(badge(results, 'species-10').progress).toEqual({ have: 1, need: 10 });
  });
});

describe('dive-number milestones', () => {
  it('are earned on the day of the first dive whose number reached them', () => {
    const dives = [dived(26, '2026-03-01'), dived(3, '2026-01-05'), dived(12, '2026-02-01')];
    const results = evaluate({ dives });
    expect(badge(results, 'dives-1')).toMatchObject({ earned: true, earnedOn: '2026-01-05' });
    expect(badge(results, 'dives-10')).toMatchObject({ earned: true, earnedOn: '2026-02-01', progress: { have: 10, need: 10 } });
    expect(badge(results, 'dives-25').earnedOn).toBe('2026-03-01');
    expect(badge(results, 'dives-50')).toMatchObject({ earned: false, progress: { have: 26, need: 50 }, hint: '24 more dives' });
  });

  it('start from the diver\'s lifetime number, so a first logged dive can already be the 87th', () => {
    const results = evaluate({ dives: [dived(87, '2026-02-02')] });
    for (const n of [1, 10, 25, 50]) expect(badge(results, `dives-${n}`)).toMatchObject({ earned: true, earnedOn: '2026-02-02' });
    expect(badge(results, 'dives-100')).toMatchObject({ earned: false, progress: { have: 87, need: 100 }, hint: '13 more dives' });
    expect(badge(evaluate({}), 'dives-1').hint).toBe('Log your first dive.');
  });
});

describe('species the catalog does not have', () => {
  it('are ignored for species rewards, though a sighting is still a sighting', () => {
    const sightings = [
      seen('unlisted', '2026-01-01', { customName: 'Strange striped fish' }),
      seen('made-up-species', '2026-01-02'),
      ...IDS.slice(0, 9).map((id, i) => seen(id, day(i + 1))),
    ];
    const results = evaluate({ sightings });
    expect(badge(results, 'species-10').progress).toEqual({ have: 9, need: 10 });
    expect(badge(results, 'species-10').hint).toBe('1 more species');
    // The first sighting is the strange fish; the first shark is the first catalog shark.
    expect(badge(results, 'first-sighting').earnedOn).toBe('2026-01-01');
    expect(badge(evaluate({ sightings: sightings.slice(0, 2) }), 'first-shark').earned).toBe(false);
    expect(badge(evaluate({ sightings: sightings.slice(0, 2) }), 'species-10').progress.have).toBe(0);
  });
});

describe('newlyEarned', () => {
  const sightings = [seen('grey-reef-shark', '2026-02-01'), seen('spotted-eagle-ray', '2026-01-15')];
  const now = evaluate({ sightings });

  it('returns the badges earned now that were not earned before, in the order they are listed', () => {
    expect(earnedIds(now)).toEqual(['first-sighting', 'first-shark', 'first-ray']);
    expect(newlyEarned([], now).map((b) => b.id)).toEqual(['first-sighting', 'first-shark', 'first-ray']);
    expect(newlyEarned(['first-sighting', 'first-ray'], now).map((b) => b.id)).toEqual(['first-shark']);
    expect(newlyEarned(['first-sighting', 'first-shark', 'first-ray'], now)).toEqual([]);
  });

  it('shrugs off the id of a badge that has been retired, as an older install may have stored (the "Wreck regulars")', () => {
    const retired = 'collection-set-wreck-regulars';
    expect(BADGES.map((b) => b.id)).not.toContain(retired);
    // It never matches anything, so what is new is exactly what it was without it.
    expect(newlyEarned([retired], now).map((b) => b.id)).toEqual(newlyEarned([], now).map((b) => b.id));
    expect(newlyEarned([retired, 'first-sighting'], now).map((b) => b.id)).toEqual(['first-shark', 'first-ray']);
    // And it is never earned again, however the Shipwreck's animals are logged.
    const wreck = evaluate({ sightings: residentsOf('shipwreck').map((id, i) => seen(id, day(i + 1))) });
    expect(earnedIds(wreck)).not.toContain(retired);
    expect(newlyEarned([retired], wreck).filter((b) => b.kind === 'collection').map((b) => b.id)).toEqual(['collection-area-shipwreck']);
  });

  it('ignores remembered ids that are no longer earned or no longer exist, and never returns unearned badges', () => {
    expect(newlyEarned(['retired-badge', 'first-turtle'], now).map((b) => b.id)).toEqual(['first-sighting', 'first-shark', 'first-ray']);
    const later = evaluate({ sightings: [...sightings, seen('green-turtle', '2026-03-01')] });
    expect(newlyEarned(earnedIds(now), later).map((b) => b.id)).toEqual(['first-turtle']);
  });
});
