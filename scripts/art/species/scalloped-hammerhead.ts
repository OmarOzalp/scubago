/**
 * Scalloped hammerhead (Sphyrna lewini): the head is a wide, flat blade (the cephalofoil), about
 * a quarter of the body length across, with an arched front margin notched at the middle and the
 * eyes at its outer tips. Behind it a lean, streamlined body; a tall, sickle-shaped first dorsal;
 * a small second dorsal with a long free rear tip over a larger anal fin; falcate pectorals with
 * dusky tips beneath; and an asymmetrical tail with a long upper lobe. Grayish bronze above, pale
 * below with a soft boundary.
 */
import { Vector3 } from 'three';
import { SWIM_RIGS, type SharkRig } from '../../../src/lib/marine-rigs';
import { eye, fin, hex, mix, noise, smoothstep, type RGB } from './kit';
import { sharkContext, type SharkDesign } from './shark';

const TOP = hex('#6d6b60'), DARK = hex('#5b594f'), FLANK = hex('#8d8a7e'), BELLY = hex('#efeee8');
const TIP = hex('#393832'), GILL = hex('#4b4a43'), EYE = hex('#0a0b0a');

const rig = SWIM_RIGS['scalloped-hammerhead'] as SharkRig;

const skinColor = (theta: number, p: Vector3): RGB => {
  const pale = smoothstep(1.36, 1.74, theta + .04 * noise(p.z * 30, 5));
  return mix(mix(TOP, FLANK, .6 * smoothstep(.5, 1.5, theta)), BELLY, pale);
};

export const SCALLOPED_HAMMERHEAD: SharkDesign = {
  rig, nose: .43, bodyEnd: .8,
  // Lean behind the head, deepest a third of the way back; the snout itself is buried in the cephalofoil.
  width: [[0, 0], [.012, .01], [.04, .018], [.08, .026], [.12, .034], [.17, .045], [.23, .056], [.3, .064], [.37, .066], [.44, .062], [.51, .054], [.58, .042], [.64, .031], [.69, .022], [.73, .016], [.77, .012], [.8, .0095]],
  top: [[0, 0], [.012, .006], [.04, .012], [.08, .02], [.12, .03], [.17, .044], [.23, .057], [.3, .066], [.37, .069], [.44, .065], [.51, .056], [.58, .044], [.64, .032], [.69, .023], [.73, .017], [.77, .013], [.8, .011]],
  bottom: [[0, 0], [.012, .005], [.04, .01], [.08, .016], [.12, .023], [.17, .033], [.23, .042], [.3, .048], [.37, .05], [.44, .047], [.51, .041], [.58, .033], [.64, .024], [.69, .017], [.73, .013], [.77, .011], [.8, .0095]],
  center: [[0, -.004], [.1, -.003], [.3, 0], [.55, .003], [.8, .007]],
  squareTop: [[0, 2], [.12, 2.1], [.3, 2.1], [.6, 2.05], [.8, 2]],
  squareBottom: [[0, 2.2], [.12, 2.3], [.3, 2.3], [.6, 2.15], [.8, 2]],
  keel: [[.66, 0], [.71, .003], [.75, .004], [.8, 0]],
  rings: 42, columnsAbove: 7, columnsBelow: 5,
  boundary: () => 1.55, boundaryGap: .12,
  paint: (_s, theta, p) => skinColor(theta, p),
};

/** Half the cephalofoil's width, the rounding at each tip, and how far its front stands ahead of the snout (body lengths). */
const HEAD = .135, TIP_ROUND = .012, AHEAD = .008;
/** Front margin, arched gently back toward the tips, with a notch at the middle and a shallow scallop each side. */
const front = (a: number) => .026 * (a / HEAD) ** 2 + .005 * Math.exp(-((a / .013) ** 2)) + .002 * Math.exp(-(((a - .058) / .011) ** 2));
/** Rear margin: from the neck it sweeps forward quickly, then runs out almost straight to the narrow lobe tips. */
const NECK = .03;
const rear = (a: number) => (a > NECK ? .105 - .055 * (1 - (1 - (a - NECK) / (HEAD - NECK)) ** 2.2) : .105 + (NECK - a) * .25);
/** The blade droops very slightly toward its tips. */
const bladeY = (a: number) => -.004 - .01 * (a / HEAD) ** 2;

export function buildScallopedHammerhead() {
  const ctx = sharkContext(SCALLOPED_HAMMERHEAD);
  const { mesh, bones, z } = ctx;
  ctx.body();

  // The cephalofoil: one airfoil-section blade from tip to tip, flat and thin, carried by the head bone
  // alone so it stays steady while the body swims.
  const tipMid = (front(HEAD) + rear(HEAD)) / 2;
  const margins = (a: number) => {
    const inner = HEAD - TIP_ROUND;
    const round = a <= inner ? 1 : Math.sqrt(Math.max(0, 1 - ((a - inner) / TIP_ROUND) ** 2));
    return { le: tipMid - (tipMid - front(a)) * round, te: tipMid + (rear(a) - tipMid) * round };
  };
  const across = (v: number) => HEAD * (1 - 2 * v);
  const hz = (s: number) => z(s) + AHEAD;
  fin(mesh, {
    stations: 24, rootPoint: true, chordPoints: 7,
    le: (v) => { const x = across(v), a = Math.abs(x); return new Vector3(x, bladeY(a), hz(margins(a).le)); },
    te: (v) => { const x = across(v), a = Math.abs(x); return new Vector3(x, bladeY(a), hz(margins(a).te)); },
    thickness: (v) => .009 + .018 * Math.max(0, 1 - Math.abs(across(v)) / HEAD) ** 1.4,
    side: new Vector3(0, 1, 0),
    color: (p, _v, _u, face) => {
      const edge = smoothstep(.6, 1, Math.abs(p.x) / HEAD);
      return face > 0 ? mix(TOP, DARK, .3 * edge) : mix(BELLY, FLANK, .35 * edge);
    },
    skin: () => ({ Head: 1 }),
  });
  // Eyes at the outer tips of the blade, looking out to the sides.
  for (const side of [1, -1]) {
    const center = new Vector3(side * (HEAD - .005), bladeY(HEAD) + .001, hz(tipMid));
    eye(mesh, center, new Vector3(side, .15, .1), .0068, EYE, { Head: 1 });
  }

  const finColor = (_p: Vector3, v: number, u: number) => mix(TOP, DARK, .2 + .15 * u + .1 * v);
  // Tall, sickle-shaped first dorsal: the apex swept far back over a concave trailing edge and a free rear tip.
  const dorsal = ctx.midlineFin({
    le: [[-.012, .292], [0, .296], [.035, .31], [.07, .33], [.1, .352], [.118, .372], [.126, .384]],
    te: [[-.012, .4], [0, .404], [.007, .409], [.02, .394], [.045, .384], [.08, .379], [.11, .381], [.126, .384]],
    height: .126, thickness: .02, bone: 'Dorsal', color: finColor,
  });
  // Small second dorsal with a long free rear tip, above a larger, notched anal fin.
  ctx.midlineFin({
    le: [[-.008, .688], [0, .69], [.012, .7], [.018, .707]],
    te: [[-.008, .73], [0, .733], [.004, .736], [.012, .716], [.018, .707]],
    height: .018, thickness: .006, stations: 4, color: (_p, v) => mix(TOP, TIP, .5 * smoothstep(.4, 1, v)),
  });
  ctx.midlineFin({
    le: [[-.01, .652], [0, .655], [.018, .668], [.03, .68]],
    te: [[-.01, .7], [0, .703], [.005, .706], [.012, .69], [.022, .688], [.03, .68]],
    height: .03, thickness: .008, stations: 5, ventral: true,
    color: (_p, v) => mix(BELLY, FLANK, .25 + .3 * v),
  });
  // Falcate pectorals: bronze above, pale beneath with dusky tips.
  const pectorals = ctx.pairedFin({
    rootS: .21, theta: 1.98, span: .15, droop: .36, sweep: .24, thickness: .016,
    le: [[-.015, 0], [0, 0], [.04, .02], [.08, .049], [.11, .074], [.135, .094], [.15, .106]],
    te: [[-.015, .07], [0, .072], [.04, .078], [.08, .086], [.11, .094], [.135, .101], [.15, .106]],
    bone: (left) => (left ? 'PectoralL' : 'PectoralR'),
    color: (_p, v, u, _left, face) => (face > 0 ? mix(TOP, DARK, .2 + .1 * u) : mix(BELLY, TIP, smoothstep(.66, .86, v + .1 * u))),
  });
  ctx.pairedFin({
    rootS: .5, theta: 2.42, span: .045, droop: .9, sweep: .15, thickness: .008, stations: 5,
    le: [[-.01, 0], [0, 0], [.022, .013], [.045, .034]],
    te: [[-.01, .042], [0, .043], [.02, .041], [.038, .037], [.045, .034]],
    color: (_p, v, _u, _left, face) => (face > 0 ? mix(TOP, FLANK, .3) : mix(BELLY, FLANK, .3 * v)),
  });
  const axis = ctx.center(rig.joints[4]);
  // Asymmetrical tail: a long, slender upper lobe with a notch near its tip, and a smaller lower lobe.
  const tail = ctx.caudalFin({
    low: axis - .075, high: axis + .15,
    le: [[axis - .075, .85], [axis - .05, .81], [axis - .026, .78], [axis - .008, .76], [axis + .004, .752], [axis + .016, .758], [axis + .04, .8], [axis + .075, .865], [axis + .11, .93], [axis + .135, .975], [axis + .15, 1]],
    te: [[axis - .075, .85], [axis - .05, .846], [axis - .028, .836], [axis - .006, .823], [axis + .006, .822], [axis + .032, .862], [axis + .075, .93], [axis + .102, .962], [axis + .112, .958], [axis + .124, .988], [axis + .15, 1]],
    thickness: (y) => .003 + .016 * Math.max(0, 1 - Math.abs(y - axis) / .1) ** 1.3,
    upperPivot: .05, lowerPivot: .028,
    color: (p, _v, u) => mix(mix(TOP, DARK, .2 + .15 * u), TIP, .45 * smoothstep(axis - .04, axis - .07, p.y)),
  });
  ctx.gills({ from: .135, to: .185, count: 5, top: 1.3, bottom: 2.05, halfWidth: .0015, slant: .007, color: GILL });

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
