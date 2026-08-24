import type { DexEntry, Sighting, Species } from '@/lib/types';
import { rarityRank } from '@/lib/rarity';

/**
 * Derive the species collection ("dex") from a user's sightings.
 * Entries are sorted rarest-first, then by most recently seen.
 */
export function deriveDex(sightings: Sighting[], speciesById: Map<string, Species>): DexEntry[] {
  const bySpecies = new Map<string, Sighting[]>();
  for (const s of sightings) {
    const list = bySpecies.get(s.speciesId);
    if (list) list.push(s);
    else bySpecies.set(s.speciesId, [s]);
  }

  const entries: DexEntry[] = [];
  for (const [speciesId, list] of bySpecies) {
    const species = speciesById.get(speciesId);
    if (!species) continue; // sighting of a species we no longer know about
    const sorted = [...list].sort((a, b) => a.sightedOn.localeCompare(b.sightedOn));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    entries.push({
      species,
      count: list.length,
      firstSeenOn: first.sightedOn,
      firstSeenSiteId: first.siteId,
      lastSeenOn: last.sightedOn,
    });
  }

  return entries.sort((a, b) => {
    const rarity = rarityRank(b.species.rarity) - rarityRank(a.species.rarity);
    if (rarity !== 0) return rarity;
    return b.lastSeenOn.localeCompare(a.lastSeenOn);
  });
}

/** True when the user has never logged this species before. */
export function isFirstOfSpecies(sightings: Sighting[], speciesId: string): boolean {
  return !sightings.some((s) => s.speciesId === speciesId);
}
