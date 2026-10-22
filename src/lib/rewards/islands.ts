import { AREAS, HOME_ISLAND, type IslandId, islandOf, ISLANDS } from '@/lib/archipelago';
import type { Facts } from '@/lib/rewards/facts';
import { rarityRank } from '@/lib/rarity';
import type { Rarity } from '@/lib/types';

/** A resident the diver has not met yet, to look for. */
export interface IslandTarget {
  speciesId: string;
  name: string;
  /** The effective rarity (observed from real records when known, else the catalog's). */
  rarity: Rarity;
}

/** How the diver stands with one island of the archipelago. */
export interface IslandResult {
  id: IslandId;
  name: string;
  /** The colour of its area (a dot beside the name, never the only cue). */
  color: string;
  unlocked: boolean;
  /** yyyy-mm-dd the first species from its area was logged. Absent for Home's island, which was never locked, and while locked. */
  unlockedOn?: string;
  /** The species that raised it (the first one logged from its area). */
  raisedBy?: string;
  /** Species that swim at the island and the diver has logged, and all the catalog has for it (the Coral Reef's include the Open Ocean's and Black Sand Bay's, which swim at Home). */
  residentsFound: number;
  residentsTotal: number;
  /** Up to three residents not yet logged, the easiest first (lowest effective rarity, then catalog order). */
  next: IslandTarget[];
  /** What raises a locked island: "Log any Kelp Forest animal, such as a Lingcod." */
  requirement?: string;
}

const NEXT_LIMIT = 3;
const withArticle = (name: string) => (/^[aeiou]/i.test(name) ? `an ${name}` : `a ${name}`);

/**
 * Each island of the archipelago, in `ISLANDS` order, with whether it has risen and what to look for
 * next. The rules are those of Home (`foundIslands`, `islandOf`): the Coral Reef is Home's and never
 * locked, and every other island rises with the first species logged from its area.
 */
export function islandsFrom(facts: Facts): IslandResult[] {
  const species = [...facts.input.catalog.values()];
  return (Object.keys(ISLANDS) as IslandId[]).map((id) => {
    const area = AREAS.find((a) => a.id === id)!;
    const residents = species.filter((s) => islandOf(s.id) === id);
    const next = residents
      .filter((s) => !facts.findOf.has(s.id))
      .sort((a, b) => rarityRank(facts.rarityOf(a)) - rarityRank(facts.rarityOf(b)) || facts.catalogOrder.get(a.id)! - facts.catalogOrder.get(b.id)!)
      .slice(0, NEXT_LIMIT)
      .map((s) => ({ speciesId: s.id, name: s.commonName, rarity: facts.rarityOf(s) }));
    const first = id === HOME_ISLAND ? undefined : facts.finds.find((f) => islandOf(f.species.id) === id);
    const unlocked = id === HOME_ISLAND || first !== undefined;
    const result: IslandResult = {
      id,
      name: area.name,
      color: area.color,
      unlocked,
      residentsFound: residents.length - residents.filter((s) => !facts.findOf.has(s.id)).length,
      residentsTotal: residents.length,
      next,
    };
    if (first) {
      result.unlockedOn = first.on;
      result.raisedBy = first.species.id;
    }
    if (!unlocked) result.requirement = `Log any ${area.name} animal${next[0] ? `, such as ${withArticle(next[0].name)}` : ''}.`;
    return result;
  });
}
