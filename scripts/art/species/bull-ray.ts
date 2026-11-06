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
  // A flattened diamond: a nearly straight, only slightly convex leading edge running diagonally back from the head
  // to sharp tips at about the middle of the disc's length, and a gently concave rear edge (disc about 1.9 times as wide as long).
  leading: [[0, .21], [.05, .193], [.1, .174], [.2, .128], [.3, .066], [.4, -.03], [.45, -.07], [.48, -.095], [.5, -.115]],
  trailing: [[0, -.31], [.06, -.306], [.12, -.297], [.2, -.276], [.3, -.238], [.38, -.195], [.44, -.16], [.48, -.135], [.5, -.115]],
  thickness: [[0, .082], [.04, .077], [.07, .06], [.1, .04], [.15, .024], [.25, .013], [.35, .008], [.45, .005], [.5, .002]],
  lift: [[0, .004], [.08, .002], [.15, 0], [.5, .004]],
  // A flat, broad head, a little wider than long, flaring slightly toward a rounded, spatulate front, the brow bulging over the eyes.
  head: [[.1, .05, .026, .022], [.15, .075, .03, .022], [.2, .09, .032, .02], [.23, .092, .024, .016], [.26, .088, .016, .012],
    [.285, .078, .011, .009], [.3, .06, .008, .006], [.31, .04, .005, .004]],
  headShape: .6,
  eye: { x: .094, y: .022, z: .2, r: .0125 },
  iris: hex('#8a7a45'), lid: hex('#6e684f'),
  spiracle: { x: .125, z: .108, length: .034, color: hex('#2f2d24') },
  spine: { height: .018, length: .1, at: .1 },
  colors: { top: TOP, tip: TIP, belly: BELLY, margin: MARGIN, mouth: hex('#4a4a42'), gill: hex('#a9ada3'), eye: hex('#07090a'), tail: hex('#5d5848'), spine: hex('#a89f86'), snout: hex('#938a6c') },
  tail: { start: -.315, length: .92, radius: .0085, dorsal: .018 },
  // Olive-brown, a little paler along the midline and over the head, darkening toward the wing margins.
  topAt: (x, u, z) => mix(mix(TOP, hex('#8b8466'), (1 - smoothstep(.04, .2, Math.abs(x))) * .55), TIP, smoothstep(.28, .5, Math.abs(x)) + .25 * smoothstep(.8, 1, u)),
  markings: (h: Helpers) => {
    // Faint pale bars across the back, from the midline out over the wings, each curving a little back toward the tips.
    const bars = [.15, .095, .04, -.015, -.07, -.125, -.18, -.235];
    for (const z0 of bars) {
      let line: (readonly [number, number])[] = [];
      const flush = () => {
        if (line.length > 3) h.decal(line, true, (t) => .0058 * Math.sin(Math.PI * (.04 + .92 * t)) ** .5, BAR);
        line = [];
      };
      for (let i = -14; i <= 14; i++) {
        const x = i / 14 * .42, a = Math.abs(x);
        const z = z0 - .3 * a * a;
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
