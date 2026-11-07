/**
 * Nurse shark (Ginglymostoma cirratum): a stout, nearly cylindrical, plain tan-brown carpet shark. A broad,
 * flattened head with a rounded snout, tiny eyes set on its sides with a spiracle behind each, a small
 * mouth underneath, and a short barbel at each nostril; five small gill slits, the last two over the
 * pectoral base; broad, rounded pectoral fins; two rounded dorsal fins of nearly the same size set far
 * back (the first over the pelvic fins); big pelvic fins; a small anal fin; and a tail with a long upper
 * lobe and almost no lower one. Yellowish tan to brown above, paler underneath.
 */
import { Vector3 } from 'three';
import { SWIM_RIGS, type SharkRig } from '../../../src/lib/marine-rigs';
import { hex, mix, noise, smoothstep, type RGB } from './kit';
import { crisp, eyeball, markedFins, outline, precaudalPits } from './reef-sharks';
import { barbel, slit } from './carpet-sharks';
import { sharkContext, type SharkDesign } from './shark';

// A dark grey-brown above (not olive), a touch warmer on the flank, a pale buff belly.
const BACK = hex('#665c4b'), FLANK = hex('#766b57'), BELLY = hex('#c3b9a0');
const FIN = hex('#554c3c'), FIN_PALE = hex('#6a604d'), FIN_UNDER = hex('#b3a98f'), EDGE = hex('#7e725b');
const GILL = hex('#352b1d'), MOUTH = hex('#3c3023'), BARBEL = hex('#a89873'), BARBEL_TIP = hex('#c7b992');
const EYE = hex('#0a0a08'), IRIS = hex('#7a6e4c'), LID = hex('#bdb398'), SPIRACLE = hex('#2e251a');

const rig = SWIM_RIGS['nurse-shark'] as SharkRig;

/** Where the brown back meets the cream belly: low on the flank, a touch wavy. */
const boundary = (s: number) => 1.9 + .06 * smoothstep(.05, .3, s) + .03 * noise(s * 11, 5);

const skinColor = (s: number, theta: number): RGB => {
  // A slightly paler, golden flank, and the faintest mottling so the plain skin is not flat.
  const upper = mix(mix(BACK, FLANK, smoothstep(.3, 1.7, theta)), BACK, .35 * (.5 + .5 * noise(s * 26 + theta * 3, 2)));
  return mix(upper, BELLY, smoothstep(boundary(s) - .04, boundary(s) + .04, theta));
};

export const NURSE_SHARK: SharkDesign = {
  rig, nose: .4, bodyEnd: .76, frontDome: .006,
  // From above the head is a wedge: the sides run straight in toward the snout, which is cut off square (a flat front the
  // width of a hand), then a thick round trunk and a stock that thins early so the tail is long.
  width: [[0, .018], [.006, .02], [.03, .03], [.06, .042], [.1, .058], [.14, .072], [.18, .08], [.2, .082], [.28, .08], [.36, .074], [.44, .064], [.5, .052], [.56, .04], [.62, .029], [.68, .02], [.72, .014], [.76, .008]],
  top: [[0, .013], [.01, .02], [.03, .031], [.06, .042], [.1, .055], [.14, .064], [.2, .072], [.28, .076], [.36, .074], [.44, .067], [.5, .057], [.56, .045], [.62, .036], [.68, .028], [.72, .022], [.76, .014]],
  bottom: [[0, .012], [.01, .018], [.03, .027], [.06, .037], [.1, .048], [.14, .057], [.2, .064], [.28, .068], [.36, .067], [.44, .061], [.5, .052], [.56, .04], [.62, .032], [.68, .025], [.72, .019], [.76, .012]],
  center: [[0, -.012], [.04, -.008], [.1, -.002], [.2, 0], [.4, .002], [.6, .004], [.8, .006]],
  squareTop: [[0, 3.4], [.06, 3], [.14, 2.5], [.25, 2.2], [.6, 2.1], [.76, 2]],
  squareBottom: [[0, 3.4], [.06, 3], [.14, 2.7], [.3, 2.4], [.6, 2.2], [.76, 2]],
  rings: 62, columnsAbove: 10, columnsBelow: 6,
  boundary, boundaryGap: .03,
  paint: (s, theta) => skinColor(s, theta),
};

/** A pointed, swept-back fin outline for `outline()`: the leading edge sweeps back by `lean` to a sharp tip, the rear edge is hollow. */
const pointFin = (centre: number, base: number, lean: number, hollow = 1.7) => (t: number): [number, number] => {
  const start = centre - base / 2, tip = start + lean;
  return [start + lean * t ** 1.25, tip + (centre + base / 2 - tip) * (1 - t) ** hollow];
};

export function buildNurseShark() {
  const ctx = sharkContext(NURSE_SHARK);
  const { mesh, bones } = ctx;
  const fins = markedFins(ctx);
  ctx.body();

  const tone = (u: number) => mix(FIN, FIN_PALE, .2 + .35 * (1 - u));

  // The first dorsal: rounded, set well back over the pelvic fins; the second is a little smaller, close behind it.
  const dorsal = fins.midline({
    ...outline(.108, pointFin(.425, .092, .05)),
    height: .108, thickness: .02, bone: 'Dorsal', stations: 7,
    color: (_p, t, u) => mix(tone(u), EDGE, .25 * crisp(.88, t)),
  });
  fins.midline({
    ...outline(.076, pointFin(.612, .07, .036), .008),
    height: .076, thickness: .014, stations: 6,
    color: (_p, t, u) => mix(tone(u), EDGE, .25 * crisp(.88, t)),
  });
  // A small anal fin, a little behind the second dorsal.
  fins.midline({
    ...outline(.044, pointFin(.642, .048, .022), .008),
    height: .044, thickness: .011, stations: 5, ventral: true,
    color: (_p, _t, u) => mix(mix(FIN_UNDER, FIN_PALE, .3 * (1 - u)), tone(u), .35),
  });
  // Pectorals: a broad base, then a blade that sweeps back toward the tail to a sharp tip, the rear edge hollow.
  const pectorals = fins.paired({
    rootS: .2, theta: 2.0, span: .135, droop: .42, sweep: .42, thickness: .019, stations: 9,
    ...outline(.135, (t) => {
      const lead = .012 + .1 * t ** 1.2, tip = .2;
      return [lead, tip + (.135 - tip) * (1 - t) ** 1.8];
    }, 0),
    bone: (left) => (left ? 'PectoralL' : 'PectoralR'),
    color: (_p, v, u, _left, face) => (face > 0 ? tone(u) : mix(FIN_UNDER, FIN_PALE, .25 * v)),
  });
  // Pelvic fins: the same shape, smaller.
  fins.paired({
    rootS: .46, theta: 2.4, span: .082, droop: .4, sweep: .3, thickness: .014, stations: 5,
    ...outline(.082, (t) => {
      const lead = .008 + .06 * t ** 1.2, tip = .1;
      return [lead, tip + (.085 - tip) * (1 - t) ** 1.8];
    }, 0),
    color: (_p, v, u, _left, face) => (face > 0 ? tone(u) : mix(FIN_UNDER, FIN_PALE, .25 * v)),
  });
  const axis = ctx.center(rig.joints[4]);
  // The tail: a long, slender upper lobe sweeping up and back behind the body (about a third of the length) with a small notch
  // near its tip and almost no lower lobe, the front edge running straight on from the belly.
  const tail = fins.caudal({
    low: axis - .024, high: axis + .09, edges: [axis + .07],
    le: [[axis - .024, .665], [axis - .008, .68], [axis + .004, .715], [axis + .02, .79], [axis + .04, .875], [axis + .065, .945], [axis + .09, .995]],
    te: [[axis - .024, .75], [axis - .012, .8], [axis + .004, .885], [axis + .025, .945], [axis + .04, .92], [axis + .06, .975], [axis + .09, 1]],
    thickness: (y) => .004 + .018 * Math.max(0, 1 - (y - axis + .024) / .114) ** 1.3,
    upperPivot: .035, lowerPivot: .02, stations: 18,
    color: (p, y, u) => mix(mix(FIN, FIN_PALE, .25 + .2 * (1 - u)), EDGE, .25 * crisp(axis + .07, y, .004) + (p.y < axis ? .1 : 0)),
  });

  // Tiny eyes on the sides of the head, each with a spiracle just behind it.
  for (const side of [1, -1]) {
    eyeball(ctx, .088, side * 1.18, .0095, { pupil: EYE, iris: IRIS, lid: LID }, { squash: .85, height: .4 });
    // A pale brow of skin over the eye, and the spiracle behind it: a short dark slit in a paler lip.
    ctx.ribbon(Array.from({ length: 7 }, (_, i) => [.088 + .011 * (i / 6 - .5) * 1.4, side * (1.18 - .045 + .02 * Math.sin(Math.PI * i / 6))] as const), (t) => .0016 * Math.sin(Math.PI * (.1 + .8 * t)), mix(LID, FLANK, .4), .0006);
    slit(ctx, .122, side * .98, .02, .0042, mix(FLANK, BACK, .5), .0008);
    slit(ctx, .122, side * .98, .015, .0028, SPIRACLE, .0012);
  }
  ctx.gills({ from: .152, to: .206, count: 5, top: 1.3, bottom: 1.95, halfWidth: .0014, slant: .006, color: GILL });
  // A small, nearly straight mouth under the snout: a paler lip all round it, a dark line where it closes, and
  // the folds running back from each corner.
  const curve = (w: number) => Array.from({ length: 11 }, (_, i) => {
    const t = i / 10, theta = Math.PI + (t - .5) * w;
    return [.058 + .008 * (2 * t - 1) ** 2, theta] as const;
  });
  ctx.ribbon(curve(1.3), (t) => .0042 * (.55 + .45 * Math.sin(Math.PI * t)), mix(BELLY, BACK, .45), .0007);
  ctx.ribbon(curve(1.1), (t) => .0017 * (.5 + .5 * Math.sin(Math.PI * t)), MOUTH, .0012);
  for (const side of [1, -1]) {
    ctx.ribbon([[.06, side * (Math.PI - .6)], [.066, side * (Math.PI - .72)], [.075, side * (Math.PI - .82)]], (t) => .0011 * Math.sin(Math.PI * (.1 + .8 * t)) ** .5, MOUTH, .001);
  }
  // The short barbel at each nostril, hanging down and forward from the front of the snout's underside.
  for (const side of [1, -1]) {
    barbel(ctx, .026, side * (Math.PI - .55), new Vector3(side * .1, -.5, 1), .036, .017, BARBEL, BARBEL_TIP, -.003);
    ctx.ribbon(Array.from({ length: 5 }, (_, i) => [.036 + .016 * i / 4, side * (Math.PI - .66 - .1 * i / 4)] as const),
      (t) => .0017 * Math.sin(Math.PI * (.12 + .76 * t)) ** .6, GILL, .001);
  }

  precaudalPits(ctx, mix(BACK, FIN, .5), mix(BELLY, FIN, .35), .7);

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
