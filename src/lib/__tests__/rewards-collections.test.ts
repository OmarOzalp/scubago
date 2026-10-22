import { describe, expect, it } from '@jest/globals';
import { AREAS, residentsOf } from '@/lib/archipelago';
import { CATALOG_BY_ID } from '@/lib/catalog';
import { COLLECTIONS, evaluateBadges, evaluateCollections, type BadgeResult, type CollectionResult, type RewardsInput } from '@/lib/rewards';
import type { DiveSite, Sighting, Species } from '@/lib/types';

// All the sightings and sites below are hand-written test data, not anyone's log.
const seen = (speciesId: string, sightedOn: string, over: Partial<Sighting> = {}): Sighting => ({
  id: `${speciesId}@${sightedOn}`, userId: 'me', username: 'me', speciesId, siteId: 'site-a', sightedOn,
  isDemo: false, synced: true, createdAt: `${sightedOn}T10:00:00.000Z`, ...over,
});
const SITE: DiveSite = { id: 'site-a', name: 'Site A', lat: 0, lng: 0, region: 'Test Sea', country: 'Testland', blurb: '', notableSpecies: [], source: 'user' };
const input = (over: Partial<RewardsInput>): RewardsInput => ({ sightings: [], dives: [], sites: new Map([[SITE.id, SITE]]), catalog: CATALOG_BY_ID, ...over });
const collection = (results: CollectionResult[], id: string) => results.find((c) => c.id === id)!;
const badge = (results: BadgeResult[], id: string) => results.find((b) => b.id === id)!;
const species = (id: string, category: Species['category']): Species => ({ id, commonName: id, scientificName: id, category, rarity: 'common', blurb: '' });
const day = (n: number) => `2026-02-${String(n).padStart(2, '0')}`;

describe('the collections', () => {
  it('include one for each archipelago area, holding that area\'s residents', () => {
    const results = evaluateCollections(input({}));
    for (const area of AREAS) {
      const c = collection(results, `area-${area.id}`);
      expect(c).toMatchObject({ kind: 'area', title: area.name, areaId: area.id, found: 0, total: residentsOf(area.id).length, completed: false });
      expect(c.missingIds).toEqual(residentsOf(area.id));
      expect(c.foundIds).toEqual([]);
    }
  });

  it('include a family for each of sharks, rays, turtles, mammals and cephalopods, derived from the catalog categories', () => {
    const results = evaluateCollections(input({}));
    for (const category of ['shark', 'ray', 'turtle', 'mammal', 'cephalopod'] as const) {
      const expected = [...CATALOG_BY_ID.values()].filter((s) => s.category === category).map((s) => s.id);
      expect(expected.length).toBeGreaterThan(1);
      expect(collection(results, `family-${category}`)).toMatchObject({ kind: 'family', total: expected.length, missingIds: expected });
    }
  });

  it('follow whatever catalog they are given', () => {
    const catalog = new Map([species('a-shark', 'shark'), species('b-shark', 'shark'), species('a-ray', 'ray')].map((s) => [s.id, s] as const));
    const results = evaluateCollections(input({ catalog, sightings: [seen('b-shark', '2026-01-01')] }));
    expect(collection(results, 'family-shark')).toMatchObject({ found: 1, total: 2, foundIds: ['b-shark'], missingIds: ['a-shark'] });
    expect(collection(results, 'family-ray')).toMatchObject({ found: 0, total: 1 });
    // Collections the catalog has nothing (or too little) for are left out, and so are their badges.
    expect(results.find((c) => c.id === 'family-turtle')).toBeUndefined();
    expect(results.find((c) => c.id === 'area-coral-reef')).toBeUndefined();
    expect(results.find((c) => c.id === 'set-red-sea-classics')).toBeUndefined();
    const badges = evaluateBadges(input({ catalog }));
    expect(badges.find((b) => b.id === 'collection-family-shark')).toBeDefined();
    expect(badges.find((b) => b.id === 'collection-family-turtle')).toBeUndefined();
  });
});

describe('the hand-picked sets', () => {
  const sets = COLLECTIONS.filter((c) => c.source.type === 'species');

  it('are the four promised, and every species id in them is in the catalog', () => {
    expect(sets.map((c) => c.id)).toEqual(['set-reef-sharks', 'set-mantas-and-devils', 'set-hammerheads', 'set-red-sea-classics']);
    for (const c of sets) {
      const ids = c.source.type === 'species' ? c.source.ids : [];
      expect(ids.length).toBeGreaterThan(0);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) expect(`${c.id}: ${CATALOG_BY_ID.has(id)}`).toBe(`${c.id}: true`);
    }
  });

  it('are all present with the real catalog, the Red Sea classics with at least three species', () => {
    const results = evaluateCollections(input({}));
    for (const c of sets) expect(collection(results, c.id)).toBeDefined();
    expect(collection(results, 'set-red-sea-classics').total).toBeGreaterThanOrEqual(3);
    expect(collection(results, 'set-reef-sharks').missingIds).toEqual(['grey-reef-shark', 'blacktip-reef-shark', 'whitetip-reef-shark']);
    expect(collection(results, 'set-mantas-and-devils').total).toBe(3);
    expect(collection(results, 'set-hammerheads').missingIds).toEqual(['scalloped-hammerhead', 'great-hammerhead']);
  });

  it('keep the hammerheads as a pair: the set, and its badge, exist only while the catalog has both', () => {
    expect(COLLECTIONS.find((c) => c.id === 'set-hammerheads')?.minMembers).toBe(2);
    const pick = (...ids: string[]) => new Map(ids.map((id) => [id, CATALOG_BY_ID.get(id)!] as const));
    const one = input({ catalog: pick('great-hammerhead') });
    expect(evaluateCollections(one).find((c) => c.id === 'set-hammerheads')).toBeUndefined();
    expect(evaluateBadges(one).find((b) => b.id === 'collection-set-hammerheads')).toBeUndefined();
    const both = input({ catalog: pick('great-hammerhead', 'scalloped-hammerhead') });
    expect(collection(evaluateCollections(both), 'set-hammerheads')).toMatchObject({ total: 2, memberIds: ['scalloped-hammerhead', 'great-hammerhead'] });
    expect(evaluateBadges(both).find((b) => b.id === 'collection-set-hammerheads')).toBeDefined();
  });
});

describe('no two collections are the same set', () => {
  it('hold different species, so finishing one never finishes another', () => {
    const members = evaluateCollections(input({})).map((c) => [...c.memberIds].sort().join());
    expect(new Set(members).size).toBe(members.length);
    // The old "Wreck regulars" were the Shipwreck's nine residents again.
    expect(COLLECTIONS.map((c) => c.id)).not.toContain('set-wreck-regulars');
  });

  it('earns one collection badge for logging everyone on the Shipwreck, not two', () => {
    const sightings = residentsOf('shipwreck').map((id, i) => seen(id, day(i + 1)));
    const earned = evaluateBadges(input({ sightings })).filter((b) => b.kind === 'collection' && b.earned);
    expect(earned.map((b) => b.id)).toEqual(['collection-area-shipwreck']);
  });
});

describe('memberIds', () => {
  const reefSharks = ['grey-reef-shark', 'blacktip-reef-shark', 'whitetip-reef-shark'];

  it('are every species the catalog has for a collection, in its own order: the area\'s, the catalog\'s for a family, the set\'s', () => {
    const results = evaluateCollections(input({}));
    for (const area of AREAS) expect(collection(results, `area-${area.id}`).memberIds).toEqual(residentsOf(area.id));
    const sharks = [...CATALOG_BY_ID.values()].filter((s) => s.category === 'shark').map((s) => s.id);
    expect(collection(results, 'family-shark').memberIds).toEqual(sharks);
    expect(collection(results, 'set-reef-sharks').memberIds).toEqual(reefSharks);
    for (const c of results) expect(c.memberIds).toHaveLength(c.total);
  });

  it('keep that order whatever is logged and when, found and missing being its two halves', () => {
    const log = [seen('whitetip-reef-shark', '2026-01-01'), seen('grey-reef-shark', '2026-05-01')];
    for (const sightings of [log, [...log].reverse()]) {
      const c = collection(evaluateCollections(input({ sightings })), 'set-reef-sharks');
      expect(c.memberIds).toEqual(reefSharks);
      expect(c.foundIds).toEqual(['grey-reef-shark', 'whitetip-reef-shark']);
      expect(c.missingIds).toEqual(['blacktip-reef-shark']);
      expect(c.memberIds.filter((id) => c.foundIds.includes(id))).toEqual(c.foundIds);
      expect(c.memberIds.filter((id) => c.missingIds.includes(id))).toEqual(c.missingIds);
    }
  });

  it('leave out species the catalog does not have', () => {
    const catalog = new Map(['whitetip-reef-shark', 'grey-reef-shark'].map((id) => [id, CATALOG_BY_ID.get(id)!] as const));
    expect(collection(evaluateCollections(input({ catalog })), 'set-reef-sharks').memberIds).toEqual(['grey-reef-shark', 'whitetip-reef-shark']);
  });
});

describe('areaId', () => {
  it('names the archipelago area of an area collection and of its completion badge, and of nothing else', () => {
    for (const c of evaluateCollections(input({}))) {
      const area = AREAS.find((a) => `area-${a.id}` === c.id);
      if (area) expect(c.areaId).toBe(area.id);
      else expect('areaId' in c).toBe(false);
    }
    for (const b of evaluateBadges(input({}))) {
      const area = AREAS.find((a) => `collection-area-${a.id}` === b.id);
      if (area) expect(b.areaId).toBe(area.id);
      else expect('areaId' in b).toBe(false);
    }
  });

  it('stays on the badge when it is earned', () => {
    const sightings = residentsOf('kelp-forest').map((id, i) => seen(id, day(i + 1)));
    expect(badge(evaluateBadges(input({ sightings })), 'collection-area-kelp-forest')).toMatchObject({ earned: true, areaId: 'kelp-forest' });
  });
});

describe('progress and completion', () => {
  const sharks = [seen('whitetip-reef-shark', '2026-03-05'), seen('grey-reef-shark', '2026-01-10'), seen('blacktip-reef-shark', '2026-02-20')];

  it('shows which species are found and which are still to find', () => {
    const results = evaluateCollections(input({ sightings: sharks.slice(0, 2) }));
    expect(collection(results, 'set-reef-sharks')).toMatchObject({
      found: 2, total: 3, foundIds: ['grey-reef-shark', 'whitetip-reef-shark'], missingIds: ['blacktip-reef-shark'], completed: false, hint: '1 more reef shark',
    });
    expect(collection(results, 'set-reef-sharks').completedOn).toBeUndefined();
    expect(collection(results, 'area-coral-reef')).toMatchObject({ found: 2, hint: '32 more Coral Reef animals' });
  });

  it('completes on the day the last member was first logged, whatever order the log is in', () => {
    // A later sighting of an earlier find does not move the day.
    const log = [...sharks, seen('grey-reef-shark', '2026-06-01')];
    for (const sightings of [log, [...log].reverse()]) {
      const c = collection(evaluateCollections(input({ sightings })), 'set-reef-sharks');
      expect(c).toMatchObject({ found: 3, completed: true, completedOn: '2026-03-05', missingIds: [] });
      expect(c.hint).toBeUndefined();
    }
  });

  it('earns a badge on completion, with the collection\'s progress and hint before it', () => {
    const before = evaluateBadges(input({ sightings: sharks.slice(0, 2) })).find((b) => b.id === 'collection-set-reef-sharks')!;
    expect(before).toMatchObject({ kind: 'collection', earned: false, progress: { have: 2, need: 3 }, hint: '1 more reef shark', emblem: 'shark' });
    const after = evaluateBadges(input({ sightings: sharks })).find((b) => b.id === 'collection-set-reef-sharks')!;
    expect(after).toMatchObject({ earned: true, earnedOn: '2026-03-05', progress: { have: 3, need: 3 } });
    expect(after.hint).toBeUndefined();
  });

  it('ignores "something else" and species the catalog does not know', () => {
    const results = evaluateCollections(input({
      sightings: [seen('unlisted', '2026-01-01', { customName: 'Grey reef shark?' }), seen('made-up-shark', '2026-01-02')],
    }));
    expect(results.every((c) => c.found === 0)).toBe(true);
  });
});
