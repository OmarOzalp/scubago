/**
 * Hawksbill sea turtle (Eretmochelys imbricata): a small, narrow turtle with an elongated oval
 * carapace of thick, overlapping (imbricate) scutes, so its rear margin is serrated like a saw, in
 * the famous tortoiseshell: an amber base streaked with dark brown and black and flared with
 * yellow. A slim head tapering to a pointed, hooked, bird-like beak with two pairs of prefrontal
 * scales; dark flippers and head scales edged in cream, two claws on each front flipper; a yellowish
 * plastron. The shell is rigid; the flippers, head and tail carry the rig's bones.
 *
 * Model space: head tip at z = +0.5, tail tip at z = -0.5 (one body length).
 */
import { Vector3 } from 'three';
import { clamp, curve, eye, hex, MeshBuilder, mix, smoothstep, type RGB } from './kit';
import type { BoneSpec } from './export';
import { buildCarapace, buildFrontFlippers, buildPlastron, buildRearFlippers, buildTail, headLine, headPlate, headSurface, loftHead, type HeadSection, type ScutePaint } from './hard-shell';

const AMBER = hex('#d99a36'), HONEY = hex('#ebbc52'), FLARE = hex('#f6da7a'), BROWN = hex('#6a3213'), BLACK = hex('#1c0f08');
const SEAM = hex('#4a2a12');
const PLASTRON = hex('#e0c878'), PLASTRON_EDGE = hex('#b98a3a'), PLASTRON_SEAM = hex('#a98638');
const SKIN = hex('#34200f'), SKIN_DARK = hex('#26150b'), SCALE_EDGE = hex('#dcb85c'), SKIN_BELOW = hex('#dcc27a'), BEAK = hex('#2a1d12'), JAW = hex('#e2c985'), EYE = hex('#0c0907');
const FLIPPER = hex('#2c190c'), FLIPPER_EDGE = hex('#dfba58'), FLIPPER_BELOW = hex('#dcc27a'), CLAW = hex('#ece0b4'), CLAW_TIP = hex('#4a3a28');

const hash = (a: number, b: number) => {
  const v = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return v - Math.floor(v);
};

/** Tortoiseshell: amber at a scute's middle, streaked inward from its edge with brown, black and yellow flares. */
function paintScute(s: ScutePaint): RGB {
  const marginal = s.kind !== 'vertebral' && s.kind !== 'costal';
  const base = mix(AMBER, HONEY, .1 + .7 * hash(s.seed, 99));
  if (s.edge === 0) return mix(base, HONEY, .35);
  // Each vertex around the edge starts a streak that runs inward a random distance: dark, a yellow flare, or none.
  const r = hash(s.seed + s.i * 1.7, s.i), reach = hash(s.seed * 2.3, s.i + 40), tone = hash(s.seed + 3, s.i * 2.1);
  const covered = reach > (1 - s.edge) * 1.15;
  let color = base;
  if (covered && r > (marginal ? .4 : .5)) color = mix(BROWN, BLACK, smoothstep(.45, .9, tone));
  else if (covered && r < (marginal ? .07 : .14)) color = FLARE;
  return s.edge === 1 ? mix(color, SEAM, .3) : color;
}

/** The head's top and bottom profile: a slim skull, a long rostrum and an upper beak hooking down past the lower jaw. */
const TOP = curve([[.19, .04], [.25, .05], [.3, .056], [.34, .052], [.38, .04], [.41, .028], [.44, .018], [.46, .012], [.472, .004], [.484, -.006], [.492, -.02], [.497, -.034], [.5, -.042]]);
const BOTTOM = curve([[.19, -.03], [.25, -.036], [.3, -.04], [.34, -.039], [.38, -.036], [.42, -.034], [.46, -.033], [.478, -.03], [.488, -.03], [.494, -.036], [.5, -.044]]);
const WIDTH = curve([[.19, .04], [.25, .05], [.3, .052], [.34, .046], [.38, .036], [.42, .026], [.45, .02], [.47, .015], [.482, .01], [.492, .006], [.5, .002]]);
const section = (z: number): HeadSection => ({ cy: (TOP(z) + BOTTOM(z)) / 2, hh: (TOP(z) - BOTTOM(z)) / 2, hw: WIDTH(z) });

export function buildHawksbillTurtle() {
  const mesh = new MeshBuilder();
  const bones: BoneSpec[] = [];
  const CENTER = -.03;

  // --- Carapace and plastron ---
  const { plan, rimQs } = buildCarapace(mesh, {
    width: [[0, 0], [.01, .09], [.045, .2], [.12, .29], [.25, .345], [.38, .36], [.52, .345], [.66, .3], [.79, .23], [.9, .14], [.97, .06], [1, 0]],
    front: .3, back: -.4, center: CENTER, ring: .88,
    dome: { height: .1, power: .55, keel: .012, keelWidth: .05 },
    marginals: { count: 11, from: .075, to: .93, tooth: (k) => [0, 0, 0, 0, 0, 0, .004, .008, .012, .012, .009][k] },
    waists: [[.07, .042], [.22, .036], [.38, .036], [.54, .035], [.7, .03], [.86, .026]],
    corners: [[.14, .055], [.3, .058], [.46, .058], [.62, .052], [.77, .042]],
    seams: [{ corner: 2, reach: .37 }, { corner: 3, reach: .53 }, { corner: 4, reach: .69 }],
    pillow: .005, lip: .005, skirt: 'rear', seam: SEAM,
    paint: paintScute,
  });
  buildPlastron(mesh, plan, rimQs, CENTER, {
    depth: .044,
    paint: (_x, _z, edge) => mix(PLASTRON, PLASTRON_EDGE, smoothstep(.55, 1, edge) * .8),
    seams: { at: [.16, .3, .46, .64, .8], color: PLASTRON_SEAM, half: .0022 },
  });

  // --- Head and neck: slim, tapering to a hooked beak ---
  const zs = [.19, .23, .27, .31, .345, .375, .4, .425, .447, .462, .475, .485, .492, .4965];
  loftHead(mesh, {
    zs, sides: 12, section,
    color: (_p, z, theta, k) => {
      const below = Math.cos(theta) < -.45;
      const mouth = (k === 4 || k === 8) && z > .36;
      if (mouth) return BEAK;
      if (below) return z > .36 && z < .478 ? JAW : z >= .478 ? BEAK : SKIN_BELOW;
      if (z > .47) return BEAK;
      // Dark scales edged in yellow-cream: about a third of the vertices around a ring are pale.
      const pale = hash(k * 1.3 + 2, Math.round(z * 100)) > .66 ? .55 : 0;
      return mix(mix(SKIN, SKIN_DARK, .4 * (1 - clamp((z - .3) / .1))), SCALE_EDGE, pale);
    },
    skin: (z) => ({ Root: 1 - smoothstep(.2, .27, z), Head: smoothstep(.2, .27, z) }),
    snout: { p: new Vector3(0, -.047, .501), color: BEAK },
    neck: { p: new Vector3(0, .004, .18), color: SKIN },
  });
  for (const side of [1, -1]) {
    const p = headSurface(section, .375, side * 1.05);
    eye(mesh, p, new Vector3(side, .4, .2), .0072, EYE, { Head: 1 }, .6);
  }

  // The mouth's line, from the beak's hooked tip back to the corner under the eye.
  for (const side of [1, -1]) {
    headLine(mesh, section, ([[.492, 1.95], [.47, 1.98], [.44, 2.02], [.4, 2.07], [.36, 2.17], [.335, 2.35]] as const).map(([z, t]) => [z, t * side] as const), .035, BEAK, { Head: 1 });
  }
  // The head's big plates: the frontal, two pairs of prefrontals between the eyes, and the supraoculars.
  const PLATE = hex('#3f2514');
  headPlate(mesh, section, .33, .369, -.3, .3, PLATE, SCALE_EDGE, { Head: 1 });
  for (const side of [1, -1]) {
    headPlate(mesh, section, .408, .442, side * .05, side * .42, PLATE, SCALE_EDGE, { Head: 1 });
    headPlate(mesh, section, .372, .405, side * .05, side * .5, PLATE, SCALE_EDGE, { Head: 1 });
    headPlate(mesh, section, .345, .388, side * .6, side * .95, PLATE, SCALE_EDGE, { Head: 1 });
  }

  // --- Front flippers: long, slim paddles swept back, two claws on each ---
  buildFrontFlippers(mesh, bones, {
    le: [[.17, -.012, .15], [.33, -.02, .15], [.48, -.028, .064], [.613, -.034, -.108]],
    te: [[.19, -.022, .04], [.34, -.03, 0], [.47, -.034, -.06], [.613, -.034, -.108]],
    stations: 9, chordPoints: 6,
    thickness: (v) => .034 * (1 - .55 * v),
    color: (v, u, face) => {
      if (face < 0) return mix(FLIPPER_BELOW, FLIPPER_EDGE, smoothstep(.8, 1, u) * .5);
      // Dark scales with cream margins: big pale-edged scales along the leading edge, flecks over the rest.
      const edge = (1 - smoothstep(.0, .22, u)) * (hash(Math.round(v * 11), 3) > .3 ? .85 : .35);
      const fleck = hash(Math.round(v * 9), Math.round(u * 5)) > .72 ? .3 : 0;
      return mix(FLIPPER, FLIPPER_EDGE, clamp(Math.max(edge, fleck, smoothstep(.85, 1, u) * .7)));
    },
    shoulder: [.17, -.02, .11], elbow: [.38, -.03, .05], elbowAt: .45,
    claws: { at: [.5, .66], length: .024, radius: .006, color: CLAW, tip: CLAW_TIP },
  });

  // --- Rear flippers: small paddles either side of the tail ---
  buildRearFlippers(mesh, bones, {
    le: [[.11, -.016, -.3], [.19, -.022, -.35], [.22, -.025, -.44]],
    te: [[.08, -.02, -.35], [.15, -.024, -.41], [.22, -.025, -.44]],
    thickness: (v) => .02 * (1 - .6 * v),
    color: (u, face) => (face < 0 ? FLIPPER_BELOW : mix(FLIPPER, FLIPPER_EDGE, Math.max(smoothstep(.75, 1, u) * .75, (1 - smoothstep(0, .25, u)) * .5))),
    root: [.11, -.02, -.33],
  });

  buildTail(mesh, SKIN, -.38, -.44, -.495, .03, -.012);

  bones.push(
    { name: 'Root', parent: null, position: new Vector3(0, 0, CENTER) },
    { name: 'Head', parent: 'Root', position: new Vector3(0, .004, .26) },
    { name: 'Tail', parent: 'Root', position: new Vector3(0, -.012, -.4) },
  );
  return { mesh, bones };
}
