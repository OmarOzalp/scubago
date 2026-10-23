/**
 * Green sea turtle (Chelonia mydas): a low, broad, heart-shaped carapace of smooth, flat, juxtaposed
 * scutes (five vertebrals, four pairs of costals, a ring of marginals, none of them serrated) in
 * marbled olive and brown, each scute streaked outward from its center with amber and dark brown; a
 * small, blunt, rounded head with one pair of prefrontal scales and cream-edged plates; long,
 * paddle-like front flippers with one claw each and small rounded rear flippers; a pale plastron.
 * The shell is rigid; the flippers, head and tail carry the rig's bones.
 *
 * Built from the shared hard-shell parts, like the loggerhead and the hawksbill.
 *
 * Model space: head tip at z = +0.5, tail tip at z = -0.5 (one body length).
 */
import { Vector3 } from 'three';
import { clamp, curve, eye, hex, MeshBuilder, mix, smoothstep, type RGB } from './kit';
import type { BoneSpec } from './export';
import { buildCarapace, buildFrontFlippers, buildPlastron, buildRearFlippers, buildTail, headLine, headPlate, headSurface, loftHead, type HeadSection, type ScutePaint } from './hard-shell';

const OLIVES = ['#6c5b2f', '#7a6832', '#5f5028', '#84723a', '#6a5c35', '#76683b'].map(hex);
const STREAK_DARK = hex('#32281a'), STREAK_AMBER = hex('#b08c3a'), RIM = hex('#8b7b45'), SEAM = hex('#34291a');
const PLASTRON = hex('#e2d8aa'), PLASTRON_EDGE = hex('#cdbf8c'), PLASTRON_SEAM = hex('#b3a672');
const SKIN = hex('#65583a'), SKIN_DARK = hex('#4c4128'), SCALE_EDGE = hex('#cdc08a'), SKIN_BELOW = hex('#d9cfa2'), BEAK = hex('#4c4430'), EYE = hex('#0b0d0b');
const FLIPPER = hex('#5a4e33'), FLIPPER_EDGE = hex('#c9bb86'), FLIPPER_BELOW = hex('#d2c89d'), CLAW = hex('#e8dfb8'), CLAW_TIP = hex('#4a3d2a');

const hash = (a: number, b: number) => {
  const v = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return v - Math.floor(v);
};

/** Marbled olive-brown: each vertex round a scute's edge starts a streak inward, dark brown or amber, so the scute looks sunburst. */
function paintScute(s: ScutePaint): RGB {
  const base = OLIVES[Math.floor(hash(s.seed, 5) * OLIVES.length)];
  if (s.edge === 0) return mix(base, STREAK_AMBER, .16);
  const r = hash(s.seed + s.i * 1.7, s.i), reach = hash(s.seed * 2.3, s.i + 40), tone = hash(s.seed + 3, s.i * 2.1);
  const covered = reach > (1 - s.edge) * 1.2;
  let color = base;
  if (covered && r > .5) color = mix(base, STREAK_DARK, .35 + .4 * tone);
  else if (covered && r < .22) color = mix(base, STREAK_AMBER, .45 + .3 * tone);
  if (s.kind === 'marginal') color = mix(color, RIM, .45 * smoothstep(.9, 1, s.rho));
  return s.edge === 1 ? mix(color, SEAM, .3) : color;
}

/** The head's top and bottom profile and width: short, rounded and blunt, with a beak that does not hook. */
const TOP = curve([[.19, .03], [.24, .044], [.29, .052], [.34, .055], [.39, .05], [.42, .042], [.445, .031], [.462, .019], [.474, .006], [.48, -.008]]);
const BOTTOM = curve([[.19, -.03], [.24, -.04], [.29, -.044], [.34, -.045], [.39, -.043], [.43, -.039], [.455, -.035], [.47, -.032], [.48, -.032]]);
const WIDTH = curve([[.19, .036], [.24, .052], [.29, .061], [.34, .064], [.39, .058], [.42, .05], [.445, .039], [.462, .027], [.474, .015], [.48, .007]]);
const section = (z: number): HeadSection => ({ cy: (TOP(z) + BOTTOM(z)) / 2, hh: (TOP(z) - BOTTOM(z)) / 2, hw: WIDTH(z) });

export function buildGreenTurtle() {
  const mesh = new MeshBuilder();
  const bones: BoneSpec[] = [];
  const CENTER = -.02;

  // --- Carapace and plastron: a broad heart, smooth plain scutes, four pairs of costals ---
  const { plan, rimQs } = buildCarapace(mesh, {
    width: [[0, 0], [.01, .13], [.05, .27], [.12, .36], [.22, .415], [.32, .435], [.44, .428], [.56, .392], [.68, .332], [.8, .25], [.9, .156], [.97, .07], [1, 0]],
    front: .29, back: -.42, center: CENTER, ring: .88,
    dome: { height: .112, power: .6, keel: .004, keelWidth: .06 },
    marginals: { count: 12, from: .075, to: .93, tooth: () => 0 },
    waists: [[.07, .05], [.22, .045], [.38, .045], [.54, .043], [.7, .037], [.86, .03]],
    corners: [[.14, .068], [.3, .072], [.46, .072], [.62, .064], [.77, .05]],
    seams: [{ corner: 2, reach: .37 }, { corner: 3, reach: .53 }, { corner: 4, reach: .69 }],
    pillow: .005, lip: 0, skirt: 'none', seam: SEAM,
    paint: paintScute,
  });
  buildPlastron(mesh, plan, rimQs, CENTER, {
    depth: .054,
    paint: (_x, _z, edge) => mix(PLASTRON, PLASTRON_EDGE, smoothstep(.55, 1, edge) * .8),
    seams: { at: [.16, .3, .46, .64, .8], color: PLASTRON_SEAM, half: .0022 },
  });

  // --- Head and neck: a small, blunt head, dark above with cream-edged scales ---
  const zs = [.19, .225, .26, .295, .33, .36, .39, .415, .435, .452, .465, .474];
  loftHead(mesh, {
    zs, sides: 12, section,
    color: (_p, z, theta, k) => {
      const below = Math.cos(theta) < -.35;
      if ((k === 4 || k === 8) && z > .38) return BEAK;
      if (below) return z > .45 ? BEAK : SKIN_BELOW;
      if (z > .452) return BEAK;
      // Dark scales edged in cream: about a third of the vertices around a ring are pale, more toward the cheeks.
      const side = smoothstep(.9, 1.9, Math.min(theta, 2 * Math.PI - theta));
      const pale = hash(k * 1.3 + 2, Math.round(z * 100)) > .66 ? .5 : 0;
      return mix(mix(SKIN, SKIN_DARK, .35 * (1 - clamp((z - .3) / .1))), SCALE_EDGE, clamp(.3 * side + pale));
    },
    skin: (z) => ({ Root: 1 - smoothstep(.2, .27, z), Head: smoothstep(.2, .27, z) }),
    snout: { p: new Vector3(0, -.013, .481), color: BEAK },
    neck: { p: new Vector3(0, .004, .18), color: SKIN },
  });
  for (const side of [1, -1]) {
    const p = headSurface(section, .385, side * 1.05);
    eye(mesh, p, new Vector3(side, .35, .3), .009, EYE, { Head: 1 }, .6);
  }
  // The mouth's line, from the beak back under the eye.
  for (const side of [1, -1]) {
    headLine(mesh, section, ([[.478, 1.95], [.455, 1.99], [.425, 2.04], [.39, 2.1], [.355, 2.2], [.33, 2.33]] as const).map(([z, t]) => [z, t * side] as const), .035, BEAK, { Head: 1 });
  }
  // The head's plates: the frontal, one pair of prefrontals between the eyes, and the supraoculars.
  const PLATE = hex('#4a3d25');
  headPlate(mesh, section, .335, .378, -.3, .3, PLATE, SCALE_EDGE, { Head: 1 });
  for (const side of [1, -1]) {
    headPlate(mesh, section, .385, .44, side * .05, side * .5, PLATE, SCALE_EDGE, { Head: 1 });
    headPlate(mesh, section, .34, .385, side * .6, side * .98, PLATE, SCALE_EDGE, { Head: 1 });
  }

  // --- Front flippers: long, broad paddles swept back from under the front of the shell, one claw each ---
  buildFrontFlippers(mesh, bones, {
    le: [[.19, -.012, .17], [.36, -.02, .165], [.52, -.03, .07], [.65, -.036, -.09]],
    te: [[.21, -.024, .04], [.36, -.03, .02], [.5, -.035, -.07], [.65, -.036, -.09]],
    stations: 9, chordPoints: 6,
    thickness: (v) => .04 * (1 - .6 * v),
    color: (v, u, face) => {
      if (face < 0) return mix(FLIPPER_BELOW, FLIPPER_EDGE, smoothstep(.8, 1, u) * .5);
      // Big pale-edged scales along the leading edge, a few flecks over the rest.
      const edge = (1 - smoothstep(0, .2, u)) * (hash(Math.round(v * 11), 3) > .3 ? .8 : .3);
      const fleck = hash(Math.round(v * 9), Math.round(u * 5)) > .75 ? .28 : 0;
      return mix(FLIPPER, FLIPPER_EDGE, clamp(Math.max(edge, fleck, smoothstep(.85, 1, u) * .7)));
    },
    shoulder: [.2, -.02, .12], elbow: [.44, -.03, .06], elbowAt: .45,
    claws: { at: [.6], length: .022, radius: .0058, color: CLAW, tip: CLAW_TIP },
  });

  // --- Rear flippers: small rounded paddles either side of the tail ---
  buildRearFlippers(mesh, bones, {
    le: [[.13, -.018, -.31], [.23, -.024, -.37], [.27, -.027, -.46]],
    te: [[.1, -.022, -.37], [.18, -.026, -.44], [.27, -.027, -.46]],
    thickness: (v) => .024 * (1 - .6 * v),
    color: (u, face) => (face < 0 ? FLIPPER_BELOW : mix(FLIPPER, FLIPPER_EDGE, Math.max(smoothstep(.75, 1, u) * .7, (1 - smoothstep(0, .25, u)) * .4))),
    root: [.13, -.02, -.34],
  });

  buildTail(mesh, SKIN, -.39, -.45, -.5, .022, -.012);

  bones.push(
    { name: 'Root', parent: null, position: new Vector3(0, 0, CENTER) },
    { name: 'Head', parent: 'Root', position: new Vector3(0, .004, .26) },
    { name: 'Tail', parent: 'Root', position: new Vector3(0, -.012, -.4) },
  );
  return { mesh, bones };
}
