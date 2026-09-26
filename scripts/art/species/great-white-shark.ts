/**
 * Great white shark (Carcharodon carcharias): a conical, pointed snout; a deep,
 * stout torpedo body; a tall triangular first dorsal; long triangular pectorals
 * with black tips underneath; a flattened, strongly keeled caudal peduncle and a
 * near-symmetrical crescent tail. Slate gray above, white below, split by a
 * crisp, jagged line along the flanks.
 */
import { Vector3 } from 'three';
import { SWIM_RIGS, type SharkRig } from '../../../src/lib/marine-rigs';
import { hex, mix, noise, smoothstep } from './kit';
import { sharkContext, type SharkDesign } from './shark';

const TOP = hex('#66727a'), DARK = hex('#56626a'), BELLY = hex('#f4f5f1');
const TIP = hex('#1c2124'), GILL = hex('#48535a'), EYE = hex('#07090a'), MOUTH = hex('#565d60');

const rig = SWIM_RIGS['great-white-shark'] as SharkRig;

/** The irregular gray/white line: high over the jaw, mid-flank along the body, jagged throughout. */
function boundary(s: number) {
  return 1.5 + .12 * smoothstep(.12, .3, s) + .1 * smoothstep(.45, .75, s)
    + .06 * Math.sin(s * 64 + .6) + .045 * noise(s * 22, 8);
}

export const GREAT_WHITE_SHARK: SharkDesign = {
  rig, nose: .4, bodyEnd: .8,
  width: [[0, 0], [.01, .014], [.025, .026], [.05, .041], [.09, .056], [.14, .068], [.2, .077], [.27, .083], [.34, .085], [.42, .08], [.5, .069], [.58, .054], [.65, .038], [.71, .026], [.76, .018], [.8, .011]],
  top: [[0, 0], [.01, .011], [.025, .021], [.05, .033], [.09, .047], [.14, .061], [.2, .075], [.27, .087], [.34, .093], [.42, .088], [.5, .076], [.58, .059], [.65, .041], [.71, .026], [.76, .016], [.8, .012]],
  bottom: [[0, 0], [.01, .009], [.025, .016], [.05, .025], [.09, .035], [.14, .047], [.2, .059], [.27, .07], [.34, .075], [.42, .071], [.5, .061], [.58, .047], [.65, .032], [.71, .02], [.76, .013], [.8, .011]],
  center: [[0, .001], [.08, 0], [.2, 0], [.4, .002], [.6, .004], [.8, .007]],
  squareTop: [[0, 2], [.1, 2.05], [.3, 2.1], [.6, 2.1], [.8, 2]],
  squareBottom: [[0, 2.1], [.1, 2.3], [.3, 2.4], [.6, 2.2], [.8, 2]],
  keel: [[.63, 0], [.69, .008], [.745, .013], [.78, .007], [.8, 0]],
  rings: 42, columnsAbove: 7, columnsBelow: 5,
  boundary, boundaryGap: .018,
  paint: (s, theta) => {
    const white = theta > boundary(s) ? 1 : 0;
    return mix(mix(TOP, DARK, smoothstep(.2, 1.2, theta) * .5), BELLY, white);
  },
};

export function buildGreatWhiteShark() {
  const ctx = sharkContext(GREAT_WHITE_SHARK);
  const { mesh, bones } = ctx;
  ctx.body();
  const finColor = (_p: Vector3, _v: number, u: number) => mix(TOP, DARK, .3 + .2 * u);
  const dorsal = ctx.midlineFin({
    le: [[-.012, .31], [0, .315], [.03, .329], [.07, .349], [.1, .364], [.116, .374]],
    te: [[-.012, .425], [0, .43], [.006, .434], [.02, .418], [.05, .401], [.085, .387], [.116, .374]],
    height: .116, thickness: .02, bone: 'Dorsal', color: finColor,
  });
  ctx.midlineFin({
    le: [[-.008, .672], [0, .675], [.012, .686], [.019, .694]],
    te: [[-.008, .7], [0, .702], [.005, .705], [.013, .698], [.019, .694]],
    height: .019, thickness: .006, stations: 4, color: finColor,
  });
  ctx.midlineFin({
    le: [[-.008, .688], [0, .69], [.011, .7], [.017, .707]],
    te: [[-.008, .713], [0, .715], [.005, .717], [.012, .71], [.017, .707]],
    height: .017, thickness: .006, stations: 4, ventral: true,
    color: (_p, v) => mix(BELLY, TOP, .15 + .3 * v),
  });
  // Long triangular pectorals: gray above, white below with dark tips.
  const pectorals = ctx.pairedFin({
    rootS: .215, theta: 1.95, span: .175, droop: .34, sweep: .14, thickness: .02,
    le: [[-.015, 0], [0, 0], [.04, .016], [.09, .043], [.13, .07], [.16, .094], [.175, .108]],
    te: [[-.015, .092], [0, .095], [.04, .097], [.08, .099], [.12, .102], [.155, .105], [.175, .108]],
    bone: (left) => (left ? 'PectoralL' : 'PectoralR'),
    color: (_p, v, u, _left, face) => (face > 0 ? mix(TOP, DARK, .25 + .1 * u) : mix(BELLY, TIP, smoothstep(.62, .8, v + .12 * u))),
  });
  ctx.pairedFin({
    rootS: .515, theta: 2.35, span: .05, droop: .85, sweep: .12, thickness: .009, stations: 5,
    le: [[-.01, 0], [0, 0], [.025, .014], [.05, .036]],
    te: [[-.01, .046], [0, .047], [.025, .044], [.042, .04], [.05, .036]],
    color: (_p, v, _u, _left, face) => (face > 0 ? mix(TOP, DARK, .2) : mix(BELLY, TOP, .2 * v)),
  });
  const axis = ctx.center(rig.joints[4]);
  // Crescent tail: lobes of nearly equal size meeting at a shallow fork.
  const tail = ctx.caudalFin({
    low: axis - .132, high: axis + .156,
    le: [[axis - .132, .965], [axis - .1, .918], [axis - .062, .862], [axis - .03, .818], [axis - .012, .794], [axis + .002, .783], [axis + .016, .79], [axis + .045, .83], [axis + .085, .89], [axis + .123, .947], [axis + .146, .982], [axis + .156, 1]],
    te: [[axis - .132, .965], [axis - .1, .957], [axis - .062, .932], [axis - .028, .9], [axis + .002, .878], [axis + .032, .906], [axis + .072, .946], [axis + .112, .976], [axis + .142, .994], [axis + .156, 1]],
    thickness: (y) => .004 + .02 * Math.max(0, 1 - Math.abs(y - axis) / .12) ** 1.2,
    upperPivot: .05, lowerPivot: .045, stations: 18,
    color: (_p, _v, u) => mix(TOP, DARK, .35 + .2 * u),
  });
  ctx.eyes({ s: .068, theta: 1.2, radius: .0074, color: EYE, sink: .35 });
  ctx.gills({ from: .168, to: .224, count: 5, top: 1.28, bottom: 2.08, halfWidth: .0017, slant: .008, color: GILL });
  ctx.ribbon(Array.from({ length: 9 }, (_, i) => {
    const t = i / 8, theta = Math.PI + (t - .5) * 1.45;
    return [.072 + .032 * (2 * t - 1) ** 2, theta] as const;
  }), (t) => .0018 * (.5 + .5 * Math.sin(Math.PI * t)), MOUTH);
  // Dark "armpit" spot behind each pectoral base.
  for (const side of [1, -1]) ctx.spot(.305, side * 2.18, .01, TIP, 1.4);

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

