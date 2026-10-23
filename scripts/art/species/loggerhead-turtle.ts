/**
 * Loggerhead sea turtle (Caretta caretta): a stout turtle with a very large, broad, blocky head and
 * massive jaws, a reddish-brown, heart-shaped carapace tapering at the rear, with five pairs of
 * costal scutes (the green and hawksbill have four), often a few pale barnacles; reddish-brown
 * head and flipper scales edged yellowish cream, short, thick front flippers with two claws, a
 * yellowish plastron. The shell is rigid; the flippers, head and tail carry the rig's bones.
 *
 * Model space: head tip at z = +0.5, tail tip at z = -0.5 (one body length).
 */
import { Vector3 } from 'three';
import { clamp, curve, eye, hex, MeshBuilder, mix, smoothstep, TAU, type RGB } from './kit';
import type { BoneSpec } from './export';
import { buildCarapace, buildFrontFlippers, buildPlastron, buildRearFlippers, buildTail, cone, headLine, headPlate, headSurface, loftHead, type HeadSection, type ScutePaint } from './hard-shell';

const BROWNS = ['#ae572e', '#9c4826', '#bb6636', '#904222', '#a85230'].map(hex);
const DARK = hex('#4e2412'), SEAM = hex('#43200f'), RIM = hex('#c58e4e'), WORN = hex('#c07a42');
const PLASTRON = hex('#e6d28c'), PLASTRON_EDGE = hex('#c9a45e'), PLASTRON_SEAM = hex('#b08e48');
const SKIN = hex('#843c1c'), SKIN_DARK = hex('#5c2813'), SCALE_EDGE = hex('#dcb86e'), SKIN_BELOW = hex('#dfc884'), BEAK = hex('#563120'), JAW = hex('#e3cd8a'), EYE = hex('#0c0805');
const FLIPPER = hex('#843c1c'), FLIPPER_EDGE = hex('#dcb86e'), FLIPPER_BELOW = hex('#dfc884'), CLAW = hex('#eadcb4'), CLAW_TIP = hex('#5a3a28');
const BARNACLE = hex('#e4ddcb'), BARNACLE_TIP = hex('#a89f8c');

const hash = (a: number, b: number) => {
  const v = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return v - Math.floor(v);
};

/** Reddish-brown scutes, each a little different, darker toward its seams, the rim a warmer yellow-brown. */
function paintScute(s: ScutePaint): RGB {
  const base = BROWNS[Math.floor(hash(s.seed, 5) * BROWNS.length)];
  const worn = hash(s.seed, s.i * .7 + 2) > .8 && s.edge < 1 ? .35 : 0;
  let color = mix(base, WORN, worn);
  color = mix(color, DARK, .5 * smoothstep(.2, 1, s.edge) * (.6 + .4 * hash(s.seed + s.i, 9)));
  if (s.kind === 'marginal') color = mix(color, RIM, .55 * smoothstep(.9, 1, s.rho));
  return s.edge === 1 ? mix(color, SEAM, .3) : color;
}

const TOP = curve([[.15, .036], [.2, .048], [.26, .062], [.31, .069], [.36, .068], [.4, .06], [.43, .048], [.455, .034], [.475, .018], [.488, 0], [.497, -.02], [.5, -.036]]);
const BOTTOM = curve([[.15, -.038], [.2, -.052], [.26, -.062], [.31, -.065], [.36, -.064], [.4, -.059], [.43, -.054], [.455, -.046], [.475, -.036], [.488, -.03], [.497, -.034], [.5, -.04]]);
const WIDTH = curve([[.15, .047], [.2, .068], [.26, .09], [.3, .1], [.34, .098], [.38, .088], [.42, .073], [.45, .058], [.47, .046], [.488, .032], [.5, .015]]);
const section = (z: number): HeadSection => ({ cy: (TOP(z) + BOTTOM(z)) / 2, hh: (TOP(z) - BOTTOM(z)) / 2, hw: WIDTH(z), boxy: 2.7 });

export function buildLoggerheadTurtle() {
  const mesh = new MeshBuilder();
  const bones: BoneSpec[] = [];
  const CENTER = -.02;

  // --- Carapace and plastron: heart-shaped, five pairs of costals ---
  const { plan, rimQs } = buildCarapace(mesh, {
    width: [[0, 0], [.01, .12], [.05, .25], [.12, .34], [.22, .385], [.32, .395], [.44, .377], [.56, .335], [.68, .275], [.8, .2], [.9, .12], [.97, .05], [1, 0]],
    front: .29, back: -.41, center: CENTER, ring: .88,
    dome: { height: .108, power: .55, keel: .008, keelWidth: .06 },
    marginals: { count: 11, from: .075, to: .93, tooth: () => 0 },
    waists: [[.07, .05], [.24, .052], [.4, .05], [.56, .045], [.72, .04], [.88, .03]],
    corners: [[.15, .075], [.32, .075], [.48, .07], [.64, .06], [.79, .045]],
    seams: [{ corner: 1, reach: .21 }, { corner: 2, reach: .39 }, { corner: 3, reach: .55 }, { corner: 4, reach: .71 }],
    pillow: .006, lip: 0, skirt: 'none', seam: SEAM,
    paint: paintScute,
  });
  buildPlastron(mesh, plan, rimQs, CENTER, {
    depth: .05,
    paint: (_x, _z, edge) => mix(PLASTRON, PLASTRON_EDGE, smoothstep(.55, 1, edge) * .8),
    seams: { at: [.16, .3, .46, .64, .8], color: PLASTRON_SEAM, half: .0024 },
  });
  // A few pale barnacles on the shell.
  for (const [x, z, r] of [[.12, -.12, .014], [.145, -.145, .01], [-.15, .0, .012], [-.13, -.03, .008], [.05, -.24, .01]] as const) {
    const y = plan.surface(x, z), e = .01;
    const normal = new Vector3(plan.surface(x - e, z) - plan.surface(x + e, z), 2 * e, plan.surface(x, z - e) - plan.surface(x, z + e)).normalize();
    cone(mesh, new Vector3(x, y - .002, z), normal, r, r * 1.2, BARNACLE, BARNACLE_TIP, { Root: 1 }, 6, r * .4);
  }

  // --- Head and neck: huge, broad and blocky, massive jaws ---
  const zs = [.15, .19, .23, .27, .31, .345, .38, .41, .435, .455, .471, .484, .494];
  loftHead(mesh, {
    zs, sides: 14, section,
    color: (_p, z, theta, k) => {
      const below = Math.cos(theta) < -.4;
      if ((k === 4 || k === 10) && z > .33) return BEAK;
      if (below) return z > .3 ? JAW : SKIN_BELOW;
      if (z > .47) return BEAK;
      // Reddish brown on top, yellowing down the cheeks, flecked with pale scale margins.
      const side = smoothstep(.9, 1.9, Math.min(theta, TAU - theta));
      const fleck = hash(k * 1.3 + 2, Math.round(z * 90)) > .8 ? .4 : 0;
      return mix(mix(SKIN, SKIN_DARK, .3 * (1 - clamp((z - .3) / .1))), SCALE_EDGE, clamp(.75 * side + fleck));
    },
    skin: (z) => ({ Root: 1 - smoothstep(.17, .25, z), Head: smoothstep(.17, .25, z) }),
    snout: { p: new Vector3(0, -.047, .5), color: BEAK },
    neck: { p: new Vector3(0, 0, .12), color: SKIN },
  });
  for (const side of [1, -1]) {
    const p = headSurface(section, .385, side * 1.15);
    eye(mesh, p, new Vector3(side, .35, .25), .0075, EYE, { Head: 1 }, .6);
  }

  // The mouth's long line, from the beak's tip back under the eye.
  for (const side of [1, -1]) {
    headLine(mesh, section, ([[.5, 1.95], [.48, 1.98], [.45, 2.03], [.41, 2.1], [.37, 2.2], [.33, 2.35], [.3, 2.5]] as const).map(([z, t]) => [z, t * side] as const), .04, BEAK, { Head: 1 });
  }
  // The head's big plates: the frontal, two pairs of prefrontals and the supraoculars.
  const PLATE = hex('#6a3118');
  headPlate(mesh, section, .335, .382, -.32, .32, PLATE, SCALE_EDGE, { Head: 1 });
  for (const side of [1, -1]) {
    headPlate(mesh, section, .425, .465, side * .06, side * .5, PLATE, SCALE_EDGE, { Head: 1 });
    headPlate(mesh, section, .385, .422, side * .06, side * .6, PLATE, SCALE_EDGE, { Head: 1 });
    headPlate(mesh, section, .34, .39, side * .68, side * 1.05, PLATE, SCALE_EDGE, { Head: 1 });
  }

  // --- Front flippers: short, thick paddles with two claws each ---
  buildFrontFlippers(mesh, bones, {
    le: [[.19, -.012, .14], [.3, -.02, .14], [.39, -.03, .08], [.47, -.038, -.04]],
    te: [[.21, -.024, -.01], [.31, -.032, -.035], [.4, -.038, -.045], [.47, -.038, -.04]],
    stations: 8, chordPoints: 6,
    thickness: (v) => .05 * (1 - .45 * v),
    color: (v, u, face) => {
      if (face < 0) return mix(FLIPPER_BELOW, FLIPPER_EDGE, smoothstep(.8, 1, u) * .5);
      const edge = (1 - smoothstep(0, .13, u)) * (hash(Math.round(v * 9), 3) > .3 ? .75 : .3);
      const fleck = hash(Math.round(v * 8), Math.round(u * 5)) > .72 ? .3 : 0;
      return mix(FLIPPER, FLIPPER_EDGE, clamp(Math.max(edge, fleck, smoothstep(.9, 1, u) * .6)));
    },
    shoulder: [.19, -.02, .1], elbow: [.36, -.03, .05], elbowAt: .45,
    claws: { at: [.55, .72], length: .025, radius: .0065, color: CLAW, tip: CLAW_TIP },
  });

  // --- Rear flippers: broad paddles either side of the tail ---
  buildRearFlippers(mesh, bones, {
    le: [[.12, -.016, -.3], [.2, -.022, -.36], [.24, -.025, -.45]],
    te: [[.08, -.02, -.35], [.16, -.024, -.42], [.24, -.025, -.45]],
    thickness: (v) => .024 * (1 - .6 * v),
    color: (u, face) => (face < 0 ? FLIPPER_BELOW : mix(FLIPPER, FLIPPER_EDGE, Math.max(smoothstep(.75, 1, u) * .75, (1 - smoothstep(0, .25, u)) * .5))),
    root: [.12, -.02, -.33],
  });

  buildTail(mesh, SKIN, -.39, -.45, -.495, .03, -.012);

  bones.push(
    { name: 'Root', parent: null, position: new Vector3(0, 0, CENTER) },
    { name: 'Head', parent: 'Root', position: new Vector3(0, .004, .24) },
    { name: 'Tail', parent: 'Root', position: new Vector3(0, -.012, -.4) },
  );
  return { mesh, bones };
}
