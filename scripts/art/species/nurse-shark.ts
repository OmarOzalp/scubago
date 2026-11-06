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
import { barbel, roundFin, slit } from './carpet-sharks';
import { sharkContext, type SharkDesign } from './shark';

// Warm yellowish brown above, a paler golden flank, a cream belly.
const BACK = hex('#80704f'), FLANK = hex('#95835c'), BELLY = hex('#d6cba9');
const FIN = hex('#75653f'), FIN_PALE = hex('#8c7850'), FIN_UNDER = hex('#cdbd96'), EDGE = hex('#a58d62');
const GILL = hex('#4a3a24'), MOUTH = hex('#4a3a28'), BARBEL = hex('#b49c6c'), BARBEL_TIP = hex('#cdb98a');
const EYE = hex('#0a0a08'), IRIS = hex('#4a3a1c'), LID = hex('#72603c'), SPIRACLE = hex('#3a2e1c');

const rig = SWIM_RIGS['nurse-shark'] as SharkRig;

/** Where the brown back meets the cream belly: low on the flank, a touch wavy. */
const boundary = (s: number) => 1.9 + .06 * smoothstep(.05, .3, s) + .03 * noise(s * 11, 5);

const skinColor = (s: number, theta: number): RGB => {
  // A slightly paler, golden flank, and the faintest mottling so the plain skin is not flat.
  const upper = mix(mix(BACK, FLANK, smoothstep(.3, 1.7, theta)), BACK, .35 * (.5 + .5 * noise(s * 26 + theta * 3, 2)));
  return mix(upper, BELLY, smoothstep(boundary(s) - .04, boundary(s) + .04, theta));
};

export const NURSE_SHARK: SharkDesign = {
  rig, nose: .4, bodyEnd: .8,
  // A broad, flat head and a rounded snout, a thick round trunk, then a stout tail stock.
  width: [[0, 0], [.003, .035], [.01, .054], [.024, .067], [.05, .076], [.09, .082], [.14, .081], [.2, .082], [.28, .08], [.36, .074], [.44, .064], [.52, .054], [.6, .044], [.68, .033], [.74, .024], [.8, .014]],
  top: [[0, 0], [.004, .01], [.012, .02], [.026, .03], [.05, .041], [.09, .054], [.14, .064], [.2, .072], [.28, .076], [.36, .074], [.44, .067], [.52, .052], [.6, .043], [.68, .033], [.74, .025], [.8, .016]],
  bottom: [[0, 0], [.004, .009], [.012, .017], [.026, .026], [.05, .036], [.09, .047], [.14, .057], [.2, .064], [.28, .068], [.36, .067], [.44, .061], [.52, .047], [.6, .039], [.68, .031], [.74, .024], [.8, .016]],
  center: [[0, -.012], [.04, -.008], [.1, -.002], [.2, 0], [.4, .002], [.6, .004], [.8, .006]],
  squareTop: [[0, 2.6], [.1, 2.5], [.25, 2.2], [.6, 2.1], [.8, 2]],
  squareBottom: [[0, 2.8], [.1, 2.6], [.3, 2.4], [.6, 2.2], [.8, 2]],
  rings: 48, columnsAbove: 8, columnsBelow: 5,
  boundary, boundaryGap: .03,
  paint: (s, theta) => skinColor(s, theta),
};

export function buildNurseShark() {
  const ctx = sharkContext(NURSE_SHARK);
  const { mesh, bones } = ctx;
  const fins = markedFins(ctx);
  ctx.body();

  const tone = (u: number) => mix(FIN, FIN_PALE, .2 + .35 * (1 - u));

  // The first dorsal: rounded, set well back over the pelvic fins; the second is a little smaller, close behind it.
  const dorsal = fins.midline({
    ...outline(.1, roundFin(.445, .03, .092, 1.5, .016)),
    height: .1, thickness: .02, bone: 'Dorsal', stations: 7,
    color: (_p, t, u) => mix(tone(u), EDGE, .25 * crisp(.88, t)),
  });
  fins.midline({
    ...outline(.072, roundFin(.625, .024, .075, 1.5, .014), .008),
    height: .075, thickness: .014, stations: 6,
    color: (_p, t, u) => mix(tone(u), EDGE, .25 * crisp(.88, t)),
  });
  // A small anal fin, a little behind the second dorsal.
  fins.midline({
    ...outline(.042, roundFin(.66, .012, .05, 2.2, .01), .008),
    height: .042, thickness: .011, stations: 5, ventral: true,
    color: (_p, _t, u) => mix(mix(FIN_UNDER, FIN_PALE, .3 * (1 - u)), tone(u), .35),
  });
  // Broad, rounded pectorals: a wide base and a blunt, rounded tip.
  const pectorals = fins.paired({
    rootS: .2, theta: 2.0, span: .125, droop: .55, sweep: .14, thickness: .02, stations: 8,
    ...outline(.125, (t) => {
      const b = t * .125;
      const front = .3 * b + 6 * b ** 3;
      return [front, front + .11 * Math.max(0, 1 - t ** 1.7) ** .8 + .01 * Math.exp(-(((t - .1) / .1) ** 2))];
    }, 0),
    bone: (left) => (left ? 'PectoralL' : 'PectoralR'),
    color: (_p, v, u, _left, face) => (face > 0 ? tone(u) : mix(FIN_UNDER, FIN_PALE, .25 * v)),
  });
  // Big, rounded pelvic fins.
  fins.paired({
    rootS: .47, theta: 2.4, span: .075, droop: .85, sweep: .12, thickness: .014, stations: 5,
    ...outline(.075, (t) => {
      const front = .015 * t;
      return [front, front + .085 * Math.sqrt(Math.max(0, 1 - t ** 2.4))];
    }, 0),
    color: (_p, v, u, _left, face) => (face > 0 ? tone(u) : mix(FIN_UNDER, FIN_PALE, .25 * v)),
  });
  const axis = ctx.center(rig.joints[4]);
  // The tail: one long, rounded upper lobe rising behind the body, almost no lower lobe.
  const tail = fins.caudal({
    low: axis - .03, high: axis + .092, edges: [axis + .07],
    le: [[axis - .03, .93], [axis - .022, .88], [axis - .01, .835], [axis + .004, .805], [axis + .025, .815], [axis + .05, .87], [axis + .072, .94], [axis + .085, .985], [axis + .092, 1]],
    te: [[axis - .03, .93], [axis - .022, .945], [axis - .01, .96], [axis + .01, .975], [axis + .04, .988], [axis + .07, .998], [axis + .092, 1]],
    thickness: (y) => .004 + .016 * Math.max(0, 1 - Math.abs(y - axis - .015) / .1) ** 1.1,
    upperPivot: .045, lowerPivot: .02, stations: 16,
    color: (p, y, u) => mix(mix(FIN, FIN_PALE, .25 + .2 * (1 - u)), EDGE, .25 * crisp(axis + .07, y, .004) + (p.y < axis ? .1 : 0)),
  });

  // Tiny eyes on the sides of the head, each with a spiracle just behind it.
  for (const side of [1, -1]) {
    eyeball(ctx, .088, side * 1.18, .0052, { pupil: EYE, iris: IRIS, lid: LID }, { squash: .9 });
    slit(ctx, .122, side * .98, .012, .0028, SPIRACLE);
  }
  ctx.gills({ from: .152, to: .206, count: 5, top: 1.3, bottom: 1.95, halfWidth: .0014, slant: .006, color: GILL });
  // A small, nearly straight mouth under the snout, with the nostril grooves running forward to the barbels.
  ctx.ribbon(Array.from({ length: 9 }, (_, i) => {
    const t = i / 8, theta = Math.PI + (t - .5) * 1.1;
    return [.058 + .008 * (2 * t - 1) ** 2, theta] as const;
  }), (t) => .0017 * (.5 + .5 * Math.sin(Math.PI * t)), MOUTH);
  // The short barbel at each nostril, hanging down and forward from the front of the snout's underside.
  for (const side of [1, -1]) {
    barbel(ctx, .026, side * (Math.PI - .55), new Vector3(side * .1, -.5, 1), .04, .011, BARBEL, BARBEL_TIP);
    ctx.ribbon(Array.from({ length: 5 }, (_, i) => [.036 + .016 * i / 4, side * (Math.PI - .66 - .1 * i / 4)] as const),
      (t) => .0017 * Math.sin(Math.PI * (.12 + .76 * t)) ** .6, GILL, .001);
  }

  precaudalPits(ctx, mix(BACK, FIN, .5), mix(BELLY, FIN, .35), .775);

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
