/**
 * Sailfish (Istiophorus platypterus): a long, slender, compressed body behind a spear-like bill; a
 * huge sail-like first dorsal fin, taller than the body is deep, running from just behind the head
 * most of the way back, deep navy with black spots, which folds down into a groove at speed; long,
 * thin pelvic fins trailing below; a keeled tail stock and a tall crescent tail. Dark metallic blue
 * above, silvery white below, with rows of pale blue spots barring the flanks.
 */
import { Vector3 } from 'three';
import { SWIM_RIGS, type SharkRig } from '../../../src/lib/marine-rigs';
import { hex, mix, noise, smoothstep, type RGB } from './kit';
import { sharkContext, type SharkDesign } from './shark';

const BACK = hex('#17284a'), BLUE = hex('#2c5a8f'), FLANK = hex('#9fb6c8'), SILVER = hex('#e6ecef'), BELLY = hex('#f7f9f9');
const SAIL = hex('#1a2c52'), SAIL_EDGE = hex('#2f4f80'), SPOT = hex('#070b16'), STRIPE = hex('#9ed4f2');
const BILL = hex('#2a3446'), FIN = hex('#22355a'), EYE = hex('#cdd3d0'), PUPIL = hex('#06080c'), MOUTH = hex('#1d2533');

const rig = SWIM_RIGS.sailfish as SharkRig;
const BILL_END = .155;

const skin = (s: number, theta: number, p: Vector3): RGB => {
  const t = theta + .03 * noise(p.z * 26, 6);
  if (s < BILL_END - .01) return mix(BILL, mix(BILL, SILVER, .35), smoothstep(1.3, 2.6, t));
  const back = mix(BACK, BLUE, smoothstep(.35, 1.1, t));
  const flank = mix(back, FLANK, smoothstep(1.15, 1.55, t));
  return mix(mix(flank, SILVER, smoothstep(1.5, 1.9, t)), BELLY, smoothstep(2.2, 2.6, t));
};

export const SAILFISH: SharkDesign = {
  rig, nose: .5, bodyEnd: .84,
  // The bill is part of the loft: a thin spear to the mouth at BILL_END, then the head swells quickly.
  width: [[0, 0], [.03, .0022], [.08, .0036], [.13, .005], [BILL_END, .007], [.18, .014], [.21, .022], [.25, .029], [.32, .034], [.42, .035], [.52, .032], [.62, .027], [.7, .021], [.76, .016], [.8, .012], [.84, .009]],
  top: [[0, 0], [.03, .002], [.08, .0034], [.13, .0052], [BILL_END, .008], [.18, .018], [.21, .029], [.25, .039], [.32, .047], [.42, .049], [.52, .045], [.62, .036], [.7, .026], [.76, .018], [.8, .013], [.84, .01]],
  bottom: [[0, 0], [.03, .002], [.08, .0034], [.13, .0046], [BILL_END, .0065], [.18, .016], [.21, .026], [.25, .036], [.32, .045], [.42, .048], [.52, .043], [.62, .034], [.7, .024], [.76, .017], [.8, .012], [.84, .01]],
  center: [[0, .006], [.1, .005], [BILL_END, .003], [.25, 0], [.5, .001], [.84, .003]],
  squareTop: [[0, 2], [.2, 2.05], [.5, 2.1], [.84, 2]],
  squareBottom: [[0, 2], [.2, 2.1], [.5, 2.1], [.84, 2]],
  keel: [[.72, 0], [.77, .005], [.81, .007], [.84, 0]],
  rings: 44, columnsAbove: 7, columnsBelow: 5,
  boundary: () => 1.9, boundaryGap: .35,
  paint: (s, theta, p) => skin(s, theta, p),
};

export function buildSailfish() {
  const ctx = sharkContext(SAILFISH);
  const { mesh, bones } = ctx;
  ctx.body();
  // The sail: steep in front, tallest a third of the way back, then a long falling edge to the rear.
  // Deep navy with black spots, a little bluer toward its free edge.
  const sailSpots = (p: Vector3) => {
    const a = Math.sin(p.z * 210 + 1.3) * Math.sin(p.y * 190 + .4 + .8 * Math.sin(p.z * 60));
    return smoothstep(.55, .8, a);
  };
  const dorsal = ctx.midlineFin({
    le: [[-.012, .198], [0, .203], [.04, .212], [.09, .23], [.135, .262], [.155, .3]],
    te: [[-.012, .672], [0, .667], [.02, .64], [.05, .585], [.08, .52], [.11, .445], [.14, .37], [.155, .3]],
    height: .155, thickness: .006, stations: 11, chordPoints: 12, bone: 'Dorsal', sink: .01,
    color: (p, v, u) => mix(mix(SAIL, SAIL_EDGE, .5 * smoothstep(.55, 1, v) + .2 * u), SPOT, .85 * sailSpots(p) * smoothstep(.05, .2, v)),
  });
  // Small second dorsal and two small anal fins near the tail.
  ctx.midlineFin({
    le: [[-.006, .752], [0, .755], [.01, .762], [.018, .77]],
    te: [[-.006, .782], [0, .78], [.008, .776], [.018, .77]],
    height: .018, thickness: .004, stations: 4, color: () => FIN,
  });
  ctx.midlineFin({
    le: [[-.008, .54], [0, .544], [.016, .554], [.03, .57]],
    te: [[-.008, .6], [0, .597], [.012, .588], [.03, .57]],
    height: .03, thickness: .005, stations: 5, ventral: true, color: (_p, v) => mix(SILVER, FIN, .3 + .5 * v),
  });
  ctx.midlineFin({
    le: [[-.006, .752], [0, .755], [.01, .762], [.016, .768]],
    te: [[-.006, .782], [0, .78], [.008, .775], [.016, .768]],
    height: .016, thickness: .004, stations: 4, ventral: true, color: () => FIN,
  });
  // Long, sickle-shaped pectorals set low behind the gill cover.
  const pectorals = ctx.pairedFin({
    rootS: .235, theta: 2.15, span: .052, droop: 1.0, sweep: 1.05, thickness: .006, stations: 5,
    le: [[-.008, 0], [0, 0], [.015, .014], [.032, .034], [.046, .056], [.052, .07]],
    te: [[-.008, .02], [0, .021], [.018, .038], [.035, .054], [.048, .066], [.052, .07]],
    bone: (left) => (left ? 'PectoralL' : 'PectoralR'),
    color: (_p, v) => mix(FIN, BLUE, .25 * v),
  });
  // The pelvic fins: two long, thin streamers trailing down and back from under the throat.
  ctx.pairedFin({
    rootS: .262, theta: 2.95, span: .075, droop: 1.42, sweep: .06, thickness: .003, stations: 5,
    le: [[-.004, 0], [0, 0], [.025, .05], [.05, .1], [.075, .15]],
    te: [[-.004, .01], [0, .011], [.025, .057], [.05, .105], [.075, .15]],
    color: () => mix(FIN, BACK, .3),
  });
  // A tall crescent tail.
  const axis = ctx.center(rig.joints[4]);
  const tail = ctx.caudalFin({
    low: axis - .125, high: axis + .13,
    le: [[axis - .125, .995], [axis - .09, .94], [axis - .055, .89], [axis - .025, .855], [axis, .835], [axis + .025, .855], [axis + .055, .89], [axis + .09, .94], [axis + .13, 1]],
    te: [[axis - .125, .995], [axis - .1, .975], [axis - .07, .94], [axis - .035, .9], [axis, .878], [axis + .035, .9], [axis + .07, .94], [axis + .1, .978], [axis + .13, 1]],
    thickness: (y) => .003 + .012 * Math.max(0, 1 - Math.abs(y - axis) / .1) ** 1.5,
    upperPivot: .03, lowerPivot: .03,
    color: (_p, v) => mix(FIN, BACK, .4 - .2 * v),
  });
  ctx.eyes({ s: .195, theta: 1.18, radius: .0105, color: EYE, sink: .35 });
  ctx.eyes({ s: .1935, theta: 1.17, radius: .0058, color: PUPIL, sink: -.35 });
  for (const side of [1, -1]) {
    // The mouth's corner under the eye, where the bill meets the head.
    ctx.ribbon(Array.from({ length: 6 }, (_, i) => [BILL_END + .006 + .03 * i / 5, side * (1.72 + .1 * i / 5)] as const), (t) => .0016 * (.6 + .4 * Math.sin(Math.PI * t)), MOUTH);
    // The gill cover.
    ctx.ribbon(Array.from({ length: 8 }, (_, j) => {
      const t = j / 7;
      return [.226 + .016 * Math.sin(Math.PI * t), side * (.95 + 1.5 * t)] as const;
    }), (t) => .0013 * (.4 + .6 * Math.sin(Math.PI * t)), mix(BLUE, SILVER, .4));
    // Rows of pale blue spots barring the flanks.
    for (let i = 0; i < 13; i++) {
      const s = .27 + .47 * i / 12 + .006 * noise(i * 2.3, 61 + side);
      const n = 5;
      for (let j = 0; j < n; j++) {
        const theta = side * (.72 + 1.02 * j / (n - 1));
        ctx.spot(s + .004 * j / (n - 1), theta, .0046 * (1 - .25 * smoothstep(.6, .78, s)), STRIPE, 1.6);
      }
    }
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
