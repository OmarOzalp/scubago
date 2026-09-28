/**
 * Common bottlenose dolphin (Tursiops truncatus): a streamlined fusiform body with a short, stout
 * beak set off by a crease from the rounded melon; a curved, backswept dorsal fin at mid-back;
 * tapered, pointed flippers low on the flanks; a narrow, deep tail stock; and horizontal flukes,
 * swept back to pointed tips with a notch at the middle. A darker gray cape over the back fades to
 * paler flanks and a light belly and lower jaw, with the mouth's upturned line and a blowhole.
 */
import { Vector3 } from 'three';
import { SWIM_RIGS, type CetaceanRig } from '../../../src/lib/marine-rigs';
import { blendSkins, fin, hex, mix, noise, smoothstep, type RGB } from './kit';
import { sharkContext, type SharkDesign } from './shark';

const CAPE = hex('#4f5a63'), BACK = hex('#66727b'), FLANK = hex('#8f9ba3'), BELLY = hex('#e6e9e7');
const MOUTH = hex('#3b4248'), EYE = hex('#08090a'), BLOWHOLE = hex('#2c3237');

const rig = SWIM_RIGS['bottlenose-dolphin'] as CetaceanRig;

/** Angle from the dorsal midline where the darker cape ends: widest over the front body, narrowing behind the dorsal fin. */
const capeEdge = (s: number) => .35 + .45 * smoothstep(.08, .16, s) * (1 - smoothstep(.45, .7, s));

function skinColor(s: number, theta: number, p: Vector3): RGB {
  const cape = smoothstep(capeEdge(s) + .16, capeEdge(s) - .16, theta);
  const back = mix(BACK, CAPE, cape);
  const flank = mix(back, FLANK, smoothstep(.75, 1.45, theta) * (1 - cape));
  const pale = smoothstep(1.5, 2, theta + .03 * noise(p.z * 25, 2));
  // The lower jaw is pale too.
  const jaw = s < .08 ? smoothstep(1.35, 1.85, theta) : 0;
  return mix(flank, BELLY, Math.max(pale, jaw));
}

export const BOTTLENOSE_DOLPHIN: SharkDesign = {
  rig, nose: .44, bodyEnd: .9, frontDome: .006,
  // Beak to s = .065, then the melon rises steeply; deepest a little behind the flippers; a narrow, deep tail stock.
  width: [[0, 0], [.01, .012], [.03, .018], [.05, .021], [.065, .024], [.08, .032], [.1, .044], [.14, .057], [.2, .068], [.28, .077], [.36, .08], [.44, .077], [.52, .069], [.6, .056], [.67, .042], [.73, .03], [.79, .021], [.84, .016], [.88, .013], [.9, .011]],
  top: [[0, 0], [.01, .01], [.03, .015], [.05, .018], [.06, .02], [.07, .03], [.08, .044], [.095, .058], [.115, .068], [.14, .074], [.2, .082], [.28, .091], [.36, .095], [.44, .092], [.52, .084], [.6, .072], [.67, .06], [.73, .05], [.79, .042], [.84, .034], [.88, .025], [.9, .018]],
  bottom: [[0, 0], [.01, .009], [.03, .014], [.05, .018], [.07, .024], [.09, .032], [.12, .045], [.16, .058], [.2, .068], [.28, .08], [.36, .085], [.44, .082], [.52, .073], [.6, .061], [.67, .049], [.73, .04], [.79, .032], [.84, .026], [.88, .02], [.9, .015]],
  center: [[0, -.014], [.05, -.012], [.09, -.006], [.15, -.002], [.3, 0], [.6, .004], [.85, .007], [.9, .007]],
  // Rounded in front; the tail stock's section narrows to a tall lens with a keel along its top and bottom.
  squareTop: [[0, 2], [.1, 2], [.3, 2.05], [.6, 2], [.75, 1.8], [.9, 1.65]],
  squareBottom: [[0, 2], [.1, 2.1], [.3, 2.1], [.6, 2], [.75, 1.8], [.9, 1.65]],
  rings: 44, columnsAbove: 7, columnsBelow: 6,
  boundary: () => 1.62, boundaryGap: .16,
  paint: skinColor,
};

/** Half the fluke span, and the rounding at each tip (body lengths). */
const FLUKE = .125, FLUKE_TIP = .01;

export function buildBottlenoseDolphin() {
  const ctx = sharkContext(BOTTLENOSE_DOLPHIN);
  const { mesh, bones, z } = ctx;
  ctx.body();

  // Curved, backswept dorsal fin: the tip trails behind the base's middle above a concave trailing edge.
  ctx.midlineFin({
    le: [[-.01, .398], [0, .402], [.025, .418], [.05, .44], [.07, .47], [.08, .495], [.085, .52]],
    te: [[-.01, .543], [0, .54], [.015, .518], [.035, .5], [.055, .495], [.072, .502], [.085, .52]],
    height: .085, thickness: .016, color: (_p, v, u) => mix(CAPE, BACK, .15 + .2 * u + .1 * v),
  });
  // Tapered, pointed flippers low on the flanks, swept back.
  const flippers = ctx.pairedFin({
    rootS: .19, theta: 2.25, span: .13, droop: .5, sweep: .45, thickness: .014,
    le: [[-.012, 0], [0, 0], [.03, .018], [.06, .04], [.09, .062], [.115, .082], [.13, .094]],
    te: [[-.012, .045], [0, .046], [.03, .055], [.06, .066], [.09, .078], [.115, .088], [.13, .094]],
    bone: (left) => (left ? 'PectoralL' : 'PectoralR'),
    color: (_p, v, _u, _left, face) => (face > 0 ? mix(BACK, FLANK, .3 * v) : mix(FLANK, BELLY, .45 - .2 * v)),
  });

  // Horizontal flukes, one airfoil-section blade from tip to tip: the leading edge sweeps back from the
  // tail stock, the trailing edge dips to a notch at the middle. The tail bone carries them; the tips flex.
  const tipS = .976;
  const lead = (a: number) => .868 + .1 * (a / FLUKE) ** 1.6;
  const trail = (a: number) => .95 + .03 * (a / FLUKE) ** 2 - .012 * Math.exp(-((a / .012) ** 2));
  const margins = (a: number) => {
    const inner = FLUKE - FLUKE_TIP;
    const round = a <= inner ? 1 : Math.sqrt(Math.max(0, 1 - ((a - inner) / FLUKE_TIP) ** 2));
    return { le: tipS - (tipS - lead(a)) * round, te: tipS + (trail(a) - tipS) * round };
  };
  const across = (v: number) => FLUKE * (1 - 2 * v);
  const flukeY = ctx.center(.9);
  fin(mesh, {
    stations: 22, rootPoint: true, chordPoints: 7,
    le: (v) => { const x = across(v), a = Math.abs(x); return new Vector3(x, flukeY, z(margins(a).le)); },
    te: (v) => { const x = across(v), a = Math.abs(x); return new Vector3(x, flukeY, z(margins(a).te)); },
    thickness: (v) => .006 + .016 * Math.max(0, 1 - Math.abs(across(v)) / FLUKE) ** 1.3,
    side: new Vector3(0, 1, 0),
    color: (_p, _v, u, face) => (face > 0 ? mix(BACK, CAPE, .25 + .15 * u) : mix(FLANK, BELLY, .35)),
    skin: (p) => blendSkins({ Tail: 1 }, { [p.x >= 0 ? 'FlukeL' : 'FlukeR']: 1 }, smoothstep(.035, .1, Math.abs(p.x))),
  });

  ctx.eyes({ s: .112, theta: 1.48, radius: .0068, color: EYE, sink: .35 });
  // The mouth's line along each side of the beak, turning up at its corner.
  for (const side of [1, -1]) {
    ctx.ribbon([[.008, 1.8], [.02, 1.77], [.035, 1.75], [.05, 1.73], [.062, 1.7], [.072, 1.62], [.078, 1.52]].map(([s, theta]) => [s, side * theta] as const),
      (t) => .0014 * (.6 + .4 * Math.sin(Math.PI * t)), MOUTH);
  }
  ctx.spot(.148, 0, .0055, BLOWHOLE, .45);

  ctx.spineBones();
  const flukeTip = (side: number) => new Vector3(side * .05, flukeY, z(.93));
  bones.push(
    { name: 'FlukeL', parent: 'Tail', position: flukeTip(1) },
    { name: 'FlukeR', parent: 'Tail', position: flukeTip(-1) },
    { name: 'PectoralL', parent: 'Root', position: flippers[0] },
    { name: 'PectoralR', parent: 'Root', position: flippers[1] },
  );
  return { mesh, bones };
}
