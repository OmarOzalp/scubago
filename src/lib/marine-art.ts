import { CATALOG_BY_ID } from './catalog';
import { marineModelFor, type MarineModel } from './swimming';

export const MARINE_ART: Record<MarineModel, { name: string; caption: string }> = {
  'whale-shark': { name: 'Whale shark', caption: 'A stylized whale shark with a broad, flattened head, a wide mouth at the front, and pale spots between pale lines on its dark back. It swims with slow, sweeping strokes of its tail.' },
  'tiger-shark': { name: 'Tiger shark', caption: 'A stylized tiger shark with a broad, blunt snout, a heavy front body, a long upper tail lobe and dark bars along its back and sides. Its tail drives it forward while its head stays steady.' },
  'great-white-shark': { name: 'Great white shark', caption: 'A stylized great white shark with a pointed snout, a tall triangular dorsal fin, a crescent tail and a sharp line between its gray back and white belly. Its stiff body is driven by powerful beats of its tail.' },
  'scalloped-hammerhead': { name: 'Scalloped hammerhead', caption: 'A stylized scalloped hammerhead: a wide, flat, hammer-shaped head with an arched, scalloped front edge and an eye at each tip, a lean bronze-gray body with a pale belly, a tall sickle-shaped dorsal fin and a long upper tail lobe. Its body sways smoothly toward the tail while its head stays steady.' },
  'bottlenose-dolphin': { name: 'Bottlenose dolphin', caption: 'A stylized bottlenose dolphin: a streamlined gray body with a darker back and a pale belly, a short beak below a rounded forehead, a curved dorsal fin, pointed flippers and horizontal tail flukes. It swims by beating its flukes up and down while its head stays level.' },
  'mola-mola': { name: 'Ocean sunfish', caption: 'A stylized ocean sunfish: a tall, flattened, almost round body that ends abruptly in a scalloped rudder, a tall dorsal fin above and a matching anal fin below, tiny pectoral fins, a small beaked mouth and mottled blue-gray skin. It sculls slowly with its dorsal and anal fins while its body stays stiff.' },
  'green-turtle': { name: 'Green sea turtle', caption: 'A stylized green sea turtle: a low, heart-shaped olive-brown shell made of angular plates, a pale underside, a small blunt head, long swept-back front flippers and small rear flippers. It flies through the water with slow strokes of its front flippers, gliding between bouts.' },
  'reef-manta': { name: 'Reef manta ray', caption: 'A stylized reef manta ray with broad, flexible wings, rolled cephalic fins, pale shoulder patches and a white underside. Each wingbeat ripples outward toward the wing tips.' },
  'day-octopus': { name: 'Day octopus', caption: 'A stylized day octopus: a rounded head with raised eyes and a soft mantle behind it, eight tapering arms spread from a webbed crown, mottled reddish-brown skin with darker blotches and pale spots, and a lighter underside with pale suckers. It walks over the seabed on its arms, each moving in its own rhythm, rests coiled beside a rock, and now and then jets a short way mantle first with its arms trailing.' },
  'giant-cuttlefish': { name: 'Giant cuttlefish', caption: 'A stylized giant cuttlefish: a broad, flattened oval mantle edged by a continuous fin, large eyes and short arms held together in front, warm tan and cream with dark mottling. Ripples run along the fin around its body as it hovers and glides; now and then it jets backward with its arms trailing, its pattern turning darker and bolder.' },
  'giant-moray': { name: 'Giant moray', caption: 'A stylized giant moray eel: a long, muscular body with a continuous fin along its back, a broad head with a deep jaw held slightly open, small eyes, and dark green-brown skin with lighter mottling. It rests in a crevice with its head out, its mouth slowly opening and closing as it breathes, and swims to another den nearby with waves running down its whole body.' },
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
