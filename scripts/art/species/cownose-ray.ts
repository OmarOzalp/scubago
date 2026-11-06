/**
 * Cownose ray (Rhinoptera bonasus): a golden-brown eagle ray of western Atlantic shallows, in schools.
 * A kite-shaped disc of long, pointed, swept-back wings (concave rear edge) behind a broad, flat,
 * projecting head whose snout is notched into two rounded lobes, the "cow nose", with the eyes out on
 * the sides of it; a long, thin tail with a small dorsal fin and a spine at its base. Plain golden
 * brown to olive-brown above (no spots), white below.
 */
import { buildEagleRay, type EagleRayDesign } from './eagle-rays';
import { hex, mix, smoothstep } from './kit';

const TOP = hex('#8c7043'), TIP = hex('#6c5430'), BELLY = hex('#f2eee2'), MARGIN = hex('#a18a62');

export const COWNOSE_RAY: EagleRayDesign = {
  // A kite: a raked leading edge sweeping back to a long, sharply pointed tip, a strongly concave trailing edge.
  leading: [[0, .185], [.04, .183], [.07, .176], [.12, .158], [.2, .11], [.28, .045], [.35, -.04], [.41, -.13], [.45, -.22], [.48, -.3], [.5, -.36]],
  trailing: [[0, -.25], [.04, -.249], [.08, -.243], [.14, -.232], [.22, -.222], [.3, -.224], [.37, -.244], [.43, -.28], [.47, -.322], [.5, -.36]],
  thickness: [[0, .07], [.04, .066], [.07, .05], [.1, .034], [.15, .02], [.25, .011], [.35, .007], [.45, .004], [.5, .002]],
  lift: [[0, .004], [.08, .002], [.15, 0], [.5, .004]],
  // A broad, flat head jutting out in front of the disc, its snout notched into two rounded lobes.
  head: [[.1, .05, .022, .02], [.15, .07, .026, .02], [.19, .082, .026, .018], [.22, .086, .02, .016], [.245, .082, .015, .013],
    [.265, .076, .011, .01], [.282, .066, .008, .008], [.296, .054, .006, .006], [.304, .04, .005, .005]],
  headShape: .55,
  notch: { depth: .05, width: .05, from: .245 },
  eye: { x: .088, y: .016, z: .19, r: .0105 },
  iris: hex('#7a6232'), lid: hex('#85694a'),
  spiracle: { x: .12, z: .152, length: .032, color: hex('#3a2c18') },
  spine: { height: .016, length: .085, at: .1 },
  colors: { top: TOP, tip: TIP, belly: BELLY, margin: MARGIN, mouth: hex('#4d4538'), gill: hex('#b0a68e'), eye: hex('#07090a'), tail: hex('#6c5530'), spine: hex('#b9ab88') },
  tail: { start: -.255, length: .95, radius: .0075, dorsal: .02 },
  // Golden brown, a little paler over the head and along the midline, darkening toward the pointed tips.
  topAt: (x, u) => mix(mix(TOP, hex('#a98147'), (1 - smoothstep(.04, .2, Math.abs(x))) * .5), TIP, smoothstep(.3, .5, Math.abs(x)) + .2 * smoothstep(.8, 1, u)),
};

export function buildCownoseRay() {
  return buildEagleRay(COWNOSE_RAY);
}
