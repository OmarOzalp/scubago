import { CATALOG_BY_ID } from './catalog';
import { marineModelFor, type MarineModel } from './swimming';

export const MARINE_ART: Record<MarineModel, { name: string; caption: string }> = {
  'whale-shark': { name: 'Whale shark', caption: 'A stylized whale shark with a broad, flattened head, a wide mouth at the front, and pale spots between pale lines on its dark back. It swims with slow, sweeping strokes of its tail.' },
  'tiger-shark': { name: 'Tiger shark', caption: 'A stylized tiger shark with a broad, blunt snout, a heavy front body, a long upper tail lobe and dark bars along its back and sides. Its tail drives it forward while its head stays steady.' },
  'great-white-shark': { name: 'Great white shark', caption: 'A stylized great white shark with a pointed snout, a tall triangular dorsal fin, a crescent tail and a sharp line between its gray back and white belly. Its stiff body is driven by powerful beats of its tail.' },
  'mola-mola': { name: 'Ocean sunfish', caption: 'A stylized ocean sunfish: a tall, flattened, almost round body that ends abruptly in a scalloped rudder, a tall dorsal fin above and a matching anal fin below, tiny pectoral fins, a small beaked mouth and mottled blue-gray skin. It sculls slowly with its dorsal and anal fins while its body stays stiff.' },
  'green-turtle': { name: 'Green sea turtle', caption: 'A stylized green sea turtle: a low, heart-shaped olive-brown shell made of angular plates, a pale underside, a small blunt head, long swept-back front flippers and small rear flippers. It flies through the water with slow strokes of its front flippers, gliding between bouts.' },
  'reef-manta': { name: 'Reef manta ray', caption: 'A stylized reef manta ray with broad, flexible wings, rolled cephalic fins, pale shoulder patches and a white underside. Each wingbeat ripples outward toward the wing tips.' },
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
