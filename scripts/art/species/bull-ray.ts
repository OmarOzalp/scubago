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
  // A broad, rounded diamond whose wings end in swept-back, pointed tips behind a gently concave rear edge.
  leading: [[0, .19], [.05, .188], [.1, .178], [.2, .14], [.3, .075], [.4, -.01], [.45, -.09], [.48, -.19], [.5, -.285]],
  trailing: [[0, -.25], [.06, -.245], [.12, -.236], [.2, -.226], [.3, -.218], [.37, -.226], [.43, -.248], [.47, -.268], [.5, -.285]],
  thickness: [[0, .082], [.04, .077], [.07, .06], [.1, .04], [.15, .024], [.25, .013], [.35, .008], [.45, .005], [.5, .002]],
  lift: [[0, .004], [.08, .002], [.15, 0], [.5, .004]],
  // A flat, broad head with a bulging brow, drawn out into a rounded, slightly spatulate duck's bill.
  head: [[.1, .05, .026, .022], [.15, .068, .032, .024], [.19, .078, .035, .022], [.23, .074, .026, .018], [.26, .068, .018, .014],
    [.29, .06, .012, .01], [.315, .05, .009, .007], [.335, .036, .006, .005]],
  headShape: .6,
  eye: { x: .078, y: .021, z: .19, r: .0105 },
  iris: hex('#8a7a45'), lid: hex('#6e684f'),
  spiracle: { x: .112, z: .152, length: .034, color: hex('#2f2d24') },
  spine: { height: .018, length: .1, at: .1 },
  colors: { top: TOP, tip: TIP, belly: BELLY, margin: MARGIN, mouth: hex('#4a4a42'), gill: hex('#a9ada3'), eye: hex('#07090a'), tail: hex('#5d5848'), spine: hex('#a89f86'), snout: hex('#938a6c') },
  tail: { start: -.255, length: .92, radius: .0085, dorsal: .018 },
  // Olive-brown, a little paler along the midline and over the head, darkening toward the wing margins.
  topAt: (x, u, z) => mix(mix(TOP, hex('#8b8466'), (1 - smoothstep(.04, .2, Math.abs(x))) * .55), TIP, smoothstep(.28, .5, Math.abs(x)) + .25 * smoothstep(.8, 1, u)),
  markings: (h: Helpers) => {
    // Faint pale bars across the back, from the midline out over the wings, each curving a little back toward the tips.
    const bars = [.135, .08, .025, -.03, -.085, -.14, -.19];
    for (const z0 of bars) {
      let line: (readonly [number, number])[] = [];
      const flush = () => {
        if (line.length > 3) h.decal(line, true, (t) => .0058 * Math.sin(Math.PI * (.04 + .92 * t)) ** .5, BAR);
        line = [];
      };
      for (let i = -14; i <= 14; i++) {
        const x = i / 14 * .42, a = Math.abs(x);
        const z = z0 - .42 * a * a;
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
