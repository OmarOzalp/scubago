import { CATALOG_BY_ID } from './catalog';
import { marineModelFor, type MarineModel } from './swimming';

export const MARINE_ART: Record<MarineModel, { name: string; caption: string }> = {
  'whale-shark': { name: 'Whale shark', caption: 'A stylized whale shark with a broad, flattened head and pale spots and subtle lines along its sides.' },
  'tiger-shark': { name: 'Tiger shark', caption: 'A stylized tiger shark with a broad snout and dark bars along its sides.' },
  'reef-manta': { name: 'Reef manta ray', caption: 'A stylized reef manta ray with broad wings, paired cephalic fins, and a pale underside.' },
  shark: { name: 'Shark family representative', caption: 'A stylized shark used for species that do not yet have their own model. Its shape and markings do not identify a particular species.' },
  manta: { name: 'Ray family representative', caption: 'A stylized manta-shaped representative used for rays that do not yet have their own model. Its shape and markings do not identify a particular species.' },
  'reef-fish': { name: 'Fish family representative', caption: 'A stylized reef fish used for fish that do not yet have their own model. Its shape and markings do not identify a particular species.' },
};

/** A species query is authoritative; invalid or unsupported queries show no model. */
export function inspectionModel(params: { species?: string | string[]; model?: string | string[] }): MarineModel | null {
  if (params.species !== undefined) {
    const species = typeof params.species === 'string' ? CATALOG_BY_ID.get(params.species) : undefined;
    return species ? marineModelFor(species) : null;
  }
  return typeof params.model === 'string' && Object.hasOwn(MARINE_ART, params.model) ? params.model as MarineModel : null;
}
