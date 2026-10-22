/**
 * Blacktip reef shark (Carcharhinus melanopterus): the small, quick shark of the sand flats and reef
 * edges. A trim, slim body behind a short, bluntly rounded snout, with large oval eyes; a fairly tall,
 * falcate first dorsal fin whose tip is a bold, ink-black cap set off by a pale band just below it,
 * and large second dorsal and anal fins; sickle pectorals; a heterocercal tail with a long upper
 * lobe. Light brownish grey above, white below, a pale wedge pushing forward along the flank above
 * the pelvics into the darker side. Every fin is tipped black: the pectorals, pelvics, second dorsal
 * and anal fins, both caudal lobes, and the caudal fin's trailing edge.
 */
import { hex, mix, noise, smoothstep, type RGB } from './kit';
import { crisp, eyeball, markedFins, nostrilsAndFurrows, outline, precaudalPits } from './reef-sharks';
import { sharkContext, type SharkDesign } from './shark';
import { SWIM_RIGS, type SharkRig } from '../../../src/lib/marine-rigs';

// Body: light brownish grey on the back, a paler tan-grey flank, a white belly.
const BACK = hex('#8c806a'), FLANK = hex('#a49882'), BELLY = hex('#f4f1e9');
// Fins: the body's brownish grey, a pale band below the dorsal's tip, and the ink-black tips.
const FIN = hex('#887c66'), FIN_PALE = hex('#a89c86'), FIN_UNDER = hex('#efebe0'), BAND = hex('#f2eee2'), BLACK = hex('#0d0d0b');
const GILL = hex('#4f4a3e'), MOUTH = hex('#5c574a'), EYE = hex('#06080a'), IRIS = hex('#5c4825'), LID = hex('#7d7360');

const rig = SWIM_RIGS['blacktip-reef-shark'] as SharkRig;

/** The pale flank wedge: its tip reaches forward above the pectorals, it is widest over the pelvics, and it ends abruptly behind them. */
const wedge = (s: number) => smoothstep(.26, .5, s) * (1 - smoothstep(.58, .74, s));

/** Where the brownish back meets the white belly: low on the flank, lifted high by the wedge. */
const boundary = (s: number) => 1.72 + .08 * smoothstep(.06, .26, s) - .66 * wedge(s) + .03 * noise(s * 14, 3);

const skinColor = (s: number, theta: number): RGB => {
  const upper = mix(BACK, FLANK, smoothstep(.2, 1.45, theta));
  return mix(upper, BELLY, smoothstep(boundary(s) - .03, boundary(s) + .03, theta));
};

export const BLACKTIP_REEF_SHARK: SharkDesign = {
  rig, nose: .4, bodyEnd: .8,
  // A short, bluntly rounded snout, a slim torpedo body and a slender tail stock.
  width: [[0, 0], [.003, .018], [.01, .032], [.02, .042], [.035, .05], [.055, .056], [.08, .06], [.12, .064], [.16, .066], [.22, .068], [.29, .068], [.36, .064], [.44, .057], [.52, .048], [.6, .038], [.66, .03], [.72, .022], [.77, .015], [.8, .0095]],
  top: [[0, 0], [.003, .014], [.01, .026], [.02, .034], [.035, .042], [.055, .049], [.08, .055], [.12, .062], [.16, .068], [.22, .074], [.29, .077], [.36, .075], [.44, .068], [.52, .058], [.6, .046], [.66, .035], [.72, .026], [.77, .019], [.8, .014]],
  bottom: [[0, 0], [.003, .011], [.01, .02], [.02, .027], [.035, .034], [.055, .04], [.08, .046], [.12, .052], [.16, .057], [.22, .061], [.29, .062], [.36, .06], [.44, .054], [.52, .046], [.6, .037], [.66, .029], [.72, .022], [.77, .017], [.8, .0135]],
  center: [[0, -.006], [.04, -.003], [.1, 0], [.2, 0], [.4, .002], [.6, .004], [.8, .006]],
  squareTop: [[0, 2], [.1, 2.05], [.3, 2.1], [.6, 2.05], [.8, 2]],
  squareBottom: [[0, 2.1], [.1, 2.25], [.3, 2.35], [.6, 2.2], [.8, 2]],
  rings: 44, columnsAbove: 7, columnsBelow: 5,
  boundary, boundaryGap: .025,
  paint: (s, theta) => skinColor(s, theta),
};

export function buildBlacktipReefShark() {
  const ctx = sharkContext(BLACKTIP_REEF_SHARK);
  const { mesh, bones } = ctx;
  const fins = markedFins(ctx);
  ctx.body();

  /** Brownish grey, paler toward the front edge (standing fins are lit from the side, so they get a paler tone). */
  const grey = (u: number) => mix(FIN, FIN_PALE, .25 + .3 * (1 - u));
  /** A fin tipped black above `edge`; `both` also blackens the underside (a pectoral's tip is black on both faces). */
  const tipped = (base: RGB, a: number, edge: number) => mix(base, BLACK, crisp(edge, a));

  // The first dorsal: tall and falcate, a raked front edge, a concave rear edge ending in a free tip.
  // Its top fifth is ink black, with a pale band just below.
  const dorsal = fins.midline({
    ...outline(.126, (t) => [.312 + .074 * t ** 1.15, .386 + .034 * (1 - t) ** 2.2 + .02 * Math.sqrt(1 - t) * t ** 8]),
    height: .126, thickness: .017, bone: 'Dorsal', stations: 7, edges: [.56, .74],
    color: (_p, t, u) => tipped(mix(grey(u), BAND, crisp(.56, t)), t, .74),
  });
  // Large second dorsal and anal fins, each with a long slender rear tip and a black tip.
  fins.midline({
    ...outline(.04, (t) => [.642 + .04 * t ** 1.1, .684 + .03 * (1 - t) ** 2 + .012 * Math.sqrt(1 - t) * t ** 6], .008),
    height: .04, thickness: .008, stations: 3, edges: [.5],
    color: (_p, t, u) => tipped(grey(u), t, .5),
  });
  fins.midline({
    ...outline(.038, (t) => [.632 + .04 * t ** 1.1, .672 + .03 * (1 - t) ** 2 + .012 * Math.sqrt(1 - t) * t ** 6], .008),
    height: .038, thickness: .008, stations: 3, ventral: true, edges: [.5],
    color: (_p, t, u) => tipped(mix(FIN_UNDER, FIN_PALE, .25 * (1 - u)), t, .5),
  });
  // Sickle pectorals with black tips, above and below.
  const pectorals = fins.paired({
    rootS: .205, theta: 2, span: .15, droop: .32, sweep: .1, thickness: .015, stations: 8, edges: [.68],
    ...outline(.15, (t) => {
      const b = t * .15;
      const front = .45 * b + 11 * b ** 3;
      return [front, front + .074 * (1 - t) ** 1.2 + .012 * Math.exp(-(((t - .12) / .1) ** 2)) + .028 * Math.sqrt(1 - t) * t ** 3];
    }, 0),
    bone: (left) => (left ? 'PectoralL' : 'PectoralR'),
    color: (_p, v, u, _left, face) => tipped(face > 0 ? grey(u) : mix(FIN_UNDER, FIN_PALE, .15 * v), v, .68),
  });
  // Pelvic fins with a short, blunt, black tip.
  fins.paired({
    rootS: .5, theta: 2.4, span: .055, droop: .8, sweep: .15, thickness: .009, stations: 5, edges: [.5],
    ...outline(.055, (t) => {
      const front = .03 * (.4 * t + .6 * t ** 2);
      return [front, front + .054 * (1 - t) ** .6];
    }, 0),
    color: (_p, v, u, _left, face) => tipped(face > 0 ? grey(u) : mix(FIN_UNDER, FIN_PALE, .2 * v), v, .5),
  });
  const axis = ctx.center(rig.joints[4]);
  // A heterocercal tail, a little smaller than a grey reef's: both lobe tips and the whole trailing
  // edge are black.
  const tail = fins.caudal({
    low: axis - .095, high: axis + .178, rear: .016, edges: [axis - .05, axis + .12],
    le: [[axis - .095, .94], [axis - .074, .905], [axis - .048, .862], [axis - .024, .824], [axis - .008, .8], [axis + .006, .79], [axis + .02, .797], [axis + .05, .832], [axis + .088, .875], [axis + .12, .915], [axis + .14, .94], [axis + .153, .958], [axis + .16, .97], [axis + .178, 1]],
    te: [[axis - .095, .94], [axis - .074, .934], [axis - .048, .915], [axis - .024, .892], [axis + .004, .872], [axis + .03, .886], [axis + .062, .91], [axis + .095, .935], [axis + .12, .955], [axis + .14, .972], [axis + .146, .977], [axis + .153, .969], [axis + .16, .978], [axis + .178, 1]],
    thickness: (y) => .004 + .018 * Math.max(0, 1 - Math.abs(y - axis) / .115) ** 1.2,
    upperPivot: .05, lowerPivot: .04, stations: 18,
    color: (p, y, u, _face, info) => {
      const base = mix(FIN, FIN_PALE, .25 + .2 * (1 - u) - (p.y < axis ? .1 : 0));
      const black = Math.max(info.rear, crisp(axis + .12, y, .002), 1 - crisp(axis - .05, y, .002));
      return mix(base, BLACK, black);
    },
  });
  // Large oval eyes.
  for (const side of [1, -1]) eyeball(ctx, .07, side * 1.3, .0092, { pupil: EYE, iris: IRIS, lid: LID }, { squash: .82 });
  ctx.gills({ from: .152, to: .205, count: 5, top: 1.3, bottom: 2, halfWidth: .0015, slant: .007, color: GILL });
  // A broad, shallow arc of a mouth under the blunt snout.
  ctx.ribbon(Array.from({ length: 9 }, (_, i) => {
    const t = i / 8, theta = Math.PI + (t - .5) * 1.9;
    return [.07 + .02 * (2 * t - 1) ** 2, theta] as const;
  }), (t) => .0016 * (.5 + .5 * Math.sin(Math.PI * t)), MOUTH);

  nostrilsAndFurrows(ctx, { nostril: .024, corner: .09, spread: .95, color: MOUTH });
  precaudalPits(ctx, mix(BACK, FIN, .5), mix(BELLY, FIN, .35));

  ctx.spineBones();
  bones.push(
    { name: 'TailUpper', parent: 'Tail', position: tail.upper },
    { name: 'TailLower', parent: 'Tail', position: tail.lower },
    { name: 'Dorsal', parent: rig.dorsalParent, position: dorsal.base },
    { name: 'PectoralL', parent: 'Root', position: pectorals[0] },
    { name: 'PectoralR', parent: 'Root', position: pectorals[1] },
  );
  return { mesh, bones };
}
