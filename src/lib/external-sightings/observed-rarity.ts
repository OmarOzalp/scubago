import type { Rarity, Species } from '@/lib/types';
import type { SiteSightings } from '@/lib/external-sightings/types';

/**
 * Rarity from real records: how many of the summarised dive sites an animal was recorded at.
 *
 * The share of sites is the fraction of summarised sites with at least one iNaturalist observation
 * or OBIS record of the species inside the search radius. These are the cut-offs (a species gets
 * the first tier whose `minShare` its share reaches):
 *
 *   common     at 25% of sites or more
 *   uncommon   10% to under 25%
 *   rare       4% to under 10%
 *   epic       1.5% to under 4%
 *   legendary  under 1.5%, but recorded at least once
 *
 * They are first guesses, picked so that with the 69 seeded sites a species seen at one site is
 * legendary and one seen at 18 or more is common. Tune them once real data is in; the shape of the
 * code does not depend on the numbers.
 */
export const RARITY_THRESHOLDS: readonly { tier: Rarity; minShare: number }[] = [
  { tier: 'common', minShare: 0.25 },
  { tier: 'uncommon', minShare: 0.1 },
  { tier: 'rare', minShare: 0.04 },
  { tier: 'epic', minShare: 0.015 },
  { tier: 'legendary', minShare: 0 },
];

/** Fewer summarised sites than this and the map stays empty: the catalogue's own tiers stand. */
export const MIN_SITES_FOR_OBSERVED_RARITY = 10;

export interface ObservedRarity {
  tier: Rarity;
  /** Sites where the species was recorded, as a fraction (0..1) of the sites summarised. */
  share: number;
  /** How many sites it was recorded at. */
  sites: number;
}

export interface ObservedRarityOptions {
  /** Count only these sites, for example a region's. Others are ignored. */
  siteIds?: Iterable<string>;
  /** Override MIN_SITES_FOR_OBSERVED_RARITY. */
  minSites?: number;
}

/** The tier a share of sites earns. */
export function tierForShare(share: number): Rarity {
  for (const { tier, minShare } of RARITY_THRESHOLDS) {
    if (share >= minShare) return tier;
  }
  return 'legendary';
}

/** A summary counts when at least one of its sources answered. */
function hasData(summary: SiteSightings): boolean {
  return summary.sources.some((source) => source.ok);
}

/**
 * The observed rarity of each catalogue species that was recorded at least once.
 *
 * - Only summaries with an answering source count, once per site (the newest, if a site repeats),
 *   and only the sites in `options.siteIds` when it is given.
 * - Fewer than `minSites` such sites gives an empty map.
 * - A species recorded at no site is left out: no records in this data says the data is thin, not
 *   that the animal is rare, so its catalogue tier stands.
 */
export function observedRarity(
  summaries: Iterable<SiteSightings>,
  catalog: readonly Pick<Species, 'id'>[],
  options: ObservedRarityOptions = {},
): Map<string, ObservedRarity> {
  const scope = options.siteIds ? new Set(options.siteIds) : undefined;
  const bySite = new Map<string, SiteSightings>();
  for (const summary of summaries) {
    if (scope && !scope.has(summary.siteId)) continue;
    if (!hasData(summary)) continue;
    const held = bySite.get(summary.siteId);
    if (!held || held.fetchedAt < summary.fetchedAt) bySite.set(summary.siteId, summary);
  }

  const result = new Map<string, ObservedRarity>();
  const total = bySite.size;
  if (total === 0 || total < (options.minSites ?? MIN_SITES_FOR_OBSERVED_RARITY)) return result;

  const sitesBySpecies = new Map<string, number>();
  for (const summary of bySite.values()) {
    for (const id of new Set(summary.species.map((entry) => entry.speciesId))) {
      sitesBySpecies.set(id, (sitesBySpecies.get(id) ?? 0) + 1);
    }
  }
  for (const { id } of catalog) {
    const sites = sitesBySpecies.get(id);
    if (!sites) continue;
    const share = sites / total;
    result.set(id, { tier: tierForShare(share), share, sites });
  }
  return result;
}

/**
 * Just the tiers, in the shape the rewards engine takes: species id to rarity. Species without
 * enough data are absent, and the caller falls back to the catalogue's tier for them.
 */
export function observedTiers(
  summaries: Iterable<SiteSightings>,
  catalog: readonly Pick<Species, 'id'>[],
  options: ObservedRarityOptions = {},
): ReadonlyMap<string, Rarity> {
  const tiers = new Map<string, Rarity>();
  for (const [id, { tier }] of observedRarity(summaries, catalog, options)) tiers.set(id, tier);
  return tiers;
}
