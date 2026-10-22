/**
 * The rewards engine (docs/rewards.md): badges, collections, the site passport and island unlocks,
 * all worked out from a diver's sightings and dives. Pure functions of their input, with no store,
 * storage or UI, so the same input always gives the same rewards. Screens call `evaluateRewards`
 * (or one `evaluate*`), and `newlyEarned` to find what to celebrate.
 */
import { badgesFrom, type BadgeResult } from '@/lib/rewards/badges';
import { collectionsFrom, type CollectionResult } from '@/lib/rewards/collections';
import { buildFacts } from '@/lib/rewards/facts';
import { islandsFrom, type IslandResult } from '@/lib/rewards/islands';
import { passportFrom, type PassportGroup } from '@/lib/rewards/passport';
import type { RewardsInput } from '@/lib/rewards/types';

export { BADGES, earnedIds, newlyEarned } from '@/lib/rewards/badges';
export type { BadgeDefinition, BadgeKind, BadgeResult, BadgeTier } from '@/lib/rewards/badges';
export { COLLECTIONS } from '@/lib/rewards/collections';
export type { CollectionDefinition, CollectionKind, CollectionResult } from '@/lib/rewards/collections';
export { effectiveRarity } from '@/lib/rewards/effective-rarity';
export type { IslandResult, IslandTarget } from '@/lib/rewards/islands';
export { siteStamp } from '@/lib/rewards/passport';
export type { PassportGroup, PassportStamp } from '@/lib/rewards/passport';
export { REGION_BADGES } from '@/lib/rewards/places';
export type { RegionBadgeId } from '@/lib/rewards/places';
export type { Emblem, RewardsInput } from '@/lib/rewards/types';

/** All four rewards for one input. */
export interface Rewards {
  badges: BadgeResult[];
  collections: CollectionResult[];
  passport: PassportGroup[];
  islands: IslandResult[];
}

/** Every reward in one call, sharing one pass over the input. */
export function evaluateRewards(input: RewardsInput): Rewards {
  const facts = buildFacts(input);
  const collections = collectionsFrom(facts);
  return { badges: badgesFrom(facts, collections), collections, passport: passportFrom(facts), islands: islandsFrom(facts) };
}

/** Every badge with the diver's standing (see `BadgeResult`). */
export function evaluateBadges(input: RewardsInput): BadgeResult[] {
  const facts = buildFacts(input);
  return badgesFrom(facts, collectionsFrom(facts));
}

/** Every collection the catalog can fill, with the diver's progress. */
export function evaluateCollections(input: RewardsInput): CollectionResult[] {
  return collectionsFrom(buildFacts(input));
}

/** The site passport: visited sites grouped by top-level region (else country). */
export function evaluatePassport(input: RewardsInput): PassportGroup[] {
  return passportFrom(buildFacts(input));
}

/** Each island of the archipelago: unlocked or not, its residents found, and what to look for next. */
export function evaluateIslands(input: RewardsInput): IslandResult[] {
  return islandsFrom(buildFacts(input));
}
