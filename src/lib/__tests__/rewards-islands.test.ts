import { describe, expect, it } from '@jest/globals';
import { AREAS, foundAreas, foundIslands, HOME_ISLAND, islandOf, ISLANDS, residentsOf } from '@/lib/archipelago';
import { CATALOG_BY_ID } from '@/lib/catalog';
import { deriveDex } from '@/lib/dex';
import { evaluateIslands, type IslandResult, type RewardsInput } from '@/lib/rewards';
import type { DiveSite, Rarity, Sighting } from '@/lib/types';

// All the sightings and sites below are hand-written test data, not anyone's log.
const seen = (speciesId: string, sightedOn: string, over: Partial<Sighting> = {}): Sighting => ({
  id: `${speciesId}@${sightedOn}`, userId: 'me', username: 'me', speciesId, siteId: 'site-a', sightedOn,
  isDemo: false, synced: true, createdAt: `${sightedOn}T10:00:00.000Z`, ...over,
});
const SITE: DiveSite = { id: 'site-a', name: 'Site A', lat: 0, lng: 0, region: 'Test Sea', country: 'Testland', blurb: '', notableSpecies: [], source: 'user' };
const input = (over: Partial<RewardsInput>): RewardsInput => ({ sightings: [], dives: [], sites: new Map([[SITE.id, SITE]]), catalog: CATALOG_BY_ID, ...over });
const island = (islands: IslandResult[], id: string) => islands.find((i) => i.id === id)!;
const ids = (islands: IslandResult[]) => islands.filter((i) => i.unlocked).map((i) => i.id);

describe('island blurbs', () => {
  it('carry the words of the island\'s area, locked or raised', () => {
    const islands = evaluateIslands(input({ sightings: [seen('lingcod', '2026-03-01')] }));
    expect(island(islands, 'kelp-forest').unlocked).toBe(true);
    expect(island(islands, 'shipwreck').unlocked).toBe(false);
    for (const i of islands) {
      const area = AREAS.find((a) => a.id === i.id)!;
      expect(i.blurb).toBe(area.blurb);
      expect(i.blurb.length).toBeGreaterThan(20);
    }
  });
});

describe('island unlocks', () => {
  it('lists every island of the archipelago, with the Coral Reef (Home\'s) unlocked from the start', () => {
    const islands = evaluateIslands(input({}));
    expect(islands.map((i) => i.id)).toEqual(Object.keys(ISLANDS));
    expect(island(islands, 'coral-reef')).toMatchObject({ name: 'Coral Reef', unlocked: true, residentsFound: 0 });
    expect(island(islands, 'coral-reef').unlockedOn).toBeUndefined();
    expect(island(islands, 'coral-reef').requirement).toBeUndefined();
    expect(ids(islands)).toEqual([HOME_ISLAND]);
    for (const i of islands.filter((x) => x.id !== HOME_ISLAND)) {
      expect(i).toMatchObject({ unlocked: false, residentsFound: 0, color: expect.stringMatching(/^#/) });
      expect(i.unlockedOn).toBeUndefined();
      expect(i.requirement).toMatch(/^Log any .+ animal, such as an? .+\.$/);
    }
  });

  it('rises each other island with the first species logged from its area, on that sighting\'s day, whatever order the log is in', () => {
    const sightings = [
      seen('lingcod', '2026-03-01'),
      seen('nurse-shark', '2026-04-01'),
      seen('great-white-shark', '2026-02-01'),
      seen('whale-shark', '2026-01-01'),
      seen('clownfish', '2026-01-10'),
      seen('harbor-seal', '2026-05-01'),
    ];
    for (const log of [sightings, [...sightings].reverse()]) {
      const islands = evaluateIslands(input({ sightings: log }));
      expect(island(islands, 'kelp-forest')).toMatchObject({ unlocked: true, unlockedOn: '2026-02-01', raisedBy: 'great-white-shark', residentsFound: 3 });
      expect(island(islands, 'mangroves')).toMatchObject({ unlocked: true, unlockedOn: '2026-04-01', raisedBy: 'nurse-shark', residentsFound: 1 });
      expect(island(islands, 'volcanic-pinnacle')).toMatchObject({ unlocked: false });
      expect(island(islands, 'shipwreck')).toMatchObject({ unlocked: false });
      // The Open Ocean has no island: its whale shark swims at Home and unlocks nothing.
      expect(ids(islands)).toEqual(['coral-reef', 'kelp-forest', 'mangroves']);
      expect(island(islands, 'coral-reef').residentsFound).toBe(2);
      expect(island(islands, 'kelp-forest').requirement).toBeUndefined();
    }
  });

  it('names the species that raised an island by when the sightings were logged when they share a day', () => {
    const sightings = [
      seen('harbor-seal', '2026-05-01', { createdAt: '2026-05-01T09:00:00.000Z' }),
      seen('sea-otter', '2026-05-01', { createdAt: '2026-05-01T07:00:00.000Z' }),
    ];
    for (const log of [sightings, [...sightings].reverse()]) {
      expect(island(evaluateIslands(input({ sightings: log })), 'kelp-forest')).toMatchObject({ unlockedOn: '2026-05-01', raisedBy: 'sea-otter' });
    }
    // With nothing to tell them apart it is still the same one every time.
    const tied = [seen('orca', '2026-05-01'), seen('garibaldi', '2026-05-01')];
    const raisedBy = (log: Sighting[]) => island(evaluateIslands(input({ sightings: log })), 'kelp-forest').raisedBy;
    expect(raisedBy(tied)).toBe(raisedBy([...tied].reverse()));
  });

  it('agrees with the rules Home already uses (foundIslands and foundAreas)', () => {
    const sightings = [
      seen('lingcod', '2026-03-01'), seen('great-white-shark', '2026-02-01'), seen('nurse-shark', '2026-04-01'), seen('whale-shark', '2026-01-01'),
      seen('marine-iguana', '2026-05-02'), seen('goliath-grouper', '2026-06-01'), seen('mimic-octopus', '2026-06-02'), seen('clownfish', '2026-01-10'),
    ];
    const dex = deriveDex(sightings, CATALOG_BY_ID);
    const islands = evaluateIslands(input({ sightings }));
    expect(ids(islands).sort()).toEqual([...foundIslands(dex)].sort());
    const others = islands.filter((i) => i.unlocked && i.id !== HOME_ISLAND).sort((a, b) => a.unlockedOn!.localeCompare(b.unlockedOn!));
    expect(others.map((i) => i.id)).toEqual(foundIslands(dex).filter((id) => id !== HOME_ISLAND));
    for (const i of others) {
      const area = foundAreas(dex).find((a) => a.area.id === i.id)!;
      expect(i.unlockedOn).toBe(area.first.firstSeenOn);
      expect(i.raisedBy).toBe(area.first.species.id);
    }
    // Home's residents are the species that swim there, counted as the dex does.
    expect(island(islands, 'coral-reef').residentsFound).toBe(dex.filter((e) => islandOf(e.species.id) === 'coral-reef').length);
  });

  it('ignores "something else" and species the catalog does not know', () => {
    const islands = evaluateIslands(input({ sightings: [seen('unlisted', '2026-01-01', { customName: 'Sea otter?' }), seen('made-up-species', '2026-01-02')] }));
    expect(ids(islands)).toEqual(['coral-reef']);
    expect(island(islands, 'coral-reef').residentsFound).toBe(0);
  });
});

describe('residents and what to look for next', () => {
  it('counts residents as the species that swim at the island, so Home\'s include the Open Ocean\'s and Black Sand Bay\'s', () => {
    const home = island(evaluateIslands(input({})), 'coral-reef');
    expect(home.residentsTotal).toBe([...CATALOG_BY_ID.keys()].filter((id) => islandOf(id) === 'coral-reef').length);
    expect(home.residentsTotal).toBeGreaterThan(residentsOf('coral-reef').length);
    expect(island(evaluateIslands(input({})), 'shipwreck').residentsTotal).toBe(residentsOf('shipwreck').length);
  });

  it('offers up to three unfound residents, the easiest first: lowest rarity, then catalog order', () => {
    const kelp = island(evaluateIslands(input({})), 'kelp-forest');
    expect(kelp.next.map((t) => t.speciesId)).toEqual(['lingcod', 'california-sea-lion', 'harbor-seal']);
    expect(kelp.next.map((t) => t.rarity)).toEqual(['common', 'uncommon', 'uncommon']);
    expect(kelp.next[0]).toEqual({ speciesId: 'lingcod', name: 'Lingcod', rarity: 'common' });
    const volcanic = island(evaluateIslands(input({})), 'volcanic-pinnacle');
    expect(volcanic.next.map((t) => t.speciesId)).toEqual(['spotted-eagle-ray', 'marbled-ray', 'giant-trevally']);
  });

  it('says in a line what raises a locked island, naming an easy resident', () => {
    const islands = evaluateIslands(input({}));
    expect(island(islands, 'kelp-forest').requirement).toBe('Log any Kelp Forest animal, such as a Lingcod.');
    expect(island(islands, 'volcanic-pinnacle').requirement).toBe('Log any Volcanic Pinnacle animal, such as a Spotted Eagle Ray.');
    expect(island(islands, 'mangroves').requirement).toBe('Log any Mangroves & Seagrass animal, such as a Nurse Shark.');
  });

  it('moves on once a resident is found, and runs out when they all are', () => {
    const afterLingcod = island(evaluateIslands(input({ sightings: [seen('lingcod', '2026-03-01')] })), 'kelp-forest');
    expect(afterLingcod.next.map((t) => t.speciesId)).toEqual(['california-sea-lion', 'harbor-seal', 'garibaldi']);
    expect(afterLingcod.residentsFound).toBe(1);

    const wreck = residentsOf('shipwreck');
    const nearly = island(evaluateIslands(input({ sightings: wreck.slice(0, 8).map((id, i) => seen(id, `2026-02-0${i + 1}`)) })), 'shipwreck');
    expect(nearly).toMatchObject({ unlocked: true, unlockedOn: '2026-02-01', residentsFound: 8, residentsTotal: 9 });
    expect(nearly.next.map((t) => t.speciesId)).toEqual([wreck[8]]);
    const all = island(evaluateIslands(input({ sightings: wreck.map((id, i) => seen(id, `2026-02-0${i + 1}`)) })), 'shipwreck');
    expect(all).toMatchObject({ residentsFound: 9, residentsTotal: 9, next: [] });
  });

  it('judges easiest by the rarity found in real records when it is known', () => {
    // Records say garibaldi are an everyday sight and lingcod a much rarer one than the catalog thinks.
    const observed = new Map<string, Rarity>([['garibaldi', 'common'], ['lingcod', 'epic']]);
    const kelp = island(evaluateIslands(input({ observed })), 'kelp-forest');
    expect(kelp.next.map((t) => t.speciesId)).toEqual(['garibaldi', 'california-sea-lion', 'harbor-seal']);
    expect(kelp.next.map((t) => t.rarity)).toEqual(['common', 'uncommon', 'uncommon']);
    expect(kelp.requirement).toBe('Log any Kelp Forest animal, such as a Garibaldi.');
    // With those three found, the lingcod (an epic sight now) comes after the rares.
    const later = island(evaluateIslands(input({ observed, sightings: ['garibaldi', 'california-sea-lion', 'harbor-seal'].map((id) => seen(id, '2026-03-01')) })), 'kelp-forest');
    expect(later.next.map((t) => t.speciesId)).toEqual(['wolf-eel', 'giant-cuttlefish', 'sea-otter']);
    expect(later.next.map((t) => t.rarity)).toEqual(['rare', 'rare', 'epic']);
  });
});
