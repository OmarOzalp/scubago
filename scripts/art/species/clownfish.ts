/**
 * Ocellaris clownfish (Amphiprion ocellaris): a small, deep, oval body with a short rounded snout and
 * big eyes; bright orange with three white bands edged in black (a curved bar behind the eye, a
 * middle bar bulging forward at mid-flank, a narrow bar at the base of the tail); a notched dorsal
 * fin (lower spiny part, taller soft part), a rounded anal fin, rounded paddle-like pectorals it rows
 * with, and a rounded tail; every fin orange with a black rim.
 */
import { Vector3 } from 'three';
import { SWIM_RIGS, type SharkRig } from '../../../src/lib/marine-rigs';
import { hex, mix, noise, smoothstep, TAU, type RGB } from './kit';
import { sharkContext, type SharkDesign } from './shark';

const ORANGE = hex('#ff7a12'), DEEP = hex('#f76508'), BELLY = hex('#ffa04a'), WHITE = hex('#ffffff'), BLACK = hex('#121212');
const EYE = hex('#f1a347'), PUPIL = hex('#0a0a0a'), MOUTH = hex('#b5420a');

const rig = SWIM_RIGS.clownfish as SharkRig;

const skin = (theta: number, p: Vector3): RGB => {
  // A warmer, deeper orange on the back, a little lighter low on the flank.
  const t = theta + .05 * noise(p.z * 40, 2);
  return mix(mix(DEEP, ORANGE, smoothstep(.2, 1, t)), BELLY, .5 * smoothstep(2.2, 2.9, t));
};
/** A fin's color: orange, with a black rim toward its free edge (v is span, u chord). */
const rimmed = (v: number, u: number, rim = .74) => mix(mix(ORANGE, DEEP, .35 * v), BLACK, smoothstep(rim, rim + .08, Math.max(v, u > .9 ? v + .25 : 0)));

export const CLOWNFISH: SharkDesign = {
  rig, nose: .4, bodyEnd: .79, frontDome: .05,
  // Deep, oval and compressed, with a short blunt snout: tallest a third of the way back, tapering to
  // a short, stout tail stock.
  width: [[0, .032], [.03, .05], [.08, .066], [.16, .078], [.28, .083], [.4, .078], [.52, .066], [.62, .051], [.71, .036], [.79, .028]],
  top: [[0, .045], [.03, .085], [.08, .128], [.16, .168], [.28, .188], [.4, .18], [.52, .152], [.62, .115], [.71, .078], [.79, .058]],
  bottom: [[0, .045], [.03, .078], [.08, .112], [.16, .142], [.28, .158], [.4, .152], [.52, .128], [.62, .096], [.71, .068], [.79, .054]],
  center: [[0, -.035], [.08, -.018], [.2, -.004], [.4, .002], [.79, .002]],
  squareTop: [[0, 2], [.3, 2.2], [.79, 2.1]],
  squareBottom: [[0, 2], [.3, 2.2], [.79, 2.1]],
  rings: 34, columnsAbove: 7, columnsBelow: 6,
  boundary: () => 2.2, boundaryGap: .3,
  paint: (_s, theta, p) => skin(theta, p),
};

export function buildClownfish() {
  const ctx = sharkContext(CLOWNFISH);
  const { mesh, bones } = ctx;
  ctx.body();
  // Dorsal fin: a lower spiny part, a notch, then the taller, rounded soft part (on `Dorsal`).
  ctx.midlineFin({
    le: [[-.012, .19], [0, .195], [.025, .215], [.045, .26], [.05, .31]],
    te: [[-.012, .45], [0, .448], [.02, .44], [.035, .41], [.045, .36], [.05, .31]],
    height: .05, thickness: .012, stations: 6, chordPoints: 8, color: (_p, v, u) => rimmed(v, u, .66),
  });
  const dorsal = ctx.midlineFin({
    le: [[-.012, .43], [0, .435], [.03, .45], [.06, .48], [.078, .53]],
    te: [[-.012, .73], [0, .728], [.03, .715], [.06, .67], [.075, .6], [.078, .53]],
    height: .078, thickness: .013, stations: 7, chordPoints: 8, bone: 'Dorsal', color: (_p, v, u) => rimmed(v, u),
  });
  // A rounded anal fin under the soft dorsal, and small pelvic fins under the chest.
  ctx.midlineFin({
    le: [[-.012, .5], [0, .505], [.03, .52], [.055, .55], [.068, .6]],
    te: [[-.012, .72], [0, .718], [.03, .705], [.055, .66], [.068, .6]],
    height: .068, thickness: .012, stations: 6, chordPoints: 7, ventral: true, color: (_p, v, u) => rimmed(v, u),
  });
  ctx.pairedFin({
    rootS: .27, theta: 2.75, span: .07, droop: 1.2, sweep: .5, thickness: .008, stations: 5,
    le: [[-.01, 0], [0, 0], [.025, .015], [.05, .035], [.07, .06]],
    te: [[-.01, .045], [0, .046], [.03, .058], [.055, .064], [.07, .06]],
    color: (_p, v, u) => rimmed(v, u, .62),
  });
  // Rounded, paddle-like pectorals on the middle of the flank: its oars.
  const pectorals = ctx.pairedFin({
    rootS: .225, theta: 1.86, span: .085, droop: .45, sweep: .6, thickness: .008, stations: 6,
    le: [[-.012, 0], [0, 0], [.025, .004], [.05, .016], [.072, .036], [.085, .062]],
    te: [[-.012, .07], [0, .072], [.03, .085], [.06, .086], [.078, .078], [.085, .062]],
    bone: (left) => (left ? 'PectoralL' : 'PectoralR'),
    color: (_p, v, u) => mix(mix(ORANGE, BELLY, .25), BLACK, .9 * smoothstep(.86, .96, v)),
  });
  // A rounded tail, its fan edged in black.
  const axis = ctx.center(rig.joints[4]);
  const tail = ctx.caudalFin({
    low: axis - .118, high: axis + .118,
    le: [[axis - .118, .935], [axis - .09, .87], [axis - .055, .82], [axis - .02, .79], [axis, .782], [axis + .02, .79], [axis + .055, .82], [axis + .09, .87], [axis + .118, .935]],
    te: [[axis - .118, .935], [axis - .1, .965], [axis - .07, .99], [axis - .035, 1], [axis, 1], [axis + .035, 1], [axis + .07, .99], [axis + .1, .965], [axis + .118, .935]],
    thickness: (y) => .004 + .014 * Math.max(0, 1 - Math.abs(y - axis) / .1) ** 1.2,
    upperPivot: .04, lowerPivot: .04, stations: 14,
    color: (p, _v, u) => {
      const s = ctx.sOf(p.z);
      const rim = Math.max(smoothstep(.955, .985, s), smoothstep(.09, .112, Math.abs(p.y - axis)));
      return mix(mix(ORANGE, DEEP, .3 * u), BLACK, rim);
    },
  });
  // Big eyes with an orange-gold iris, and a small mouth at the tip of the snout.
  ctx.eyes({ s: .085, theta: .98, radius: .03, color: EYE, sink: .42 });
  ctx.eyes({ s: .081, theta: .96, radius: .017, color: PUPIL, sink: -.42 });
  for (const side of [1, -1]) {
    ctx.ribbon(Array.from({ length: 5 }, (_, i) => [.012 + .028 * i / 4, side * (1.6 + .18 * i / 4)] as const), (t) => .0035 * (.5 + .5 * Math.sin(Math.PI * t)), MOUTH);
  }

  // The three bands, each a white band over a slightly wider black one, wrapping round the body: a
  // head bar bowing back behind the eye, a middle bar bulging forward at mid-flank, a narrow tail bar.
  // Bars: [s at the back and belly, half-width, how far its middle moves at mid-flank (+ toward the tail)].
  const bars = [[.17, .034, .03], [.5, .04, -.05], [.765, .019, 0]] as const;
  for (const [s0, half, bulge] of bars) {
    const line = Array.from({ length: 33 }, (_, i) => {
      const theta = -Math.PI + TAU * i / 32;
      const flank = Math.exp(-(((Math.abs(theta) - 1.6) / .62) ** 2));
      return [s0 + bulge * flank, theta] as const;
    });
    ctx.ribbon(line, () => half + .009, BLACK, .0016);
    ctx.ribbon(line, () => half, WHITE, .0032);
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
