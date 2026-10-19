/**
 * Leafy seadragon (Phycodurus eques): a seahorse's cousin from southern Australia's kelp and weed
 * beds, disguised as drifting seaweed. A long, slender, bony body in a seahorse's armour of rings; a
 * long, tubular snout ending in a tiny mouth; a thin tail with no fin, curling down at its tip; and
 * leafy, lobed appendages branching from the head, back, belly and tail, the seaweed it hides as.
 * Tiny, see-through fins (a little dorsal on the back, pectorals behind the head) do all its
 * swimming. Yellow-ochre and olive with thin pale bands, rosy on the head; the leaves yellow-green.
 */
import { Vector3 } from 'three';
import { SWIM_RIGS, type SharkRig } from '../../../src/lib/marine-rigs';
import { fin, hex, mix, noise, smoothstep, type RGB, type Skin } from './kit';
import { sharkContext, type SharkDesign } from './shark';

const BODY = hex('#b8913e'), OLIVE = hex('#8a8a3c'), BAND = hex('#e2d39a'), ROSE = hex('#b97e78'), SNOUT = hex('#a7794a');
const LEAF = hex('#bdb556'), LEAF_TIP = hex('#ddd27e'), LEAF_DARK = hex('#8e8a38'), FIN = hex('#e9e6d2'), EYE = hex('#2a1f14');

const rig = SWIM_RIGS['leafy-seadragon'] as SharkRig;

const skin = (s: number, theta: number, p: Vector3): RGB => {
  // Olive along the back, ochre on the flanks; thin pale bands at each bony ring; rosy on the head.
  const base = mix(OLIVE, BODY, smoothstep(.3, 1.4, Math.abs(theta)));
  const ring = smoothstep(.75, .95, Math.cos((s - .2) * 150)) * smoothstep(.2, .26, s) * .7;
  return mix(mix(base, BAND, ring), ROSE, (1 - smoothstep(.12, .3, s)) * smoothstep(.14, .2, s) * .6 + .1 * noise(p.z * 50, 3));
};

export const LEAFY_SEADRAGON: SharkDesign = {
  rig, nose: .45, bodyEnd: .995, frontDome: .004,
  // A long tubular snout, a small deep head, a slender, ridged trunk, and a long thin tail.
  width: [[0, .004], [.04, .005], [.12, .006], [.16, .012], [.2, .018], [.24, .016], [.3, .02], [.4, .022], [.5, .02], [.58, .014], [.7, .009], [.85, .006], [.995, .002]],
  top: [[0, .004], [.04, .005], [.12, .006], [.16, .016], [.2, .026], [.24, .024], [.3, .03], [.4, .033], [.5, .028], [.58, .018], [.7, .011], [.85, .007], [.995, .002]],
  bottom: [[0, .004], [.04, .005], [.12, .006], [.16, .014], [.2, .022], [.24, .022], [.3, .028], [.4, .032], [.5, .026], [.58, .016], [.7, .01], [.85, .006], [.995, .002]],
  // The snout tilts down a little; the tail curls down at its end.
  center: [[0, -.01], [.1, -.004], [.2, 0], [.6, 0], [.8, -.012], [.92, -.04], [.995, -.075]],
  squareTop: [[0, 2], [.3, 2.4], [.995, 2]],
  squareBottom: [[0, 2], [.995, 2]],
  rings: 46, columnsAbove: 5, columnsBelow: 4,
  boundary: () => 2, boundaryGap: .6,
  paint: skin,
};

export function buildLeafySeadragon() {
  const ctx = sharkContext(LEAFY_SEADRAGON);
  const { mesh, bones, z } = ctx;
  ctx.body();

  /**
   * A leafy appendage: a short stalk from the body at `s` (angle `theta` round it) branching into
   * `lobes` rounded leaves, fanned in the plane its direction and the body's length make. Skinned to
   * the body there, so it sways with it.
   */
  const leafy = (s: number, theta: number, length: number, lobes: number, lean: number, seed: number) => {
    const base = ctx.surface(s, theta, -.002), out = ctx.normal(s, theta);
    const back = new Vector3(0, 0, -1);
    const dir = out.clone().multiplyScalar(Math.cos(lean)).addScaledVector(back, Math.sin(lean)).normalize();
    const plane = new Vector3().crossVectors(dir, out.clone().cross(back).normalize()).normalize();
    const skinHere: Skin = ctx.skin(s);
    // The stalk.
    fin(mesh, {
      stations: 2, chordPoints: 3,
      le: (v) => base.clone().addScaledVector(dir, length * .35 * v).addScaledVector(plane, .003),
      te: (v) => base.clone().addScaledVector(dir, length * .35 * v).addScaledVector(plane, -.003),
      thickness: () => .003, side: out.clone().cross(back).normalize(),
      color: () => LEAF_DARK, skin: () => skinHere,
    });
    // The leaves: rounded lobes fanning from the stalk's end.
    const fork = base.clone().addScaledVector(dir, length * .3);
    for (let k = 0; k < lobes; k++) {
      const spread = (k - (lobes - 1) / 2) * .6 + (noise(seed + k, 3) - .5) * .3;
      const leafDir = dir.clone().multiplyScalar(Math.cos(spread)).addScaledVector(plane, Math.sin(spread)).normalize();
      const across = new Vector3().crossVectors(leafDir, out.clone().cross(back).normalize()).normalize();
      const size = length * (.6 + .25 * noise(seed * 3 + k, 7)), width = size * .5;
      fin(mesh, {
        stations: 4, chordPoints: 3,
        le: (v) => fork.clone().addScaledVector(leafDir, size * v).addScaledVector(across, width * .5 * Math.sin(Math.PI * Math.min(1, v * 1.1)) ** .8),
        te: (v) => fork.clone().addScaledVector(leafDir, size * v).addScaledVector(across, -width * .5 * Math.sin(Math.PI * Math.min(1, v * 1.1)) ** .8),
        thickness: () => .0025, side: out.clone().cross(back).normalize(),
        color: (_p, v, u) => mix(mix(LEAF_DARK, LEAF, smoothstep(0, .4, v)), LEAF_TIP, smoothstep(.6, 1, v) * .7 + .15 * Math.abs(u - .5)),
        skin: () => skinHere,
      });
    }
  };
  // Leaves on the head, the back, the belly and along the tail, in pairs.
  for (const side of [1, -1]) {
    leafy(.18, side * .45, .1, 2, -.4, 1 + side);
    leafy(.21, side * 2.3, .08, 2, -.2, 2 + side);
    leafy(.29, side * .3, .17, 3, .3, 3 + side);
    leafy(.4, side * .35, .18, 3, .45, 5 + side);
    leafy(.33, side * 2.55, .15, 3, .45, 7 + side);
    leafy(.47, side * 2.65, .14, 3, .55, 9 + side);
    leafy(.56, side * .45, .13, 3, .55, 11 + side);
    leafy(.67, side * .55, .11, 2, .6, 13 + side);
    leafy(.64, side * 2.6, .1, 2, .65, 15 + side);
    leafy(.8, side * .7, .08, 2, .7, 17 + side);
  }

  // The tiny, see-through dorsal fin on the back that it swims with (on `Dorsal`).
  const dorsal = ctx.midlineFin({
    le: [[-.004, .5], [0, .502], [.014, .51], [.022, .53]],
    te: [[-.004, .6], [0, .598], [.014, .585], [.022, .56]],
    height: .022, thickness: .003, stations: 4, chordPoints: 6, bone: 'Dorsal', color: () => FIN,
  });
  // Tiny pectorals behind the head.
  const pectorals = ctx.pairedFin({
    rootS: .225, theta: 1.4, span: .018, droop: .2, sweep: .3, thickness: .002, stations: 3,
    le: [[-.004, 0], [0, 0], [.01, .004], [.018, .01]],
    te: [[-.004, .014], [0, .015], [.01, .016], [.018, .01]],
    bone: (left) => (left ? 'PectoralL' : 'PectoralR'),
    color: () => FIN,
  });
  // Eyes at the side of the head, behind the snout.
  ctx.eyes({ s: .175, theta: 1.05, radius: .0075, color: EYE, sink: .3 });

  ctx.spineBones();
  // No tail fin: the tail lobe bones sit at the tail's tip, holding nothing.
  const tip = new Vector3(0, ctx.center(.98), z(.98));
  bones.push(
    { name: 'TailUpper', parent: 'Tail', position: tip },
    { name: 'TailLower', parent: 'Tail', position: tip.clone() },
    { name: 'Dorsal', parent: rig.dorsalParent, position: dorsal.base },
    { name: 'PectoralL', parent: 'Root', position: pectorals[0] },
    { name: 'PectoralR', parent: 'Root', position: pectorals[1] },
  );
  return { mesh, bones };
}
