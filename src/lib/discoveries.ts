import { levelForCount } from '@/lib/home';
import type { Sighting } from '@/lib/types';

/**
 * Discovery moments on My Home: a new species swims in, and a level-up grows the island. Which
 * moments are owed is worked out from the collection and a small record per diver on this device,
 * so it survives the app closing before Home is opened, never replays, and never celebrates
 * sightings restored from the account (a new install) or synced from a much older log.
 */
export interface DiscoveryState {
  /** When this device began keeping track (ISO). Species that joined the collection earlier are never "new" here. */
  since: string;
  /** Species already celebrated, or in the collection when tracking began. */
  introduced: string[];
  /** The island level last celebrated (or the level when tracking began). */
  level: number;
}

export function startDiscoveries(collection: readonly string[], level: number, now: string): DiscoveryState {
  return { since: now, introduced: [...collection].sort(), level };
}

/** A stored record, or null if there is none or it's unreadable (tracking then starts afresh). */
export function parseDiscoveryState(raw: string | null): DiscoveryState | null {
  try {
    const value = raw ? JSON.parse(raw) : null;
    if (
      typeof value?.since === 'string' && Array.isArray(value.introduced) && value.introduced.every((id: unknown) => typeof id === 'string')
      && Number.isInteger(value.level) && value.level >= 1
    ) return { since: value.since, introduced: value.introduced, level: value.level };
  } catch {}
  return null;
}

/**
 * When each species joined the diver's collection: its earliest sighting, an edited sighting counting
 * from its edit (changing a sighting's species is one way a species joins).
 */
export function joinedAt(sightings: readonly Sighting[]): Map<string, string> {
  const joined = new Map<string, string>();
  for (const s of sightings) {
    if (s.isDemo) continue;
    const at = s.updatedAt && s.updatedAt > s.createdAt ? s.updatedAt : s.createdAt;
    const earliest = joined.get(s.speciesId);
    if (!earliest || at < earliest) joined.set(s.speciesId, at);
  }
  return joined;
}

export interface Reconciled {
  /** The record brought up to date with the collection (save it if `changed`). */
  state: DiscoveryState;
  changed: boolean;
  /** New species still to be celebrated, in the order they joined. */
  pending: string[];
  /** A level-up still to be celebrated. */
  levelUp: { from: number; to: number } | null;
}

/**
 * Bring the record up to date with the collection:
 * - a species that left the collection (its sightings deleted or edited away) is forgotten, so
 *   logging it again is a discovery again;
 * - a species that joined before tracking began (restored from the account, or synced from an older
 *   log) is taken as read, quietly;
 * - one that joined since is pending until its moment plays;
 * - the level owed a celebration is the collection's, if higher than both the level celebrated and
 *   the level it would have without its pending species (older finds grow the island quietly). A
 *   level that falls (deletions) is followed quietly: only an increase is ever celebrated.
 */
export function reconcile(state: DiscoveryState, collection: readonly string[], joined: ReadonlyMap<string, string>): Reconciled {
  const inCollection = new Set(collection);
  const kept = state.introduced.filter((id) => inCollection.has(id));
  const known = new Set(kept);
  const pending: string[] = [];
  const quiet: string[] = [];
  for (const id of collection) {
    if (known.has(id)) continue;
    const at = joined.get(id);
    if (at && at >= state.since) pending.push(id);
    else quiet.push(id);
  }
  pending.sort((a, b) => joined.get(a)!.localeCompare(joined.get(b)!) || a.localeCompare(b));
  const introduced = [...kept, ...quiet].sort();
  const level = levelForCount(collection.length);
  const settled = levelForCount(collection.length - pending.length);
  const celebrated = Math.min(level, Math.max(state.level, settled));
  const next: DiscoveryState = { since: state.since, introduced, level: celebrated };
  const changed = celebrated !== state.level || introduced.length !== state.introduced.length
    || introduced.some((id, i) => id !== state.introduced[i]);
  return { state: changed ? next : state, changed, pending, levelUp: level > celebrated ? { from: celebrated, to: level } : null };
}

/** Mark species as celebrated. */
export function introduce(state: DiscoveryState, ids: readonly string[]): DiscoveryState {
  const introduced = [...new Set([...state.introduced, ...ids])].sort();
  return { ...state, introduced };
}

/** Mark a level as celebrated. */
export function celebrateLevel(state: DiscoveryState, level: number): DiscoveryState {
  return { ...state, level: Math.max(state.level, level) };
}

/** How a new species shows up on the island: as its own animal, as the tuna school, or not at all (no model). */
export type Presence = 'animal' | 'school' | null;

/**
 * One moment on My Home, in the order they play:
 * - `level`: the banner, then the island grows into the new level (islets rise from the water);
 * - `arrive`: a new species swims in from the edge of the ocean (the tuna school arrives as one
 *   discovery, however many of its species are new);
 * - `note`: a short note for new species the island can't show (no animal for them), and for any
 *   beyond the arrivals one visit plays (they join quietly rather than queueing for minutes).
 */
export type Moment =
  | { kind: 'level'; from: number; to: number }
  | { kind: 'arrive'; speciesIds: string[]; school: boolean }
  | { kind: 'note'; speciesIds: string[] };

/** Arrivals one visit to My Home plays at most (each is about a quarter of a minute). */
export const ARRIVALS_PER_VISIT = 3;

export function planMoments(
  owed: Pick<Reconciled, 'pending' | 'levelUp'>,
  presence: (speciesId: string) => Presence,
  limit = ARRIVALS_PER_VISIT,
): Moment[] {
  const moments: Moment[] = [];
  if (owed.levelUp) moments.push({ kind: 'level', ...owed.levelUp });
  const noted: string[] = [];
  let school: Extract<Moment, { kind: 'arrive' }> | null = null;
  let arrivals = 0;
  for (const id of owed.pending) {
    const how = presence(id);
    if (how === 'school' && school) school.speciesIds.push(id);
    else if (how && arrivals < limit) {
      const moment = { kind: 'arrive' as const, speciesIds: [id], school: how === 'school' };
      if (how === 'school') school = moment;
      moments.push(moment);
      arrivals++;
    } else noted.push(id);
  }
  if (noted.length > 0) moments.push({ kind: 'note', speciesIds: noted });
  return moments;
}

/** The species that swim in as their own animal during this visit: each gets a featured place on the island. */
export function featuredSpecies(moments: readonly Moment[]): string[] {
  return moments.flatMap((m) => (m.kind === 'arrive' && !m.school ? m.speciesIds : []));
}
