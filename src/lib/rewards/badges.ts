import type { AreaId } from '@/lib/archipelago';
import { RARITY_LABEL, rarityRank } from '@/lib/rarity';
import { COLLECTIONS, type CollectionResult, moreOf } from '@/lib/rewards/collections';
import type { Facts } from '@/lib/rewards/facts';
import { REGION_BADGES, type RegionBadgeId } from '@/lib/rewards/places';
import type { Emblem } from '@/lib/rewards/types';
import type { Category, Rarity } from '@/lib/types';

export type BadgeKind = 'first' | 'collection' | 'milestone' | 'place';
export type BadgeTier = 'bronze' | 'silver' | 'gold';

/** What a badge is, as the UI shows it. Ids are stable: the UI stores them to remember what it has celebrated. */
export interface BadgeDefinition {
  id: string;
  title: string;
  description: string;
  kind: BadgeKind;
  emblem: Emblem;
  /** The plate of a rung in a ladder. */
  tier?: BadgeTier;
  /** Rungs of one ladder share this key and are listed in order, easiest first. */
  ladder?: string;
}

/** What earns a badge. The engine reads these; the UI has no need to. */
export type BadgeRule =
  | { type: 'sighting' }
  | { type: 'category'; category: Category; noun: string }
  | { type: 'rarity'; atLeast: Rarity }
  | { type: 'species'; count: number }
  | { type: 'dive-kind'; kind: 'night' | 'wreck' }
  | { type: 'dive-number'; number: number }
  | { type: 'sites'; count: number }
  | { type: 'countries'; count: number }
  | { type: 'region'; region: RegionBadgeId }
  | { type: 'region-sites'; region: RegionBadgeId; count: number }
  | { type: 'collection'; collectionId: string };

type BadgeSpec = BadgeDefinition & { rule: BadgeRule };
type Rung = readonly [count: number, tier: BadgeTier, title: string, description: string];

function ladder(key: string, kind: BadgeKind, emblem: Emblem, rungs: readonly Rung[], rule: (count: number) => BadgeRule): BadgeSpec[] {
  return rungs.map(([count, tier, title, description]) => ({ id: `${key}-${count}`, title, description, kind, emblem, tier, ladder: key, rule: rule(count) }));
}

const FIRSTS: BadgeSpec[] = [
  { id: 'first-sighting', title: 'First sighting', description: 'Your first animal, written in the logbook.', kind: 'first', emblem: 'star', rule: { type: 'sighting' } },
  { id: 'first-shark', title: 'First shark', description: 'A fin in the blue, and now a line in your book.', kind: 'first', emblem: 'shark', rule: { type: 'category', category: 'shark', noun: 'shark' } },
  { id: 'first-ray', title: 'First ray', description: 'Wings in the water: your first ray.', kind: 'first', emblem: 'ray', rule: { type: 'category', category: 'ray', noun: 'ray' } },
  { id: 'first-turtle', title: 'First turtle', description: 'A slow, ancient glide past your mask.', kind: 'first', emblem: 'turtle', rule: { type: 'category', category: 'turtle', noun: 'turtle' } },
  { id: 'first-mammal', title: 'First sea mammal', description: 'A dolphin, a seal, a whale: your first warm-blooded neighbour.', kind: 'first', emblem: 'mammal', rule: { type: 'category', category: 'mammal', noun: 'marine mammal' } },
  { id: 'first-rare', title: 'First rare find', description: 'An animal not every diver gets to see.', kind: 'first', emblem: 'gem', rule: { type: 'rarity', atLeast: 'rare' } },
  { id: 'first-epic', title: 'First epic find', description: 'An animal few divers ever meet.', kind: 'first', emblem: 'gem', rule: { type: 'rarity', atLeast: 'epic' } },
  { id: 'first-legendary', title: 'First legendary find', description: 'One of the sea’s great sightings, now in your book.', kind: 'first', emblem: 'crown', rule: { type: 'rarity', atLeast: 'legendary' } },
  { id: 'first-night-dive', title: 'First night dive', description: 'The reef after dark, by torchlight.', kind: 'first', emblem: 'night', rule: { type: 'dive-kind', kind: 'night' } },
  { id: 'first-wreck-dive', title: 'First wreck dive', description: 'Down to a ship that sank long ago.', kind: 'first', emblem: 'wreck', rule: { type: 'dive-kind', kind: 'wreck' } },
];

const SPECIES_COUNT: BadgeSpec[] = ladder('species', 'milestone', 'book', [
  [10, 'bronze', 'Ten species', 'Ten different animals in your collection.'],
  [25, 'silver', 'Twenty-five species', 'Twenty-five different animals, and counting.'],
  [50, 'gold', 'Fifty species', 'Half a hundred different animals logged.'],
  [100, 'gold', 'A hundred species', 'One hundred different animals: a field guide of your own.'],
], (count) => ({ type: 'species', count }));

const DIVE_NUMBERS: BadgeSpec[] = ladder('dives', 'milestone', 'dive', [
  [1, 'bronze', 'First dive', 'The first page of your logbook.'],
  [10, 'bronze', 'Ten dives', 'Double digits in the logbook.'],
  [25, 'silver', 'Twenty-five dives', 'A quarter of the way to a hundred.'],
  [50, 'silver', 'Fifty dives', 'Half a hundred pages written.'],
  [100, 'gold', 'A hundred dives', 'Triple digits: the logbook is getting heavy.'],
  [250, 'gold', 'Two hundred and fifty dives', 'A well-worn logbook and a well-worn mask strap.'],
  [500, 'gold', 'Five hundred dives', 'Half a thousand dives. Few logbooks run this deep.'],
], (number) => ({ type: 'dive-number', number }));

const SITES: BadgeSpec[] = ladder('sites', 'place', 'compass', [
  [5, 'bronze', 'Five dive sites', 'Five places, five stories.'],
  [10, 'silver', 'Ten dive sites', 'Ten different places under the surface.'],
  [25, 'gold', 'Twenty-five dive sites', 'A map full of pins.'],
  [50, 'gold', 'Fifty dive sites', 'Fifty places you can say you have dived.'],
], (count) => ({ type: 'sites', count }));

const COUNTRIES: BadgeSpec[] = ladder('countries', 'place', 'globe', [
  [3, 'bronze', 'Three countries', 'You have dived in three countries.'],
  [5, 'silver', 'Five countries', 'Five countries: a well-stamped logbook.'],
], (count) => ({ type: 'countries', count }));

const REGIONS: BadgeSpec[] = [
  { id: 'region-great-barrier-reef', title: 'Great Barrier Reef', description: 'You have dived the largest coral reef system on Earth.', kind: 'place', emblem: 'reef', rule: { type: 'region', region: 'great-barrier-reef' } },
  { id: 'region-red-sea', title: 'Red Sea', description: 'Clear water, hard corals and old wrecks: you have dived the Red Sea.', kind: 'place', emblem: 'wave', rule: { type: 'region', region: 'red-sea' } },
];

const GBR_SITES: BadgeSpec[] = ladder('gbr-sites', 'place', 'reef', [
  [5, 'bronze', 'GBR wanderer', 'Five sites on the Great Barrier Reef.'],
  [15, 'silver', 'GBR explorer', 'Fifteen sites across the Great Barrier Reef.'],
  [40, 'gold', 'GBR veteran', 'Forty sites: the Great Barrier Reef knows your fins.'],
], (count) => ({ type: 'region-sites', region: 'great-barrier-reef', count }));

const RED_SEA_SITES: BadgeSpec[] = ladder('red-sea-sites', 'place', 'wave', [
  [5, 'bronze', 'Red Sea wanderer', 'Five sites in the Red Sea.'],
  [15, 'silver', 'Red Sea explorer', 'Fifteen sites across the Red Sea.'],
  [40, 'gold', 'Red Sea veteran', 'Forty sites: the Red Sea knows your fins.'],
], (count) => ({ type: 'region-sites', region: 'red-sea', count }));

const COLLECTION_BADGES: BadgeSpec[] = COLLECTIONS.map((c) => ({
  id: `collection-${c.id}`,
  title: c.badge.title,
  description: c.badge.description,
  kind: 'collection',
  emblem: c.emblem,
  rule: { type: 'collection', collectionId: c.id },
}));

const SPECS: readonly BadgeSpec[] = [
  ...FIRSTS, ...SPECIES_COUNT, ...DIVE_NUMBERS, ...SITES, ...COUNTRIES, ...REGIONS, ...GBR_SITES, ...RED_SEA_SITES, ...COLLECTION_BADGES,
];

/**
 * Every badge there is, in the order they are listed: the firsts, the milestones, the places, then
 * one for completing each collection. (A collection badge is left out of the results while the
 * catalog cannot fill its collection.)
 */
export const BADGES: readonly BadgeDefinition[] = SPECS.map(({ rule: _rule, ...definition }) => definition);

/** How the diver stands with one badge. */
export interface BadgeResult extends BadgeDefinition {
  earned: boolean;
  /** yyyy-mm-dd the requirement was first met, worked out from the days things happened, not from when they were logged. */
  earnedOn?: string;
  /** `have` is held at `need` once earned, so `have / need` is always a fraction of a bar. */
  progress: { have: number; need: number };
  /** The next step, while the badge is not earned: "3 more reef sharks". */
  hint?: string;
  /** The archipelago area of an area collection's badge (its medal takes the area's colour and animal); absent on every other badge. */
  areaId?: AreaId;
}

type Judgement = Pick<BadgeResult, 'earned' | 'earnedOn' | 'progress' | 'hint' | 'areaId'>;

function judged(have: number, need: number, earnedOn: string | undefined, hint: string): Judgement {
  const progress = { have: Math.min(have, need), need };
  return have >= need ? { earned: true, earnedOn, progress } : { earned: false, progress, hint };
}

/** A badge that needs one thing: earned on the day it first happened. */
const once = (on: string | undefined, hint: string) => judged(on === undefined ? 0 : 1, 1, on, hint);

const an = (word: string) => (/^[aeiou]/i.test(word) ? `an ${word}` : `a ${word}`);

function judge(rule: BadgeRule, facts: Facts, collections: ReadonlyMap<string, CollectionResult>): Judgement | null {
  const { finds, dives } = facts;
  switch (rule.type) {
    case 'sighting':
      return once(facts.sightings[0]?.sightedOn, 'Log your first sighting.');
    case 'category':
      return once(finds.find((f) => f.species.category === rule.category)?.on, `Log your first ${rule.noun}.`);
    case 'rarity': {
      const tier = RARITY_LABEL[rule.atLeast].toLowerCase();
      const find = finds.find((f) => rarityRank(facts.rarityOf(f.species)) >= rarityRank(rule.atLeast));
      return once(find?.on, `Find ${an(tier)} animal${rule.atLeast === 'legendary' ? '' : ' or better'}.`);
    }
    case 'species':
      return judged(finds.length, rule.count, finds[rule.count - 1]?.on, moreOf(rule.count - finds.length, ['species', 'species']));
    case 'dive-kind': {
      const dive = dives.find((d) => (d.kinds ?? []).includes(rule.kind) || (rule.kind === 'wreck' && !!facts.placeOf(d.siteId)?.site.diveTypes?.includes('wreck')));
      return once(dive?.divedOn, `Log a ${rule.kind} dive.`);
    }
    case 'dive-number': {
      const dive = dives.find((d) => d.number >= rule.number);
      return judged(facts.maxDiveNumber, rule.number, dive?.divedOn, rule.number === 1 ? 'Log your first dive.' : moreOf(rule.number - facts.maxDiveNumber, ['dive', 'dives']));
    }
    case 'sites':
      return judged(facts.siteDates.length, rule.count, facts.siteDates[rule.count - 1], moreOf(rule.count - facts.siteDates.length, ['dive site', 'dive sites']));
    case 'countries':
      return judged(facts.countryDates.length, rule.count, facts.countryDates[rule.count - 1], moreOf(rule.count - facts.countryDates.length, ['country', 'countries']));
    case 'region': {
      const dates = facts.regionDates[rule.region];
      return once(dates[0], `Dive any ${REGION_BADGES[rule.region].name} site.`);
    }
    case 'region-sites': {
      const dates = facts.regionDates[rule.region];
      const name = REGION_BADGES[rule.region].name;
      return judged(dates.length, rule.count, dates[rule.count - 1], moreOf(rule.count - dates.length, [`${name} site`, `${name} sites`]));
    }
    case 'collection': {
      const collection = collections.get(rule.collectionId);
      if (!collection) return null;
      const judgement = judged(collection.found, collection.total, collection.completedOn, collection.hint ?? '');
      return collection.areaId ? { ...judgement, areaId: collection.areaId } : judgement;
    }
  }
}

/** Every badge with the diver's standing, given the collections worked out from the same input. */
export function badgesFrom(facts: Facts, collections: readonly CollectionResult[]): BadgeResult[] {
  const byId = new Map(collections.map((c) => [c.id, c]));
  const results: BadgeResult[] = [];
  for (const { rule, ...definition } of SPECS) {
    const judgement = judge(rule, facts, byId);
    if (judgement) results.push({ ...definition, ...judgement });
  }
  return results;
}

/** The badges earned now that were not in `previousIds`, in the order they are listed (for a celebration). */
export function newlyEarned(previousIds: readonly string[], now: readonly BadgeResult[]): BadgeResult[] {
  const before = new Set(previousIds);
  return now.filter((badge) => badge.earned && !before.has(badge.id));
}

/** The ids of the badges earned: what to remember as celebrated, to pass as `previousIds` next time. */
export function earnedIds(badges: readonly BadgeResult[]): string[] {
  return badges.filter((badge) => badge.earned).map((badge) => badge.id);
}
