/**
 * Leafy seadragon (Phycodurus eques): a seahorse's cousin from southern Australia's kelp and weed
 * beds, disguised as drifting seaweed. An S-shaped, bony body in a seahorse's armour of rings: a
 * small, horse-like head bowed a little on an arched neck, a long, tubular snout ending in a tiny
 * mouth, a deep, pot-bellied trunk, and a thin tail with no fin, curling down; and rounded, frond-like
 * lobes on short spines from the head, back, belly and tail, the seaweed it hides as.
 * Tiny, see-through fins (a little dorsal on the back, pectorals behind the head) do all its
 * swimming. Yellow-ochre and olive with thin pale bands, rosy on the head; the leaves golden-yellow with olive.
 */
import { Vector3 } from 'three';
import { SWIM_RIGS, type SharkRig } from '../../../src/lib/marine-rigs';
import { fin, hex, mix, noise, smoothstep, type RGB, type Skin } from './kit';
import { sharkContext, type SharkDesign } from './shark';

const BODY = hex('#b8913e'), OLIVE = hex('#8a8a3c'), BAND = hex('#e2d39a'), ROSE = hex('#b97e78');
const LEAF = hex('#d2a73f'), LEAF_TIP = hex('#e8cf6a'), LEAF_DARK = hex('#9a8a34'), FIN = hex('#b39a52'), EYE = hex('#2a1f14');

const rig = SWIM_RIGS['leafy-seadragon'] as SharkRig;
/** Sections along each leaf (the base and tip are single points) and points across it. */
const LEAF_STATIONS = 9, LEAF_CHORD = 5;

const skin = (s: number, theta: number, p: Vector3): RGB => {
  // Olive along the back, ochre on the flanks; thin pale bands at each bony ring; rosy on the head.
  const base = mix(OLIVE, BODY, smoothstep(.3, 1.4, Math.abs(theta)));
  const ring = smoothstep(.75, .95, Math.cos((s - .2) * 150)) * smoothstep(.2, .26, s) * .7;
  return mix(mix(base, BAND, ring), ROSE, (1 - smoothstep(.12, .3, s)) * smoothstep(.14, .2, s) * .6 + .1 * noise(p.z * 50, 3));
};

export const LEAFY_SEADRAGON: SharkDesign = {
  rig, nose: .45, bodyEnd: .995, frontDome: .004,
  // A long tubular snout, a small deep head on a slim neck, a deep, pot-bellied, ridged trunk, and a
  // long thin tail.
  width: [[0, .004], [.04, .005], [.12, .006], [.16, .012], [.2, .017], [.24, .014], [.3, .02], [.38, .023], [.47, .021], [.56, .014], [.68, .009], [.84, .006], [.995, .002]],
  top: [[0, .004], [.04, .005], [.12, .006], [.16, .017], [.2, .027], [.24, .021], [.3, .03], [.38, .036], [.47, .031], [.56, .018], [.68, .011], [.84, .007], [.995, .002]],
  bottom: [[0, .004], [.04, .005], [.12, .006], [.16, .014], [.2, .022], [.24, .021], [.3, .042], [.38, .064], [.47, .056], [.56, .028], [.68, .013], [.84, .006], [.995, .002]],
  // An S: the snout held a little down, the neck arched, the back high over the belly, the tail sloping
  // away and curling down at its end.
  center: [[0, -.062], [.06, -.042], [.12, -.022], [.18, -.006], [.24, .006], [.32, .01], [.45, .002], [.58, -.012], [.7, -.032], [.82, -.09], [.92, -.14], [.995, -.19]],
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
    // The spine it grows from, short.
    fin(mesh, {
      stations: 2, chordPoints: 3,
      le: (v) => base.clone().addScaledVector(dir, length * .2 * v).addScaledVector(plane, .003),
      te: (v) => base.clone().addScaledVector(dir, length * .2 * v).addScaledVector(plane, -.003),
      thickness: () => .003, side: out.clone().cross(back).normalize(),
      color: () => LEAF_DARK, skin: () => skinHere,
    });
    // The fronds: long, wavy-edged lobes like kelp blades, fanning from the spine's end and streaming back.
    const fork = base.clone().addScaledVector(dir, length * .18);
    for (let k = 0; k < lobes; k++) {
      const spread = (k - (lobes - 1) / 2) * .7 + (noise(seed + k, 3) - .5) * .3;
      const leafDir = dir.clone().multiplyScalar(Math.cos(spread)).addScaledVector(plane, Math.sin(spread)).normalize();
      const across = new Vector3().crossVectors(leafDir, out.clone().cross(back).normalize()).normalize();
      const size = length * 1.2 * (.75 + .25 * noise(seed * 3 + k, 7)), width = size * .42;
      // A rounded paddle, broadest past its middle and rounded at the tip, its edges gently rippled.
      const edge = (v: number) => width * .5 * Math.sqrt(Math.max(0, 1 - ((v - .55) / (v > .55 ? .45 : .55)) ** 2)) * (1 + .12 * Math.sin(v * Math.PI * 3 + seed));
      blade(fork, leafDir, across, size, width, edge, seed + k, skinHere);
    }
  };

  /**
   * One leaf as a thin, slightly folded sheet (the skin is double-sided): a rib down the middle, the two halves
   * tilting a little back from it, the whole blade rippling along its length like kelp in a current. A single
   * smooth surface rather than a closed shell, so it reads as a ribbon, not a chunky wedge.
   */
  function blade(fork: Vector3, leafDir: Vector3, across: Vector3, size: number, width: number, edge: (v: number) => number, seed: number, skinHere: Skin) {
    const faceNormal = new Vector3().crossVectors(leafDir, across).normalize();
    const point = (v: number, a: number) => fork.clone()
      .addScaledVector(leafDir, size * v)
      .addScaledVector(across, edge(v) * a)
      .addScaledVector(faceNormal, edge(v) * .13 * (1 - Math.abs(a)) + width * .09 * Math.sin(v * Math.PI * 2.2 + seed) * smoothstep(0, .3, v));
    const color = (v: number, a: number) => mix(mix(LEAF_DARK, LEAF, smoothstep(0, .4, v)), LEAF_TIP, smoothstep(.6, 1, v) * .7 + .15 * Math.abs(a));
    mesh.begin();
    const baseP = point(0, 0), tipP = point(1, 0);
    const base = mesh.vertex(baseP, LEAF_DARK, skinHere), tip = mesh.vertex(tipP, LEAF_TIP, skinHere);
    const rows: number[][] = [];
    for (let i = 1; i < LEAF_STATIONS - 1; i++) {
      const v = i / (LEAF_STATIONS - 1);
      rows.push(Array.from({ length: LEAF_CHORD }, (_, j) => {
        const a = 2 * j / (LEAF_CHORD - 1) - 1, p = point(v, a);
        return mesh.vertex(p, color(v, a), skinHere);
      }));
    }
    for (let j = 0; j < LEAF_CHORD - 1; j++) {
      mesh.tri(base, rows[0][j + 1], rows[0][j]);
      mesh.tri(tip, rows[rows.length - 1][j], rows[rows.length - 1][j + 1]);
      for (let i = 0; i < rows.length - 1; i++) mesh.quad(rows[i][j], rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j]);
    }
    mesh.end({ closed: false, normals: true, outward: () => faceNormal });
  }
  // Leaves on the head, the back, the belly and along the tail, in pairs.
  for (const side of [1, -1]) {
    leafy(.18, side * .45, 0.08, 1, -.4, 1 + side);
    leafy(.21, side * 2.3, 0.07, 1, -.2, 2 + side);
    leafy(.29, side * .3, 0.2, 2, .3, 3 + side);
    leafy(.4, side * .35, 0.21, 2, .45, 5 + side);
    leafy(.33, side * 2.55, 0.18, 2, .45, 7 + side);
    leafy(.47, side * 2.65, 0.17, 2, .55, 9 + side);
    leafy(.56, side * .45, 0.15, 2, .55, 11 + side);
    leafy(.67, side * .55, 0.12, 1, .6, 13 + side);
    leafy(.64, side * 2.6, 0.11, 1, .65, 15 + side);
    leafy(.8, side * .7, 0.08, 1, .7, 17 + side);
    leafy(.86, side * 2.5, 0.075, 1, .7, 19 + side);
    leafy(.92, side * .8, 0.07, 1, .75, 21 + side);
  }

  // The tiny, see-through dorsal fin on the back that it swims with (on `Dorsal`).
  const dorsal = ctx.midlineFin({
    le: [[-.004, .5], [0, .502], [.022, .51], [.035, .53]],
    te: [[-.004, .6], [0, .598], [.022, .585], [.035, .56]],
    height: .035, thickness: .003, stations: 4, chordPoints: 6, bone: 'Dorsal', color: () => FIN,
  });
  // Tiny pectorals behind the head.
  const pectorals = ctx.pairedFin({
    rootS: .225, theta: 1.4, span: .03, droop: .2, sweep: .3, thickness: .002, stations: 4,
    le: [[-.004, 0], [0, 0], [.016, .006], [.03, .016]],
    te: [[-.004, .022], [0, .024], [.016, .026], [.03, .016]],
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
