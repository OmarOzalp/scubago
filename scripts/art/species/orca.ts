/**
 * Orca (Orcinus orca): the largest dolphin, robust and powerful: a blunt, rounded head with no beak;
 * a tall, triangular dorsal fin standing straight up from mid-back (a bull's, nearly a fifth of its
 * length); big, broad, paddle-shaped flippers; a thick tail stock and broad flukes. Glossy black,
 * with crisp white markings: an oval patch above and behind each eye, the chin and throat, a band
 * down the belly that sweeps up into a lobe on each flank behind the dorsal fin, and the flukes'
 * undersides; a pale gray saddle across the back behind the dorsal fin.
 */
import { Vector3 } from 'three';
import { SWIM_RIGS, type CetaceanRig } from '../../../src/lib/marine-rigs';
import { blendSkins, fin, hex, mix, noise, smoothstep, type RGB } from './kit';
import { sharkContext, type SharkDesign } from './shark';

const BLACK = hex('#14171a'), SHEEN = hex('#22272c'), WHITE = hex('#eef0ec'), SADDLE = hex('#8a9095');
const EYE = hex('#050606'), BLOWHOLE = hex('#0c0e10');

const rig = SWIM_RIGS.orca as CetaceanRig;

/** Where the white reaches up the body (angle from the dorsal midline) at s: chin, a narrower band between the flippers, the belly, then the flank lobe. */
const whiteEdge = (s: number) => {
  const chin = 2.3 - .5 * smoothstep(.0, .06, s);
  const narrow = 2.75;
  const belly = 2.25;
  const lobe = 1.35;
  let edge = s < .2 ? chin + (narrow - chin) * smoothstep(.12, .24, s) : s < .4 ? narrow + (belly - narrow) * smoothstep(.32, .45, s) : belly;
  // The flank lobe sweeps up behind the dorsal fin and runs back down toward the tail.
  edge -= (belly - lobe) * smoothstep(.5, .62, s) * (1 - smoothstep(.72, .86, s));
  return edge;
};

function skinColor(s: number, theta: number, p: Vector3): RGB {
  const t = Math.abs(theta);
  let color = mix(BLACK, SHEEN, smoothstep(.6, 1.4, t) * .5);
  // The gray saddle behind the dorsal fin.
  const saddle = smoothstep(.5, .3, t) * smoothstep(.46, .5, s) * (1 - smoothstep(.58, .64, s));
  color = mix(color, SADDLE, saddle * .8);
  // The eye patch: an oval above and behind the eye, its long axis along the body.
  const eye = ((s - .145) / .042) ** 2 + ((t - 1.22) / .17) ** 2;
  const edge = whiteEdge(s) + .03 * noise(p.z * 30, 4);
  const white = Math.max(smoothstep(edge - .02, edge + .1, t), smoothstep(1.15, .7, eye));
  return mix(color, WHITE, white);
}

export const ORCA: SharkDesign = {
  rig, nose: .44, bodyEnd: .9, frontDome: .03,
  // A blunt, rounded head, deep and broad behind it; a long, thick body tapering to a deep tail stock.
  width: [[0, .01], [.02, .03], [.05, .05], [.09, .066], [.14, .078], [.2, .087], [.28, .093], [.36, .094], [.44, .09], [.52, .08], [.6, .066], [.67, .05], [.73, .037], [.79, .026], [.84, .019], [.88, .015], [.9, .013]],
  top: [[0, .01], [.02, .03], [.05, .05], [.09, .068], [.14, .082], [.2, .092], [.28, .1], [.36, .102], [.44, .098], [.52, .088], [.6, .075], [.67, .062], [.73, .052], [.79, .043], [.84, .035], [.88, .027], [.9, .02]],
  bottom: [[0, .01], [.02, .026], [.05, .044], [.09, .058], [.14, .07], [.2, .08], [.28, .09], [.36, .093], [.44, .09], [.52, .08], [.6, .067], [.67, .054], [.73, .044], [.79, .035], [.84, .028], [.88, .021], [.9, .016]],
  center: [[0, -.012], [.06, -.006], [.15, -.002], [.3, 0], [.6, .004], [.85, .007], [.9, .007]],
  squareTop: [[0, 2], [.3, 2.05], [.6, 2], [.75, 1.8], [.9, 1.65]],
  squareBottom: [[0, 2], [.3, 2.1], [.6, 2], [.75, 1.8], [.9, 1.65]],
  rings: 48, columnsAbove: 8, columnsBelow: 7,
  boundary: () => 2.2, boundaryGap: .2,
  paint: skinColor,
};

/** Half the fluke span, and the rounding at each tip (body lengths). */
const FLUKE = .11, FLUKE_TIP = .012;

export function buildOrca() {
  const ctx = sharkContext(ORCA);
  const { mesh, bones, z } = ctx;
  ctx.body();

  // The tall, triangular dorsal fin, standing nearly straight up, its tip barely trailing.
  ctx.midlineFin({
    le: [[-.012, .37], [0, .375], [.04, .392], [.08, .41], [.12, .43], [.15, .45], [.165, .462]],
    te: [[-.012, .53], [0, .525], [.03, .51], [.07, .495], [.11, .48], [.14, .47], [.165, .462]],
    height: .165, thickness: .022, color: (_p, v, u) => mix(BLACK, SHEEN, .2 + .15 * u + .1 * v),
  });
  // Big, broad, rounded paddle flippers low on the chest.
  const flippers = ctx.pairedFin({
    rootS: .2, theta: 2.3, span: .13, droop: .55, sweep: .35, thickness: .018,
    le: [[-.012, 0], [0, 0], [.03, .008], [.06, .018], [.09, .03], [.115, .046], [.13, .066]],
    te: [[-.012, .06], [0, .062], [.03, .078], [.06, .09], [.09, .095], [.115, .09], [.13, .066]],
    bone: (left) => (left ? 'PectoralL' : 'PectoralR'),
    color: () => BLACK,
  });

  // Broad flukes, black above and white below, swept back to rounded tips with a notch at the middle.
  const tipS = .975;
  const lead = (a: number) => .87 + .085 * (a / FLUKE) ** 1.5;
  const trail = (a: number) => .955 + .022 * (a / FLUKE) ** 2 - .013 * Math.exp(-((a / .012) ** 2));
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
    thickness: (v) => .006 + .018 * Math.max(0, 1 - Math.abs(across(v)) / FLUKE) ** 1.3,
    side: new Vector3(0, 1, 0),
    color: (_p, _v, u, face) => (face > 0 ? mix(BLACK, SHEEN, .2 * u) : mix(WHITE, BLACK, smoothstep(.75, .95, u))),
    skin: (p) => blendSkins({ Tail: 1 }, { [p.x >= 0 ? 'FlukeL' : 'FlukeR']: 1 }, smoothstep(.035, .1, Math.abs(p.x))),
  });

  // Small eyes at the front of the eye patch, low on the head, and the blowhole.
  ctx.eyes({ s: .098, theta: 1.62, radius: .006, color: EYE, sink: .35 });
  ctx.spot(.15, 0, .006, BLOWHOLE, .45);

  ctx.spineBones();
  const flukeTip = (side: number) => new Vector3(side * .045, flukeY, z(.93));
  bones.push(
    { name: 'FlukeL', parent: 'Tail', position: flukeTip(1) },
    { name: 'FlukeR', parent: 'Tail', position: flukeTip(-1) },
    { name: 'PectoralL', parent: 'Root', position: flippers[0] },
    { name: 'PectoralR', parent: 'Root', position: flippers[1] },
  );
  return { mesh, bones };
}
