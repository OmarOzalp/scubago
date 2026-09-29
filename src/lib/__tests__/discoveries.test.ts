import { describe, expect, it } from '@jest/globals';

import {
  celebrateLevel,
  featuredSpecies,
  introduce,
  joinedAt,
  parseDiscoveryState,
  planMoments,
  reconcile,
  startDiscoveries,
  type Presence,
} from '@/lib/discoveries';
import type { Sighting } from '@/lib/types';

const SINCE = '2026-09-01T00:00:00.000Z';
let n = 0;
function sighting(speciesId: string, createdAt: string, extra: Partial<Sighting> = {}): Sighting {
  return {
    id: `s-${++n}`, userId: 'u', username: 'u', speciesId, siteId: 'site', sightedOn: createdAt.slice(0, 10),
    isDemo: false, synced: true, createdAt, ...extra,
  };
}
const OLD = '2026-08-01T10:00:00.000Z';
const NEW = '2026-09-10T10:00:00.000Z';
/** What's owed for a collection with these sightings, from a record started with `known`. */
function owedFor(known: string[], sightings: Sighting[], level = 1) {
  const collection = [...new Set(sightings.map((s) => s.speciesId))];
  return reconcile({ since: SINCE, introduced: known, level }, collection, joinedAt(sightings));
}
const presence = (models: Record<string, Presence>) => (id: string) => (id in models ? models[id] : 'animal');

describe('which discoveries are owed', () => {
  it('another sighting of a species already in the collection is not a new arrival', () => {
    const owed = owedFor(['reef-manta'], [sighting('reef-manta', OLD), sighting('reef-manta', NEW)]);
    expect(owed.pending).toEqual([]);
    expect(owed.levelUp).toBeNull();
  });

  it('a species logged for the first time is owed an arrival', () => {
    const owed = owedFor(['reef-manta'], [sighting('reef-manta', OLD), sighting('whale-shark', NEW)]);
    expect(owed.pending).toEqual(['whale-shark']);
  });

  it('sightings restored from the account (logged before this device kept track) join quietly', () => {
    // A new install: tracking starts empty, then the diver's older log syncs down.
    const state = startDiscoveries([], 1, SINCE);
    const log = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].map((id) => sighting(id, OLD));
    const owed = reconcile(state, log.map((s) => s.speciesId), joinedAt(log));
    expect(owed.pending).toEqual([]);
    expect(owed.levelUp).toBeNull(); // 9 species: level 3, taken as read
    expect(owed.changed).toBe(true);
    expect(owed.state.introduced).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']);
    expect(owed.state.level).toBe(3);
  });

  it('two new species arrive one after the other, in the order they were logged', () => {
    const owed = owedFor([], [sighting('whale-shark', '2026-09-10T11:00:00.000Z'), sighting('reef-manta', '2026-09-10T10:00:00.000Z')]);
    expect(owed.pending).toEqual(['reef-manta', 'whale-shark']);
    const moments = planMoments(owed, presence({}));
    expect(moments).toEqual([
      { kind: 'arrive', speciesIds: ['reef-manta'], school: false },
      { kind: 'arrive', speciesIds: ['whale-shark'], school: false },
    ]);
    expect(featuredSpecies(moments)).toEqual(['reef-manta', 'whale-shark']);
  });

  it('the tuna school arrives as one discovery, however many of its species are new', () => {
    const owed = owedFor([], [sighting('yellowfin-tuna', NEW), sighting('dogtooth-tuna', NEW)]);
    const moments = planMoments(owed, presence({ 'yellowfin-tuna': 'school', 'dogtooth-tuna': 'school' }));
    expect(moments).toEqual([{ kind: 'arrive', speciesIds: ['dogtooth-tuna', 'yellowfin-tuna'], school: true }]);
    expect(featuredSpecies(moments)).toEqual([]); // the school is always there: no animal place needed
  });

  it('species the island cannot show, and any beyond a visit\'s arrivals, get a short note instead', () => {
    const log = ['a', 'b', 'c', 'd', 'nudibranch'].map((id, i) => sighting(id, `2026-09-10T1${i}:00:00.000Z`));
    const moments = planMoments(owedFor([], log), presence({ nudibranch: null }));
    expect(moments.filter((m) => m.kind === 'arrive').map((m) => m.speciesIds[0])).toEqual(['a', 'b', 'c']);
    expect(moments.at(-1)).toEqual({ kind: 'note', speciesIds: ['d', 'nudibranch'] });
  });

  it('an edit that brings a species into the collection makes it a discovery', () => {
    const edited = sighting('whale-shark', OLD, { updatedAt: NEW });
    expect(owedFor(['reef-manta'], [sighting('reef-manta', OLD), edited]).pending).toEqual(['whale-shark']);
  });

  it('deleting the sighting that brought a species in, before it arrived, drops the arrival (and its level-up)', () => {
    const log = [sighting('a', OLD), sighting('b', OLD), sighting('c', NEW)];
    const before = owedFor(['a', 'b'], log);
    expect(before.pending).toEqual(['c']);
    expect(before.levelUp).toEqual({ from: 1, to: 2 });
    const after = owedFor(['a', 'b'], log.slice(0, 2));
    expect(after.pending).toEqual([]);
    expect(after.levelUp).toBeNull();
  });

  it('a species deleted from the collection is forgotten, so logging it again is a discovery again', () => {
    const gone = reconcile({ since: SINCE, introduced: ['a', 'b'], level: 1 }, ['a'], joinedAt([sighting('a', OLD)]));
    expect(gone.state.introduced).toEqual(['a']);
    const back = reconcile(gone.state, ['a', 'b'], joinedAt([sighting('a', OLD), sighting('b', NEW)]));
    expect(back.pending).toEqual(['b']);
  });
});

describe('level-ups', () => {
  const three = [sighting('a', OLD), sighting('b', OLD), sighting('c', NEW)];

  it('fire only on an increase brought by a new discovery', () => {
    expect(owedFor(['a', 'b'], three).levelUp).toEqual({ from: 1, to: 2 });
    expect(planMoments(owedFor(['a', 'b'], three), presence({}))[0]).toEqual({ kind: 'level', from: 1, to: 2 });
  });

  it('a level that falls (deletions) is followed quietly, never celebrated', () => {
    const owed = reconcile({ since: SINCE, introduced: ['a', 'b', 'c'], level: 2 }, ['a', 'b'], joinedAt(three.slice(0, 2)));
    expect(owed.levelUp).toBeNull();
    expect(owed.state.level).toBe(1);
  });

  it('come before the arrival that caused them', () => {
    const moments = planMoments(owedFor(['a', 'b'], three), presence({}));
    expect(moments.map((m) => m.kind)).toEqual(['level', 'arrive']);
  });
});

describe('never replayed', () => {
  it('once played and saved, reopening My Home owes nothing', () => {
    const log = [sighting('a', OLD), sighting('b', OLD), sighting('c', NEW)];
    const first = owedFor(['a', 'b'], log);
    const played = introduce(celebrateLevel(first.state, 2), ['c']);
    const reopened = reconcile(played, ['a', 'b', 'c'], joinedAt(log));
    expect(reopened.pending).toEqual([]);
    expect(reopened.levelUp).toBeNull();
    expect(planMoments(reopened, presence({}))).toEqual([]);
    // What's saved survives a round trip through storage; anything unreadable starts afresh.
    expect(parseDiscoveryState(JSON.stringify(played))).toEqual(played);
    expect(parseDiscoveryState('{"since":1}')).toBeNull();
    expect(parseDiscoveryState('not json')).toBeNull();
    expect(parseDiscoveryState(null)).toBeNull();
  });

  it('closing the app before My Home was seen keeps the moment owed', () => {
    const log = [sighting('a', OLD), sighting('c', NEW)];
    // Nothing was saved as played, so the next launch works out the same thing.
    expect(owedFor(['a'], log).pending).toEqual(['c']);
    expect(owedFor(['a'], log).pending).toEqual(['c']);
  });
});
