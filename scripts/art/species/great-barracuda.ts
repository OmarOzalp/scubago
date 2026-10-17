/**
 * Great barracuda (Sphyraena barracuda): a long, slender torpedo with a pointed head and a big
 * mouth whose lower jaw juts past the upper; two small dorsal fins set far apart (the first above
 * the pelvic fins, the second far back over the anal fin); small low pectorals; a forked tail with
 * pale tips. Blue-gray above and bright silver below, with dark bars across the back and upper
 * flanks and scattered black blotches on the lower flank toward the tail.
 */
import { Vector3 } from 'three';
import { SWIM_RIGS, type SharkRig } from '../../../src/lib/marine-rigs';
import { hex, mix, noise, smoothstep, type RGB } from './kit';
import { sharkContext, type SharkDesign } from './shark';

const BACK = hex('#4f616b'), UPPER = hex('#97a8b1'), SILVER = hex('#e3e9ec'), SHEEN = hex('#f7fafb'), BELLY = hex('#fbfcfc');
const BAR = hex('#283239'), BLOTCH = hex('#161b1e'), FIN = hex('#55636b'), TIP = hex('#eef2f3');
const EYE = hex('#d8ddd2'), PUPIL = hex('#0b0d0e'), MOUTH = hex('#2a3135'), OPERCLE = hex('#a3afb6'), TOOTH = hex('#fbfaf3');

const rig = SWIM_RIGS['great-barracuda'] as SharkRig;

const skin = (theta: number, p: Vector3): RGB => {
  // Dark back, a silver flank that brightens to a sheen along its middle, and a white belly.
  const t = theta + .04 * noise(p.z * 30, 4);
  const back = mix(BACK, UPPER, smoothstep(.45, 1.05, t));
  const flank = mix(back, SILVER, smoothstep(.95, 1.35, t));
  const sheen = mix(flank, SHEEN, .55 * Math.exp(-(((t - 1.55) / .22) ** 2)));
  return mix(sheen, BELLY, smoothstep(2.05, 2.5, t));
};

export const GREAT_BARRACUDA: SharkDesign = {
  rig, nose: .44, bodyEnd: .845,
  // Long and slender: deepest a third of the way back, barely tapering until the slim tail stock.
  width: [[0, 0], [.012, .011], [.03, .02], [.06, .03], [.1, .038], [.16, .045], [.24, .05], [.34, .051], [.44, .048], [.54, .043], [.62, .036], [.7, .028], [.76, .021], [.8, .017], [.845, .015]],
  top: [[0, 0], [.012, .008], [.03, .016], [.06, .027], [.1, .037], [.16, .047], [.24, .054], [.34, .056], [.44, .053], [.54, .047], [.62, .039], [.7, .03], [.76, .023], [.8, .019], [.845, .016]],
  bottom: [[0, 0], [.012, .012], [.03, .019], [.06, .027], [.1, .035], [.16, .043], [.24, .05], [.34, .053], [.44, .051], [.54, .045], [.62, .036], [.7, .027], [.76, .021], [.8, .018], [.845, .015]],
  // The tip is the jutting lower jaw, so the profile's middle starts low and rises to the body's axis.
  center: [[0, -.008], [.04, -.004], [.1, -.001], [.3, 0], [.6, .002], [.845, .003]],
  squareTop: [[0, 2], [.2, 2.05], [.5, 2.1], [.845, 2]],
  squareBottom: [[0, 2.1], [.2, 2.2], [.5, 2.15], [.845, 2]],
  rings: 44, columnsAbove: 8, columnsBelow: 5,
  boundary: () => 1.9, boundaryGap: .35,
  paint: (_s, theta, p) => skin(theta, p),
};

export function buildGreatBarracuda() {
  const ctx = sharkContext(GREAT_BARRACUDA);
  const { mesh, bones } = ctx;
  ctx.body();
  const finColor = (_p: Vector3, v: number, u: number) => mix(FIN, BACK, .3 + .2 * u - .2 * v);
  // First dorsal: a small spiny triangle above the pelvic fins.
  const dorsal = ctx.midlineFin({
    le: [[-.01, .39], [0, .394], [.018, .404], [.034, .416], [.046, .426]],
    te: [[-.01, .462], [0, .458], [.008, .452], [.022, .44], [.046, .426]],
    height: .046, thickness: .009, bone: 'Dorsal', color: finColor,
  });
  // Second dorsal and anal fin, mirror images far back, their trailing edges concave.
  ctx.midlineFin({
    le: [[-.008, .655], [0, .659], [.014, .668], [.028, .68], [.036, .69]],
    te: [[-.008, .7], [0, .698], [.006, .695], [.016, .692], [.028, .692], [.036, .69]],
    height: .036, thickness: .007, stations: 6, color: finColor,
  });
  ctx.midlineFin({
    le: [[-.008, .66], [0, .664], [.012, .672], [.024, .683], [.032, .692]],
    te: [[-.008, .704], [0, .702], [.006, .699], [.016, .696], [.026, .695], [.032, .692]],
    height: .032, thickness: .007, stations: 6, ventral: true,
    color: (_p, v, u) => mix(SILVER, FIN, .25 + .45 * v + .1 * u),
  });
  // Small pectorals low on the flank, held back along the body.
  const pectorals = ctx.pairedFin({
    rootS: .2, theta: 2.02, span: .036, droop: 1.05, sweep: 1.05, thickness: .006, stations: 5,
    le: [[-.01, 0], [0, 0], [.012, .008], [.026, .02], [.036, .032]],
    te: [[-.01, .034], [0, .035], [.014, .037], [.028, .036], [.036, .032]],
    bone: (left) => (left ? 'PectoralL' : 'PectoralR'),
    color: (_p, v) => mix(UPPER, FIN, .3 + .3 * v),
  });
  // Pelvic fins below the first dorsal.
  ctx.pairedFin({
    rootS: .4, theta: 2.62, span: .026, droop: 1.25, sweep: .75, thickness: .005, stations: 4,
    le: [[-.008, 0], [0, 0], [.014, .009], [.026, .02]],
    te: [[-.008, .026], [0, .027], [.016, .026], [.026, .02]],
    color: (_p, v) => mix(SILVER, FIN, .2 + .4 * v),
  });
  // A forked tail with sharp lobes, dark with pale tips.
  const axis = ctx.center(rig.joints[4]);
  const tail = ctx.caudalFin({
    low: axis - .102, high: axis + .102,
    le: [[axis - .102, 1], [axis - .075, .952], [axis - .045, .9], [axis - .02, .852], [axis, .83], [axis + .02, .852], [axis + .045, .9], [axis + .075, .952], [axis + .102, 1]],
    te: [[axis - .102, 1], [axis - .08, .99], [axis - .05, .963], [axis - .02, .925], [axis, .908], [axis + .02, .925], [axis + .05, .963], [axis + .08, .99], [axis + .102, 1]],
    thickness: (y) => .003 + .012 * Math.max(0, 1 - Math.abs(y - axis) / .09) ** 1.4,
    upperPivot: .03, lowerPivot: .03,
    color: (p, v) => {
      const tip = smoothstep(.068, .092, Math.abs(p.y - axis));
      return mix(mix(FIN, BACK, .3 - .2 * v), TIP, tip);
    },
  });
  // Large eyes high on the head: a silver iris around a black pupil.
  ctx.eyes({ s: .088, theta: 1.08, radius: .0115, color: EYE, sink: .35 });
  ctx.eyes({ s: .0865, theta: 1.07, radius: .0062, color: PUPIL, sink: -.35 });
  // The long mouth: from the jaw's tip back under the eye, the lower jaw's edge just below it.
  const mouth = Array.from({ length: 9 }, (_, i) => {
    const t = i / 8;
    return [.004 + .086 * t, 1.62 + .22 * t * t] as const;
  });
  for (const side of [1, -1]) {
    ctx.ribbon(mouth.map(([s, theta]) => [s, side * theta] as const), (t) => .0024 * (.55 + .45 * Math.sin(Math.PI * t)), MOUTH);
    // Fang-like teeth along the upper jaw, the largest in front.
    for (const [s, size] of [[.018, .0026], [.031, .0022], [.044, .002], [.057, .0017], [.068, .0015]] as const) {
      ctx.ribbon([[s, side * 1.6], [s + size * .3, side * 1.69], [s + size * .5, side * 1.78]], (t) => size * (1 - t), TOOTH, .0016);
    }
    // The gill cover's curved edge.
    ctx.ribbon(Array.from({ length: 8 }, (_, j) => {
      const t = j / 7;
      return [.178 + .02 * Math.sin(Math.PI * t), side * (.95 + 1.45 * t)] as const;
    }), (t) => .0014 * (.4 + .6 * Math.sin(Math.PI * t)), OPERCLE);
    // A faint lateral line along the flank.
    ctx.ribbon(Array.from({ length: 12 }, (_, j) => [.2 + .6 * j / 11, side * (1.42 + .05 * j / 11)] as const), () => .0009, mix(SILVER, UPPER, .55));
  }

  // Dark bars over the back and upper flanks, slanting a little back as they go down.
  for (let i = 0, s0 = .225; s0 < .79; i++, s0 += .028 + .006 * (1 + noise(i * 2.7, 41)) / 2) {
    const strength = smoothstep(.2, .3, s0) * (1 - .35 * smoothstep(.68, .79, s0));
    const reach = 1.08 + .14 * noise(i * 1.9, 43);
    const line = Array.from({ length: 9 }, (_, j) => {
      const t = j / 8;
      const theta = -reach + 2 * reach * t;
      return [s0 + .016 * Math.abs(theta) / reach + .003 * noise(i * 5 + j, 47), theta] as const;
    });
    const width = .0052 * (.75 + .25 * strength) * (1 + .2 * noise(i * 3.3, 49));
    ctx.ribbon(line, (t) => width * Math.sin(Math.PI * (.06 + .88 * t)) ** .45, mix(BACK, BAR, .5 + .5 * strength));
  }
  // Scattered black blotches low on the rear flank.
  for (const side of [1, -1]) {
    for (let i = 0; i < 9; i++) {
      const s = .5 + .27 * (i / 8) + .02 * noise(i * 3.7, 51 + side);
      const theta = side * (1.75 + .45 * Math.abs(noise(i * 2.1, 53 + side)));
      ctx.spot(s, theta, .0055 + .003 * Math.abs(noise(i * 4.3, 55)), BLOTCH, 1.3);
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
