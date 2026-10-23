/**
 * Oceanic whitetip shark (Carcharhinus longimanus): a stocky body behind a short, bluntly rounded
 * snout; a very tall first dorsal fin with a broadly rounded top; enormous, long, broad pectoral fins
 * with rounded tips, held out like wings; a heterocercal tail with a long upper lobe. Bronze grey
 * above, white below, and every big fin (the dorsal, the pectorals, both lobes of the tail) tipped
 * with mottled white, as the name says.
 */
import { Vector3 } from 'three';
import { SWIM_RIGS, type SharkRig } from '../../../src/lib/marine-rigs';
import { hex, mix, noise, smoothstep, type RGB } from './kit';
import { sharkContext, type SharkDesign } from './shark';

const TOP = hex('#6e6c60'), DARK = hex('#5f5e54'), BELLY = hex('#f2f2ec'), TIP = hex('#f7f5ee');
const GILL = hex('#4e4d45'), EYE = hex('#07090a'), MOUTH = hex('#5a5a52');

const rig = SWIM_RIGS['oceanic-whitetip'] as SharkRig;

/** Where the bronze back meets the white belly: a little wavy along the flank. */
const boundary = (s: number) => 1.55 + .1 * smoothstep(.12, .3, s) + .08 * smoothstep(.45, .75, s) + .04 * noise(s * 18, 3);

/** The white tips: mottled where the fin's colour gives way to white near its tip (`v`, 0 at the root and 1 at the tip). */
const tipped = (base: RGB, v: number, p: Vector3, from = .58) =>
  mix(base, TIP, smoothstep(from, from + .05, v + .07 * noise(p.x * 90 + p.z * 70, 4) + .05 * noise(p.y * 120, 9)));

export const OCEANIC_WHITETIP: SharkDesign = {
  rig, nose: .4, bodyEnd: .8,
  // Blunt, rounded snout; a deep, stocky body; a slim tail stock.
  width: [[0, 0], [.01, .02], [.025, .033], [.05, .046], [.09, .059], [.14, .07], [.2, .078], [.27, .083], [.34, .084], [.42, .078], [.5, .067], [.58, .052], [.65, .037], [.71, .025], [.76, .017], [.8, .011]],
  top: [[0, 0], [.01, .014], [.025, .025], [.05, .036], [.09, .049], [.14, .062], [.2, .075], [.27, .086], [.34, .091], [.42, .086], [.5, .074], [.58, .057], [.65, .04], [.71, .026], [.76, .017], [.8, .012]],
  bottom: [[0, 0], [.01, .011], [.025, .019], [.05, .028], [.09, .038], [.14, .049], [.2, .06], [.27, .07], [.34, .074], [.42, .07], [.5, .06], [.58, .046], [.65, .031], [.71, .02], [.76, .013], [.8, .011]],
  center: [[0, -.002], [.08, 0], [.2, 0], [.4, .002], [.6, .004], [.8, .006]],
  squareTop: [[0, 2], [.1, 2.05], [.3, 2.1], [.6, 2.05], [.8, 2]],
  squareBottom: [[0, 2.1], [.1, 2.25], [.3, 2.35], [.6, 2.2], [.8, 2]],
  rings: 42, columnsAbove: 7, columnsBelow: 5,
  boundary, boundaryGap: .03,
  paint: (s, theta) => mix(mix(TOP, DARK, smoothstep(.2, 1.2, theta) * .5), BELLY, smoothstep(boundary(s) - .03, boundary(s) + .03, theta)),
};

export function buildOceanicWhitetip() {
  const ctx = sharkContext(OCEANIC_WHITETIP);
  const { mesh, bones } = ctx;
  ctx.body();
  const finColor = (p: Vector3, v: number, u: number) => tipped(mix(TOP, DARK, .3 + .2 * u), v, p);
  // The great first dorsal, its top broadly rounded: leading and trailing edges flatten as they meet.
  const dorsal = ctx.midlineFin({
    le: [[-.012, .295], [0, .3], [.04, .318], [.08, .338], [.11, .356], [.124, .392], [.133, .39]],
    te: [[-.012, .448], [0, .452], [.008, .455], [.04, .443], [.08, .428], [.11, .414], [.122, .41], [.133, .39]],
    height: .133, thickness: .022, bone: 'Dorsal', stations: 9, color: finColor,
  });
  // Small second dorsal and anal fins.
  ctx.midlineFin({
    le: [[-.008, .662], [0, .665], [.012, .676], [.018, .684]],
    te: [[-.008, .695], [0, .697], [.005, .7], [.012, .691], [.018, .684]],
    height: .018, thickness: .006, stations: 4, color: (_p, _v, u) => mix(TOP, DARK, .3 + .2 * u),
  });
  ctx.midlineFin({
    le: [[-.008, .672], [0, .675], [.011, .685], [.017, .693]],
    te: [[-.008, .703], [0, .705], [.005, .707], [.012, .699], [.017, .693]],
    height: .017, thickness: .006, stations: 4, ventral: true,
    color: (_p, v) => mix(BELLY, TOP, .15 + .3 * v),
  });
  // The enormous pectorals: long, broad paddles with rounded tips, white-tipped on both faces. The outline is a
  // swept mid-line with a half-chord that is wide at the root and closes in an ellipse at the tip.
  const pectoralEnd = .244;
  const chord = (x: number) => x <= .104 ? .125 - .17 * Math.max(0, x) : .108 * Math.sqrt(Math.max(0, 1 - ((x - .104) / (pectoralEnd - .104)) ** 2));
  const sweep = (x: number) => .054 + .31 * Math.max(0, x);
  const outline = [-.015, 0, .05, .104, .14, .17, .2, .22, .232, .24, pectoralEnd];
  const pectorals = ctx.pairedFin({
    rootS: .205, theta: 1.98, span: .229, droop: .2, sweep: .2, thickness: .021, stations: 11,
    le: outline.map((x) => [x, sweep(x) - chord(x) / 2] as const),
    te: outline.map((x) => [x, sweep(x) + chord(x) / 2] as const),
    bone: (left) => (left ? 'PectoralL' : 'PectoralR'),
    color: (p, v, u, _left, face) => tipped(face > 0 ? mix(TOP, DARK, .25 + .1 * u) : mix(BELLY, TOP, .25 * (1 - v)), v, p, .5),
  });
  // Pelvic fins, white-tipped too.
  ctx.pairedFin({
    rootS: .51, theta: 2.35, span: .05, droop: .8, sweep: .12, thickness: .009, stations: 5,
    le: [[-.01, 0], [0, 0], [.025, .014], [.05, .036]],
    te: [[-.01, .046], [0, .047], [.025, .044], [.042, .04], [.05, .036]],
    color: (p, v, _u, _left, face) => tipped(face > 0 ? mix(TOP, DARK, .2) : mix(BELLY, TOP, .2 * v), v, p, .5),
  });
  const axis = ctx.center(rig.joints[4]);
  // A heterocercal tail: the upper lobe long and pointed, the lower shorter; both tips white.
  const tail = ctx.caudalFin({
    low: axis - .1, high: axis + .17,
    le: [[axis - .1, .935], [axis - .075, .9], [axis - .045, .858], [axis - .02, .82], [axis - .006, .8], [axis + .006, .79], [axis + .02, .797], [axis + .05, .835], [axis + .09, .89], [axis + .13, .95], [axis + .157, .99], [axis + .17, 1.01]],
    te: [[axis - .1, .935], [axis - .075, .93], [axis - .045, .912], [axis - .02, .89], [axis + .004, .872], [axis + .03, .892], [axis + .065, .92], [axis + .1, .952], [axis + .14, .985], [axis + .17, 1.01]],
    thickness: (y) => .004 + .02 * Math.max(0, 1 - Math.abs(y - axis) / .12) ** 1.2,
    upperPivot: .05, lowerPivot: .04, stations: 18,
    color: (p, _v, u) => {
      const base = mix(TOP, DARK, .35 + .2 * u);
      const reach = (p.y - axis) / .17, low = (axis - p.y) / .1;
      return tipped(base, Math.max(reach, low), p, .55);
    },
  });
  ctx.eyes({ s: .062, theta: 1.25, radius: .0078, color: EYE, sink: .3 });
  ctx.gills({ from: .162, to: .215, count: 5, top: 1.3, bottom: 2.05, halfWidth: .0016, slant: .007, color: GILL });
  ctx.ribbon(Array.from({ length: 9 }, (_, i) => {
    const t = i / 8, theta = Math.PI + (t - .5) * 1.35;
    return [.066 + .026 * (2 * t - 1) ** 2, theta] as const;
  }), (t) => .0017 * (.5 + .5 * Math.sin(Math.PI * t)), MOUTH);

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
