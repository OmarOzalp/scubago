import { RARITY_ORDER } from '@/lib/rarity';
import type { Rarity, Species } from '@/lib/types';

/**
 * The rarity a reward should use for a species: the tier worked out from real public sightings
 * records when there is one, else the catalog's own. A tier that is not one of the five (data that
 * did not come through the types) is ignored rather than trusted.
 */
export function effectiveRarity(species: Pick<Species, 'id' | 'rarity'>, observed?: ReadonlyMap<string, Rarity>): Rarity {
  const tier = observed?.get(species.id);
  return tier && RARITY_ORDER.includes(tier) ? tier : species.rarity;
}
