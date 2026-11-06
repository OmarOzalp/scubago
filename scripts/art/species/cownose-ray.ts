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
  // A kite: a straight, raked leading edge to a pointed, swept-back tip, a concave trailing edge.
  leading: [[0, .185], [.04, .183], [.07, .176], [.12, .158], [.2, .115], [.28, .06], [.35, -.01], [.41, -.09], [.45, -.17], [.48, -.23], [.5, -.28]],
  trailing: [[0, -.25], [.04, -.249], [.08, -.244], [.14, -.236], [.22, -.228], [.3, -.226], [.37, -.236], [.43, -.25], [.47, -.267], [.5, -.28]],
  thickness: [[0, .07], [.04, .066], [.07, .05], [.1, .034], [.15, .02], [.25, .011], [.35, .007], [.45, .004], [.5, .002]],
  lift: [[0, .004], [.08, .002], [.15, 0], [.5, -.012]],
  // A broad, flat head jutting out in front of the disc, its snout notched into two lobes.
  head: [[.1, .05, .022, .02], [.15, .07, .026, .02], [.19, .08, .024, .018], [.22, .08, .02, .016], [.245, .074, .015, .013],
    [.265, .066, .011, .01], [.282, .054, .008, .008], [.296, .04, .006, .006], [.304, .026, .005, .005]],
  headShape: .55,
  notch: { depth: .03, width: .04, from: .25 },
  eye: { x: .08, y: .016, z: .19, r: .0085 },
  colors: { top: TOP, tip: TIP, belly: BELLY, margin: MARGIN, mouth: hex('#4d4538'), gill: hex('#b0a68e'), eye: hex('#07090a'), tail: hex('#6c5530'), spine: hex('#b9ab88') },
  tail: { start: -.255, length: .95, radius: .0075, dorsal: .02 },
  // Golden brown, a little paler over the head and along the midline, darkening toward the pointed tips.
  topAt: (x, u) => mix(mix(TOP, hex('#a98147'), (1 - smoothstep(.04, .2, Math.abs(x))) * .5), TIP, smoothstep(.3, .5, Math.abs(x)) + .2 * smoothstep(.8, 1, u)),
};

export function buildCownoseRay() {
  return buildEagleRay(COWNOSE_RAY);
}
