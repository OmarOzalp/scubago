/**
 * Bull ray (Aetomylaeus bovinus): a big, heavy eagle ray of the Mediterranean and eastern Atlantic and
 * Indian coasts. A broad, rounded-diamond disc (wings only slightly swept back, tips blunt) behind a
 * short, blunt, duck-bill-like head with a bulging brow, set apart from the disc by a shallow neck;
 * eyes on the sides of the head; a very long, thin whip of a tail with a tiny dorsal fin and a long
 * spine. Olive-brown to grey above, crossed by faint pale bluish bars from the midline out over the
 * wings; white below with dusky wing margins.
 */
import type { Helpers } from './eagle-rays';
import { buildEagleRay, type EagleRayDesign } from './eagle-rays';
import { hex, mix, smoothstep } from './kit';

const TOP = hex('#7f775d'), TIP = hex('#645e48'), BAR = hex('#a9ae96'), BELLY = hex('#f3f1e8'), MARGIN = hex('#8b8573');

export const BULL_RAY: EagleRayDesign = {
  // A broad, rounded diamond: the tips only a little behind the middle of the disc, the trailing edge nearly straight.
  leading: [[0, .19], [.04, .188], [.07, .182], [.12, .166], [.2, .128], [.28, .082], [.35, .03], [.41, -.03], [.45, -.075], [.48, -.115], [.5, -.15]],
  trailing: [[0, -.27], [.04, -.268], [.08, -.262], [.14, -.25], [.22, -.232], [.3, -.215], [.37, -.2], [.43, -.185], [.47, -.168], [.5, -.15]],
  thickness: [[0, .082], [.04, .077], [.07, .06], [.1, .04], [.15, .024], [.25, .013], [.35, .008], [.45, .005], [.5, .002]],
  lift: [[0, .004], [.08, .002], [.15, 0], [.5, -.012]],
  // A short, broad head with a bulging brow and a blunt, rounded bill.
  head: [[.11, .062, .04, .034], [.15, .072, .052, .034], [.185, .076, .056, .032], [.215, .07, .046, .028], [.24, .06, .032, .022],
    [.258, .05, .02, .016], [.27, .04, .012, .011], [.28, .029, .008, .008], [.287, .017, .006, .005]],
  headShape: .7,
  eye: { x: .073, y: .03, z: .182, r: .0085 },
  colors: { top: TOP, tip: TIP, belly: BELLY, margin: MARGIN, mouth: hex('#4a4a42'), gill: hex('#a9ada3'), eye: hex('#07090a'), tail: hex('#5d5848'), spine: hex('#a89f86'), snout: hex('#938a6c') },
  tail: { start: -.275, length: .92, radius: .0085, dorsal: .018 },
  // Olive-brown, a little paler along the midline and over the head, darkening toward the wing margins.
  topAt: (x, u, z) => mix(mix(TOP, hex('#8b8466'), (1 - smoothstep(.04, .2, Math.abs(x))) * .55), TIP, smoothstep(.28, .5, Math.abs(x)) + .25 * smoothstep(.8, 1, u)),
  markings: (h: Helpers) => {
    // Faint pale bars across the back, from the midline out over the wings, each curving a little back toward the tips.
    const bars = [.12, .06, 0, -.06, -.12, -.17];
    for (const z0 of bars) {
      let line: (readonly [number, number])[] = [];
      const flush = () => {
        if (line.length > 3) h.decal(line, true, (t) => .0048 * Math.sin(Math.PI * (.04 + .92 * t)) ** .5, BAR);
        line = [];
      };
      for (let i = -14; i <= 14; i++) {
        const x = i / 14 * .42, a = Math.abs(x);
        const z = z0 - .08 * a * a;
        const le = h.leadingEdge(a), te = h.trailingEdge(a);
        const u = (le - z) / (le - te);
        if (u > .06 && u < .94 && !(a < .06 && z > .09)) line.push([x, u]);
        else flush();
      }
      flush();
    }
  },
};

export function buildBullRay() {
  return buildEagleRay(BULL_RAY);
}
