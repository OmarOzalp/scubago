/**
 * Galapagos shark (Carcharhinus galapagensis): the classic requiem "reef shark" of remote oceanic
 * islands. A fairly slender, solid body behind a moderately long, broadly rounded snout; a tall,
 * slightly falcate first dorsal fin with a narrowly rounded tip, standing over the pectorals' free
 * rear tips, and a low ridge running back along the spine to a small second dorsal; long, narrow,
 * sickle-shaped pectorals; a heterocercal tail with a long upper lobe notched near its tip. Bronze
 * grey above and white below, with a faint pale wedge running forward along the flank above the
 * pelvics; the fin tips and rear margins are only a little dusky, never white or black.
 */
import { Vector3 } from 'three';
import { SWIM_RIGS, type SharkRig } from '../../../src/lib/marine-rigs';
import { clamp, hex, mix, noise, smoothstep, type RGB } from './kit';
import { sharkContext, type SharkDesign } from './shark';

const BACK = hex('#6a6454'), FLANK = hex('#857d6b'), BAND = hex('#b9b3a3'), BELLY = hex('#f1efe7');
const DUSK = hex('#46433b'), GILL = hex('#4e4b42'), EYE = hex('#07090a'), MOUTH = hex('#5a574d');

const rig = SWIM_RIGS['galapagos-shark'] as SharkRig;

/** The pale flank wedge: absent at the pectorals, widest over the pelvics, gone again toward the tail. */
const wedge = (s: number) => smoothstep(.26, .52, s) * (1 - smoothstep(.62, .74, s));

/** Where the bronze back meets the white belly: high over the jaw, a little wavy, lifted by the wedge. */
const boundary = (s: number) => 1.5 + .17 * smoothstep(.06, .24, s) - .16 * wedge(s) + .03 * noise(s * 16, 3);

/** The dorsal bronze fading to paler flanks, the faint wedge, then the white belly. */
const skinColor = (s: number, theta: number): RGB => {
  const upper = mix(BACK, FLANK, smoothstep(.2, 1.45, theta));
  const pale = mix(upper, BAND, .85 * wedge(s) * smoothstep(1, 1.45, theta));
  return mix(pale, BELLY, smoothstep(boundary(s) - .03, boundary(s) + .03, theta));
};

/** A fin's colour: bronze, going dusky toward its tip (`v`, 0 at the root) and along its rear margin (`u`, 0 at the front). */
const dusky = (base: RGB, v: number, u: number, tip = .6) =>
  mix(base, DUSK, clamp(.65 * smoothstep(tip, 1, v) + .5 * smoothstep(.7, 1, u), 0, .8));

/**
 * A fin outline from `at(t)`, the leading and trailing edge positions at t = height / full height
 * (the two meet at t = 1), sampled densely toward the tip so its rounding survives.
 */
function outline(height: number, at: (t: number) => readonly [number, number], sink = .012) {
  const ts = [0, .05, .12, .2, .3, .4, .5, .6, .7, .8, .88, .93, .96, .98, 1];
  const le = ts.map((t) => [t * height, at(t)[0]] as const), te = ts.map((t) => [t * height, at(t)[1]] as const);
  // Below the skin the edges simply continue their slope.
  const below = (pts: typeof le) => (sink ? [[-sink, pts[0][1] - (pts[1][1] - pts[0][1]) / (pts[1][0] - pts[0][0]) * sink] as const] : []);
  return { le: [...below(le), ...le], te: [...below(te), ...te] };
}

export const GALAPAGOS_SHARK: SharkDesign = {
  rig, nose: .4, bodyEnd: .8,
  // A broadly rounded snout, a trim torpedo body and a slim tail stock.
  width: [[0, 0], [.006, .015], [.015, .027], [.03, .039], [.05, .049], [.08, .058], [.12, .065], [.16, .07], [.22, .074], [.29, .074], [.36, .07], [.44, .062], [.52, .052], [.6, .041], [.66, .032], [.72, .024], [.77, .016], [.8, .0095]],
  top: [[0, 0], [.006, .017], [.015, .03], [.03, .041], [.05, .05], [.08, .058], [.12, .065], [.16, .072], [.22, .079], [.29, .083], [.36, .082], [.44, .074], [.52, .063], [.6, .05], [.66, .038], [.72, .027], [.77, .019], [.8, .014]],
  bottom: [[0, 0], [.006, .013], [.015, .023], [.03, .032], [.05, .04], [.08, .048], [.12, .055], [.16, .062], [.22, .067], [.29, .069], [.36, .067], [.44, .06], [.52, .05], [.6, .04], [.66, .031], [.72, .023], [.77, .017], [.8, .013]],
  center: [[0, -.007], [.04, -.003], [.1, 0], [.2, 0], [.4, .002], [.6, .004], [.8, .006]],
  squareTop: [[0, 2], [.1, 2.05], [.3, 2.1], [.6, 2.05], [.8, 2]],
  squareBottom: [[0, 2.1], [.1, 2.25], [.3, 2.35], [.6, 2.2], [.8, 2]],
  // The low interdorsal ridge, from behind the first dorsal to the second.
  ridges: [{ angle: 0, height: [[.42, 0], [.46, .004], [.54, .006], [.61, .0045], [.65, 0]] }],
  rings: 46, columnsAbove: 7, columnsBelow: 5,
  boundary, boundaryGap: .03,
  paint: (s, theta) => skinColor(s, theta),
};

export function buildGalapagosShark() {
  const ctx = sharkContext(GALAPAGOS_SHARK);
  const { mesh, bones } = ctx;
  ctx.body();
  const finColor = (_p: Vector3, v: number, u: number) => dusky(mix(BACK, FLANK, .4 + .25 * u), v, u);
  // The tall first dorsal: a straight, raked front edge and a concave rear edge that ends in a free
  // tip at the base, the top narrowly rounded.
  const dorsal = ctx.midlineFin({
    ...outline(.13, (t) => [.298 + .092 * t ** 1.1, .39 + .05 * (1 - t) ** 2.2 + .03 * Math.sqrt(1 - t) * t ** 8]),
    height: .13, thickness: .017, bone: 'Dorsal', stations: 10, color: finColor,
  });
  // Small second dorsal and anal fins, each with a long slender rear tip.
  ctx.midlineFin({
    ...outline(.028, (t) => [.648 + .037 * t ** 1.1, .682 + .019 * (1 - t) ** 2 + .01 * Math.sqrt(1 - t) * t ** 6], .008),
    height: .028, thickness: .007, stations: 5, color: finColor,
  });
  ctx.midlineFin({
    ...outline(.031, (t) => [.658 + .04 * t ** 1.1, .692 + .02 * (1 - t) ** 2 + .01 * Math.sqrt(1 - t) * t ** 6], .008),
    height: .031, thickness: .007, stations: 5, ventral: true,
    color: (_p, v, u) => dusky(mix(BELLY, FLANK, .3 + .3 * v), v, u, .75),
  });
  // Long, narrow, sickle-shaped pectorals: a convex front edge sweeping back to a narrowly rounded tip
  // and a concave rear edge. Bronze above; white below with a dusky tip and rear margin.
  const pectorals = ctx.pairedFin({
    rootS: .205, theta: 2, span: .16, droop: .32, sweep: .1, thickness: .016, stations: 13,
    ...outline(.175, (t) => {
      const b = t * .175;
      const front = .45 * b + 11 * b ** 3;
      return [front, front + .088 * (1 - t) ** 1.15 + .012 * Math.exp(-(((t - .12) / .1) ** 2)) + .03 * Math.sqrt(1 - t) * t ** 3];
    }, 0),
    bone: (left) => (left ? 'PectoralL' : 'PectoralR'),
    color: (_p, v, u, _left, face) => dusky(face > 0 ? mix(BACK, FLANK, .25 + .3 * u) : mix(BELLY, FLANK, .15 * v), v, u, face > 0 ? .6 : .45),
  });
  // Small pelvic fins.
  ctx.pairedFin({
    rootS: .5, theta: 2.4, span: .055, droop: .8, sweep: .15, thickness: .009, stations: 5,
    le: [[-.01, 0], [0, 0], [.025, .014], [.055, .038]],
    te: [[-.01, .05], [0, .051], [.025, .048], [.045, .043], [.055, .038]],
    color: (_p, v, u, _left, face) => dusky(face > 0 ? mix(BACK, FLANK, .4) : mix(BELLY, FLANK, .2 * v), v, u, .8),
  });
  const axis = ctx.center(rig.joints[4]);
  // A heterocercal tail: the upper lobe long, slim and notched near its tip, the lower lobe well developed.
  const tail = ctx.caudalFin({
    low: axis - .105, high: axis + .19,
    le: [[axis - .105, .945], [axis - .08, .908], [axis - .05, .862], [axis - .025, .824], [axis - .008, .8], [axis + .006, .79], [axis + .02, .797], [axis + .05, .832], [axis + .09, .877], [axis + .13, .922], [axis + .15, .945], [axis + .164, .962], [axis + .172, .972], [axis + .19, 1]],
    te: [[axis - .105, .945], [axis - .08, .938], [axis - .05, .918], [axis - .025, .893], [axis + .004, .872], [axis + .03, .887], [axis + .065, .912], [axis + .1, .938], [axis + .13, .959], [axis + .15, .975], [axis + .157, .98], [axis + .164, .971], [axis + .172, .98], [axis + .19, 1]],
    thickness: (y) => .004 + .02 * Math.max(0, 1 - Math.abs(y - axis) / .12) ** 1.2,
    upperPivot: .05, lowerPivot: .04, stations: 22,
    color: (_p, v, u) => dusky(mix(BACK, FLANK, .15 + .25 * u), Math.max(v, 1 - v * 4), u, .85),
  });
  ctx.eyes({ s: .074, theta: 1.2, radius: .0075, color: EYE, sink: .3 });
  ctx.gills({ from: .158, to: .212, count: 5, top: 1.3, bottom: 2, halfWidth: .0016, slant: .007, color: GILL });
  // A gentle arc of a mouth under the snout.
  ctx.ribbon(Array.from({ length: 9 }, (_, i) => {
    const t = i / 8, theta = Math.PI + (t - .5) * 1.9;
    return [.088 + .022 * (2 * t - 1) ** 2, theta] as const;
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
