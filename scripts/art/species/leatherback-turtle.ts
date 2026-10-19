/**
 * Leatherback sea turtle (Dermochelys coriacea): the largest turtle, with no plates on its shell: a
 * smooth, leathery carapace shaped like a long teardrop, running back to a point over the tail and
 * raised in seven lengthwise ridges (one down the middle, two pairs over the back and one along each
 * edge); enormous front flippers, half the body long and clawless; small rear flippers joined to the
 * tail; a big rounded head with a notched upper jaw. Black, specked all over with white, the pink spot
 * on top of the head, a pale, mottled underside.
 *
 * Model space: head tip at z = +0.5, tail tip at z = -0.5 (one body length).
 */
import { Vector3 } from 'three';
import { blendSkins, chainSkin, clamp, eye, fin, hex, MeshBuilder, mix, noise, path, smoothstep, TAU, type RGB, type Skin } from './kit';
import type { BoneSpec } from './export';

const SHELL = hex('#24272a'), RIDGE = hex('#363a3e'), SPECK = hex('#d9dcd8'), PLASTRON = hex('#cfd0c8'), PLASTRON_DARK = hex('#6f7370');
const SKIN = hex('#2a2d30'), SKIN_BELOW = hex('#c9cac2'), PINK = hex('#d79a96'), EYE = hex('#060708');
const FLIPPER = hex('#25282b'), FLIPPER_EDGE = hex('#a9aca6'), FLIPPER_BELOW = hex('#b8bab3');

/** The carapace from its front edge, behind the head, to its point over the tail. */
const FRONT = .25, BACK = -.5;
/** Half the carapace's width along it: rounded in front, widest a third of the way back, tapering to the point. */
function halfWidth(z: number) {
  const t = (FRONT - z) / (FRONT - BACK);
  return .262 * Math.sin(Math.PI * Math.min(1, t * 1.55) * .5) ** .55 * (1 - smoothstep(.35, 1, t) ** 1.25) + .004;
}
/** Its height along the midline: a high dome over the front of the body, falling away behind. */
const domeHeight = (z: number) => {
  const t = (FRONT - z) / (FRONT - BACK);
  return .012 + .118 * Math.sin(Math.PI * Math.min(1, t * 1.35 + .08)) ** .7 * (1 - .55 * smoothstep(.45, 1, t));
};
/** The ridges across the back, as a fraction of the half-width from the midline (the edges are ridges too). */
const RIDGES = [0, .38, .7];
/** Lateral positions of the carapace's columns: on each ridge's crest, and between them. */
const LATS = [-1, -.85, -.7, -.54, -.38, -.19, 0, .19, .38, .54, .7, .85, 1];

function carapacePoint(z: number, lat: number) {
  const w = halfWidth(z), h = domeHeight(z), a = Math.abs(lat);
  const ridge = RIDGES.reduce((sum, r) => sum + Math.exp(-(((a - r) / .055) ** 2)), 0);
  const y = .002 + h * (1 - a ** 2.4) ** .55 + .1 * h * ridge * (1 - a ** 6);
  return new Vector3(lat * w, y, z);
}
const plastronPoint = (z: number, lat: number) =>
  new Vector3(lat * halfWidth(z), .002 - .5 * domeHeight(z) * (1 - Math.abs(lat) ** 2.2) ** .6, z);

export function buildLeatherbackTurtle() {
  const mesh = new MeshBuilder();
  const bones: BoneSpec[] = [];
  const zs = Array.from({ length: 26 }, (_, i) => FRONT - (FRONT - BACK) * (i / 25) ** 1.05);
  const ridgeTone = (lat: number) => RIDGES.some((r) => Math.abs(Math.abs(lat) - r) < .02) ? 1 : 0;

  // --- Carapace: a smooth, leathery skin, lightly lit along its ridges ---
  mesh.begin();
  const top = zs.map((z) => LATS.map((lat) => {
    const tone = mix(SHELL, RIDGE, .8 * ridgeTone(lat)), shade = 1 + .07 * noise(z * 30 + lat * 9, 3);
    return mesh.vertex(carapacePoint(z, lat), [tone[0] * shade, tone[1] * shade, tone[2] * shade], { Root: 1 });
  }));
  for (let i = 0; i < zs.length - 1; i++) {
    for (let k = 0; k < LATS.length - 1; k++) mesh.quad(top[i][k], top[i][k + 1], top[i + 1][k + 1], top[i + 1][k]);
  }
  // The front edge: a rounded lip closing the shell under the neck.
  const lip = mesh.vertex(new Vector3(0, .02, FRONT + .006), SHELL, { Root: 1 });
  for (let k = 0; k < LATS.length - 1; k++) mesh.tri(lip, top[0][k + 1], top[0][k]);
  mesh.end({ outward: (i) => new Vector3(mesh.positions[i * 3], 1.5, 0) });

  // --- Plastron: pale and mottled, meeting the carapace at its edges ---
  mesh.begin();
  const under = zs.map((z) => LATS.map((lat) => {
    const p = plastronPoint(z, lat);
    const mottle = smoothstep(.2, .6, noise(z * 22 + lat * 6, 6) + .5 * noise(lat * 14 - z * 9, 2));
    return mesh.vertex(p, mix(PLASTRON, PLASTRON_DARK, .55 * mottle + .3 * smoothstep(.8, 1, Math.abs(lat))), { Root: 1 });
  }));
  for (let i = 0; i < zs.length - 1; i++) {
    for (let k = 0; k < LATS.length - 1; k++) mesh.quad(under[i][k + 1], under[i][k], under[i + 1][k], under[i + 1][k + 1]);
  }
  const chin = mesh.vertex(new Vector3(0, -.01, FRONT + .006), PLASTRON, { Root: 1 });
  for (let k = 0; k < LATS.length - 1; k++) mesh.tri(chin, under[0][k], under[0][k + 1]);
  mesh.end({ outward: () => new Vector3(0, -1, 0) });

  // White specks scattered over the carapace, thicker toward its edges.
  const speck = (p: Vector3, n: Vector3, r: number, color: RGB, skin: Skin) => {
    const t1 = new Vector3(0, 0, 1).cross(n).normalize(), t2 = n.clone().cross(t1);
    mesh.begin();
    const c = mesh.vertex(p.clone().addScaledVector(n, .0012), color, skin, n);
    const ring = Array.from({ length: 5 }, (_, i) => {
      const a = TAU * i / 5 + .4;
      return mesh.vertex(p.clone().addScaledVector(n, .0008).addScaledVector(t1, Math.cos(a) * r).addScaledVector(t2, Math.sin(a) * r * .8), color, skin, n);
    });
    for (let i = 0; i < 5; i++) mesh.tri(c, ring[i], ring[(i + 1) % 5]);
    mesh.end({ closed: false, normals: false, outward: () => n });
  };
  for (let i = 0; i < 70; i++) {
    const z = FRONT - .04 - (FRONT - BACK - .12) * ((i * .618034) % 1);
    const lat = clamp(.96 * noise(i * 2.71 + 1.3, 11) + .2 * Math.sign(noise(i * 1.9, 5)), -.96, .96);
    const p = carapacePoint(z, lat);
    const n = carapacePoint(z, lat + .01).sub(carapacePoint(z, lat - .01)).cross(carapacePoint(z + .01, lat).sub(carapacePoint(z - .01, lat))).normalize();
    if (n.y < 0) n.negate();
    speck(p, n, .0045 + .003 * Math.abs(noise(i * 4.1, 3)), SPECK, { Root: 1 });
  }

  // --- Head and neck: big, rounded, dark and specked, the upper jaw notched with two cusps ---
  mesh.begin();
  const radius = (z: number) => .028 + .044 * Math.sin(Math.PI * clamp((z - .22) / .27)) ** .65;
  const hz = [.22, .26, .3, .34, .375, .405, .43, .452, .47, .485];
  const sides = 12;
  const headSkin = (z: number): Skin => blendSkins({ Root: 1 }, { Head: 1 }, smoothstep(.22, .28, z));
  const rings = hz.map((z) => Array.from({ length: sides }, (_, k) => {
    const a = TAU * k / sides;
    const r = radius(z), up = Math.cos(a);
    // The notch: the front of the upper jaw dips at the midline between two cusps.
    const notch = z > .465 && up > .3 && Math.abs(Math.sin(a)) < .3 ? -.006 : 0;
    const p = new Vector3(Math.sin(a) * r * 1.02, .01 + up * r * .86 + notch - .008 * clamp((z - .43) / .06), z);
    const speckled = noise(z * 80 + k * 3.1, 7) > .7 ? .35 : 0;
    // The small pink spot on the crown.
    const pink = up > .92 && z > .37 && z < .4 ? 1 : 0;
    const color = up < -.55 ? mix(SKIN_BELOW, SKIN, .35) : mix(mix(SKIN, SPECK, speckled), PINK, pink);
    return mesh.vertex(p, color, headSkin(z));
  }));
  for (let j = 0; j < hz.length - 1; j++) {
    for (let k = 0; k < sides; k++) mesh.quad(rings[j][k], rings[j][(k + 1) % sides], rings[j + 1][(k + 1) % sides], rings[j + 1][k]);
  }
  const snout = mesh.vertex(new Vector3(0, -.002, .494), SKIN, { Head: 1 });
  const neck = mesh.vertex(new Vector3(0, .01, .19), SKIN, { Root: 1 });
  for (let k = 0; k < sides; k++) {
    mesh.tri(snout, rings[hz.length - 1][k], rings[hz.length - 1][(k + 1) % sides]);
    mesh.tri(neck, rings[0][(k + 1) % sides], rings[0][k]);
  }
  mesh.end();
  for (const side of [1, -1]) eye(mesh, new Vector3(side * .058, .03, .425), new Vector3(side, .3, .35), .011, EYE, { Head: 1 }, .6);

  // --- Front flippers: enormous, clawless blades swept back from under the front of the shell ---
  for (const side of [1, -1] as const) {
    const s = side;
    const le = path([[s * .2, -.012, .17], [s * .4, -.02, .16], [s * .6, -.03, .05], [s * .76, -.036, -.13], [s * .82, -.038, -.24]]);
    const te = path([[s * .22, -.028, .06], [s * .4, -.034, .04], [s * .58, -.036, -.06], [s * .74, -.038, -.18], [s * .82, -.038, -.24]]);
    const [upper, lower] = side > 0 ? ['FrontL1', 'FrontL2'] : ['FrontR1', 'FrontR2'];
    fin(mesh, {
      stations: 10, le, te,
      thickness: (v) => .034 * (1 - .75 * v),
      side: new Vector3(0, 1, 0),
      // Dark above, pale along the trailing edge (and specked, below); pale and mottled underneath.
      color: (p, _v, u, face) => (face < 0
        ? mix(FLIPPER_BELOW, FLIPPER, .35 * smoothstep(.3, .9, noise(p.x * 12 + p.z * 9, 4)))
        : mix(FLIPPER, FLIPPER_EDGE, smoothstep(.86, 1, u) * .7)),
      skin: (_p, v) => blendSkins({ Root: 1 }, chainSkin(v, [0, .45], [upper, lower], 1), smoothstep(.02, .1, v)),
      chordPoints: 6,
    });
    bones.push(
      { name: upper, parent: 'Root', position: new Vector3(s * .21, -.02, .12) },
      { name: lower, parent: upper, position: new Vector3(s * .5, -.032, .03) },
    );
    // White specks along the flipper's upper face.
    for (let i = 0; i < 16; i++) {
      const v = .12 + .8 * ((i * .618034 + .3) % 1), u = .15 + .6 * Math.abs(noise(i * 3.3 + s, 7));
      const a = le(v), b = te(v);
      const p = a.clone().lerp(b, u).add(new Vector3(0, .034 * (1 - .75 * v) * .5 * Math.sin(Math.PI * Math.min(1, u * 1.2)) * .9, 0));
      const skin = blendSkins({ Root: 1 }, chainSkin(v, [0, .45], [upper, lower], 1), smoothstep(.02, .1, v));
      speck(p, new Vector3(0, 1, 0), .0045 + .002 * Math.abs(noise(i * 5.7, 2)), SPECK, skin);
    }
  }

  // --- Rear flippers: small, rounded paddles webbed to the tail ---
  for (const side of [1, -1] as const) {
    const s = side;
    const name = side > 0 ? 'RearL' : 'RearR';
    fin(mesh, {
      stations: 4,
      le: path([[s * .08, -.012, -.33], [s * .17, -.016, -.37], [s * .21, -.018, -.44]]),
      te: path([[s * .04, -.014, -.42], [s * .12, -.017, -.45], [s * .21, -.018, -.44]]),
      thickness: (v) => .02 * (1 - .6 * v),
      side: new Vector3(0, 1, 0),
      color: (_p, _v, u, face) => (face < 0 ? FLIPPER_BELOW : mix(FLIPPER, FLIPPER_EDGE, smoothstep(.75, 1, u) * .6)),
      skin: (_p, v) => blendSkins({ Root: 1 }, { [name]: 1 }, smoothstep(.05, .3, v)),
    });
    bones.push({ name, parent: 'Root', position: new Vector3(s * .08, -.014, -.36) });
  }

  // --- A short tail, under the carapace's point ---
  mesh.begin();
  const tailRing = (z: number, r: number) => Array.from({ length: 6 }, (_, k) => {
    const a = TAU * k / 6;
    return mesh.vertex(new Vector3(Math.sin(a) * r, -.012 + Math.cos(a) * r * .8, z), SKIN, blendSkins({ Root: 1 }, { Tail: 1 }, smoothstep(.38, .42, -z)));
  });
  const tail = [tailRing(-.38, .02), tailRing(-.44, .012)];
  for (let k = 0; k < 6; k++) mesh.quad(tail[0][k], tail[0][(k + 1) % 6], tail[1][(k + 1) % 6], tail[1][k]);
  const tip = mesh.vertex(new Vector3(0, -.014, -.48), SKIN, { Tail: 1 });
  for (let k = 0; k < 6; k++) mesh.tri(tip, tail[1][k], tail[1][(k + 1) % 6]);
  mesh.end();

  bones.push(
    { name: 'Root', parent: null, position: new Vector3(0, 0, -.02) },
    { name: 'Head', parent: 'Root', position: new Vector3(0, .01, .26) },
    { name: 'Tail', parent: 'Root', position: new Vector3(0, -.012, -.39) },
  );
  return { mesh, bones };
}
