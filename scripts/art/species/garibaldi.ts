/**
 * Garibaldi (Hypsypops rubicundus): the big damselfish of California's kelp forests, a hand long: a
 * deep, oval, compressed body with a steep, rounded forehead and a small mouth; one long dorsal fin
 * from the nape to the tail, low in front and rising to a rounded soft rear; a rounded anal fin; a
 * broad tail with rounded lobes and a shallow fork; paddle pectorals it hovers with. Brilliant orange
 * all over, a touch deeper on the back and fins, its large eyes ringed in orange.
 */
import { Vector3 } from 'three';
import { SWIM_RIGS, type SharkRig } from '../../../src/lib/marine-rigs';
import { hex, mix, noise, smoothstep, type RGB } from './kit';
import { sharkContext, type SharkDesign } from './shark';

const ORANGE = hex('#ff6a0d'), DEEP = hex('#ef5704'), BRIGHT = hex('#ff8a2a'), FIN = hex('#ff7418');
const EYE = hex('#ff8a2a'), PUPIL = hex('#0b0a0a'), MOUTH = hex('#b2420b');

const rig = SWIM_RIGS.garibaldi as SharkRig;

const skin = (theta: number, p: Vector3): RGB => {
  // Deeper on the back, brighter low on the flank; a faint scale sheen.
  const t = theta + .05 * noise(p.z * 40, 2);
  return mix(mix(DEEP, ORANGE, smoothstep(.2, 1.1, t)), BRIGHT, .45 * smoothstep(2, 2.9, t) + .12 * noise(p.z * 120 + p.y * 90, 6));
};
/** A fin's color: as brilliant an orange as the body, a touch deeper toward its edge. */
const finColor = (v: number) => mix(FIN, ORANGE, .5 * v);

export const GARIBALDI: SharkDesign = {
  rig, nose: .4, bodyEnd: .79, frontDome: .045,
  // Deep and oval with a steep rounded forehead, tallest a third of the way back, tapering to a stout tail stock.
  width: [[0, .03], [.03, .046], [.08, .06], [.16, .072], [.28, .076], [.4, .072], [.52, .061], [.62, .047], [.71, .034], [.79, .026]],
  top: [[0, .05], [.03, .1], [.08, .148], [.16, .19], [.28, .208], [.4, .198], [.52, .166], [.62, .124], [.71, .082], [.79, .06]],
  bottom: [[0, .04], [.03, .074], [.08, .108], [.16, .142], [.28, .162], [.4, .156], [.52, .13], [.62, .096], [.71, .067], [.79, .052]],
  center: [[0, -.03], [.08, -.016], [.2, -.004], [.4, .002], [.79, .002]],
  squareTop: [[0, 2], [.3, 2.2], [.79, 2.1]],
  squareBottom: [[0, 2], [.3, 2.2], [.79, 2.1]],
  rings: 32, columnsAbove: 7, columnsBelow: 6,
  boundary: () => 2.2, boundaryGap: .3,
  paint: (_s, theta, p) => skin(theta, p),
};

export function buildGaribaldi() {
  const ctx = sharkContext(GARIBALDI);
  const { mesh, bones } = ctx;
  ctx.body();
  // One long dorsal fin: low and spiny from the nape, rising to the rounded soft rear (on `Dorsal`).
  const dorsal = ctx.midlineFin({
    le: [[-.012, .16], [0, .165], [.03, .2], [.045, .3], [.055, .42], [.07, .5], [.085, .56]],
    te: [[-.012, .74], [0, .738], [.03, .725], [.06, .69], [.08, .62], [.085, .56]],
    height: .085, thickness: .012, stations: 8, chordPoints: 10, bone: 'Dorsal', color: (_p, v) => finColor(v),
  });
  // A rounded anal fin, and small pelvic fins under the chest.
  ctx.midlineFin({
    le: [[-.012, .46], [0, .465], [.03, .48], [.055, .52], [.07, .58]],
    te: [[-.012, .72], [0, .718], [.03, .705], [.06, .66], [.07, .58]],
    height: .07, thickness: .012, stations: 6, chordPoints: 7, ventral: true, color: (_p, v) => finColor(v),
  });
  ctx.pairedFin({
    rootS: .26, theta: 2.75, span: .065, droop: 1.2, sweep: .55, thickness: .008, stations: 5,
    le: [[-.01, 0], [0, 0], [.025, .015], [.05, .035], [.065, .055]],
    te: [[-.01, .04], [0, .042], [.03, .052], [.055, .058], [.065, .055]],
    color: (_p, v) => finColor(v),
  });
  // Paddle pectorals behind the gill cover: its oars.
  const pectorals = ctx.pairedFin({
    rootS: .22, theta: 1.86, span: .08, droop: .45, sweep: .6, thickness: .008, stations: 6,
    le: [[-.012, 0], [0, 0], [.025, .004], [.05, .016], [.07, .034], [.08, .058]],
    te: [[-.012, .066], [0, .068], [.03, .08], [.06, .082], [.074, .074], [.08, .058]],
    bone: (left) => (left ? 'PectoralL' : 'PectoralR'),
    color: (_p, v) => mix(BRIGHT, FIN, .4 * v),
  });
  // A broad tail with rounded lobes and a shallow fork.
  const axis = ctx.center(rig.joints[4]);
  const tail = ctx.caudalFin({
    low: axis - .125, high: axis + .125,
    le: [[axis - .125, .94], [axis - .095, .87], [axis - .06, .82], [axis - .02, .79], [axis, .782], [axis + .02, .79], [axis + .06, .82], [axis + .095, .87], [axis + .125, .94]],
    te: [[axis - .125, .94], [axis - .105, .985], [axis - .075, 1], [axis - .04, .985], [axis, .955], [axis + .04, .985], [axis + .075, 1], [axis + .105, .985], [axis + .125, .94]],
    thickness: (y) => .004 + .014 * Math.max(0, 1 - Math.abs(y - axis) / .1) ** 1.2,
    upperPivot: .04, lowerPivot: .04, stations: 14,
    color: (_p, _v, u) => mix(FIN, ORANGE, .5 * u),
  });
  // Large eyes ringed in orange, and a small mouth at the tip of the snout.
  ctx.eyes({ s: .088, theta: 1.16, radius: .03, color: EYE, sink: .45 });
  ctx.eyes({ s: .084, theta: 1.14, radius: .014, color: PUPIL, sink: -.25 });
  for (const side of [1, -1]) {
    ctx.ribbon(Array.from({ length: 5 }, (_, i) => [.01 + .026 * i / 4, side * (1.6 + .18 * i / 4)] as const), (t) => .0035 * (.5 + .5 * Math.sin(Math.PI * t)), MOUTH);
  }

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
