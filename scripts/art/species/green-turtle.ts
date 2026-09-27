/**
 * Green sea turtle (Chelonia mydas): a low, heart-shaped carapace built as a
 * flat-shaded mosaic of scutes (vertebral, costal and marginal plates), a pale
 * flat plastron, a small blunt head with pale-edged scales, long swept-back
 * front flippers and small rounded rear flippers. The shell is rigid; the
 * flippers, head and tail carry the rig's bones.
 *
 * Model space: head tip at z = +0.5, tail tip at z = -0.5 (one body length).
 */
import { Vector3 } from 'three';
import { blendSkins, chainSkin, clamp, eye, fin, hex, MeshBuilder, mix, noise, path, smoothstep, TAU, type RGB, type Skin } from './kit';
import type { BoneSpec } from './export';

const SCUTES = ['#5c5833', '#6d683c', '#524f2c', '#7b7042', '#625c35', '#727043'].map(hex);
const SEAM = hex('#3d3b25'), PLASTRON = hex('#e2d8aa'), PLASTRON_EDGE = hex('#cdbf8c');
const SKIN = hex('#5c583a'), SCALE_EDGE = hex('#c9c09a'), SKIN_BELOW = hex('#d6cda2'), BEAK = hex('#48442f');
const FLIPPER = hex('#4e4a33'), FLIPPER_EDGE = hex('#bcb38a'), FLIPPER_BELOW = hex('#cfc59c'), EYE = hex('#0b0d0b');

/** Shell planform around its center: radius by angle from straight ahead (+Z toward +X). */
const CENTER_Z = -.02;
function rim(a: number) {
  const ahead = Math.max(0, Math.cos(a)), behind = Math.max(0, -Math.cos(a));
  // Rounded front with a shallow notch for the neck, widest just ahead of center, tapering behind.
  return .3 + .03 * ahead ** 1.5 + .1 * behind ** 2.2 - .028 * Math.exp(-((Math.atan2(Math.sin(a), Math.cos(a)) / .32) ** 2));
}
// Carapace and plastron meet exactly at the rim, so the shell has no seam from the side.
const shellTop = (rho: number) => .001 + .118 * (1 - rho * rho) ** .6;
const shellBottom = (rho: number) => .001 - .054 * (1 - rho ** 2.5) ** .7;
const shellPoint = (rho: number, a: number, y: (rho: number) => number) =>
  new Vector3(rho * rim(a) * Math.sin(a), y(rho), CENTER_Z + rho * rim(a) * Math.cos(a));

/** Which scute a point on the carapace belongs to, and that plate's color. */
function scute(p: Vector3, rho: number): { id: number; color: RGB } {
  let id: number;
  if (rho > .86) id = 100 + Math.round((Math.atan2(p.x, p.z - CENTER_Z) / TAU + 1) * 26) % 26; // marginals
  else if (Math.abs(p.x) < .085) id = Math.floor(clamp((.27 - p.z) / .6, 0, .999) * 5); // vertebrals
  else id = 10 + (p.x > 0 ? 0 : 4) + Math.floor(clamp((.24 - p.z) / .5, 0, .999) * 4); // costals
  const base = SCUTES[(id * 7 + 3) % SCUTES.length];
  // Plates are a touch darker along their outer ring, suggesting the seams between them.
  return { id, color: rho > .86 ? mix(base, SEAM, .25) : base };
}

export function buildGreenTurtle() {
  const mesh = new MeshBuilder();
  const bones: BoneSpec[] = [];
  const rhos = [0, .22, .42, .6, .75, .87, 1];
  const angles = Array.from({ length: 22 }, (_, k) => TAU * k / 22);

  // --- Carapace: flat-shaded plates, each triangle colored by the scute it sits on ---
  mesh.begin();
  const plate = (a: Vector3, b: Vector3, c: Vector3, rho: number) => {
    const centroid = a.clone().add(b).add(c).multiplyScalar(1 / 3);
    const { id, color } = scute(centroid, rho);
    const shade = 1 + .09 * noise(id * 3.7 + centroid.x * 20, 5);
    const tone: RGB = [color[0] * shade, color[1] * shade, color[2] * shade];
    const n = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    if (n.y < 0) n.negate();
    const ids = [a, b, c].map((p) => mesh.vertex(p, tone, { Root: 1 }, n));
    mesh.tri(ids[0], ids[1], ids[2]);
  };
  for (let r = 0; r < rhos.length - 1; r++) {
    for (let k = 0; k < angles.length; k++) {
      const a0 = angles[k], a1 = angles[(k + 1) % angles.length];
      const mid = (rhos[r] + rhos[r + 1]) / 2;
      const p00 = shellPoint(rhos[r], a0, shellTop), p01 = shellPoint(rhos[r], a1, shellTop);
      const p10 = shellPoint(rhos[r + 1], a0, shellTop), p11 = shellPoint(rhos[r + 1], a1, shellTop);
      if (r === 0) plate(p00, p11, p10, mid);
      else { plate(p00, p11, p10, mid); plate(p00, p01, p11, mid); }
    }
  }
  mesh.end({ closed: false, normals: false, outward: () => new Vector3(0, 1, 0) });

  // --- Plastron: the flatter, pale underside, sharing the rim with the carapace ---
  mesh.begin();
  const under = rhos.map((rho) => angles.map((a) => {
    const p = shellPoint(rho, a, shellBottom);
    return mesh.vertex(p, mix(PLASTRON, PLASTRON_EDGE, smoothstep(.7, 1, rho)), { Root: 1 });
  }));
  for (let r = 0; r < rhos.length - 1; r++) {
    for (let k = 0; k < angles.length; k++) {
      const k1 = (k + 1) % angles.length;
      if (r === 0) mesh.tri(under[0][0], under[1][k1], under[1][k]);
      else mesh.quad(under[r][k], under[r][k1], under[r + 1][k1], under[r + 1][k]);
    }
  }
  mesh.end({ closed: false, outward: () => new Vector3(0, -1, 0) });

  // --- Head and neck: a short, slightly flattened loft ending in a blunt beak ---
  mesh.begin();
  const radius = (z: number) => .018 + .043 * Math.sin(Math.PI * clamp((z - .19) / .3)) ** .7;
  const zs = [.19, .235, .28, .32, .355, .39, .42, .445, .465];
  const sides = 10;
  const headSkin = (z: number): Skin => blendSkins({ Root: 1 }, { Head: 1 }, smoothstep(.2, .27, z));
  const rings = zs.map((z) => Array.from({ length: sides }, (_, k) => {
    const a = TAU * k / sides;
    const r = radius(z);
    const p = new Vector3(Math.sin(a) * r * 1.05, .004 + Math.cos(a) * r * .82 - .006 * clamp((z - .4) / .1), z);
    const scale = noise(z * 60 + k * 2.3, 3) > .35 ? .45 : 0;
    const color = Math.cos(a) < -.2 ? SKIN_BELOW : mix(z > .44 ? BEAK : SKIN, SCALE_EDGE, scale);
    return mesh.vertex(p, color, headSkin(z));
  }));
  for (let j = 0; j < zs.length - 1; j++) {
    for (let k = 0; k < sides; k++) mesh.quad(rings[j][k], rings[j][(k + 1) % sides], rings[j + 1][(k + 1) % sides], rings[j + 1][k]);
  }
  const snout = mesh.vertex(new Vector3(0, -.004, .473), BEAK, { Head: 1 });
  const neck = mesh.vertex(new Vector3(0, .004, .18), SKIN, { Root: 1 });
  for (let k = 0; k < sides; k++) {
    mesh.tri(snout, rings[zs.length - 1][k], rings[zs.length - 1][(k + 1) % sides]);
    mesh.tri(neck, rings[0][(k + 1) % sides], rings[0][k]);
  }
  mesh.end();
  for (const side of [1, -1]) eye(mesh, new Vector3(side * .05, .016, .4), new Vector3(side, .35, .3), .012, EYE, { Head: 1 }, .6);

  // --- Front flippers: long, curved paddles swept back from under the front of the shell ---
  for (const side of [1, -1] as const) {
    const s = side;
    const le = path([[s * .19, -.012, .17], [s * .36, -.02, .165], [s * .52, -.03, .07], [s * .65, -.036, -.09]]);
    const te = path([[s * .21, -.024, .08], [s * .36, -.03, .065], [s * .5, -.035, -.015], [s * .65, -.036, -.09]]);
    const [upper, lower] = side > 0 ? ['FrontL1', 'FrontL2'] : ['FrontR1', 'FrontR2'];
    fin(mesh, {
      stations: 8,
      le, te,
      thickness: (v) => .032 * (1 - .72 * v),
      side: new Vector3(0, 1, 0),
      color: (_p, v, u, face) => {
        if (face < 0) return mix(FLIPPER_BELOW, FLIPPER_EDGE, smoothstep(.8, 1, u) * .5);
        const scales = noise(v * 26 + u * 7, 9) > .3 ? .55 : 0;
        return mix(FLIPPER, FLIPPER_EDGE, Math.max(scales, smoothstep(.82, 1, u) * .8));
      },
      skin: (_p, v) => blendSkins({ Root: 1 }, chainSkin(v, [0, .45], [upper, lower], 1), smoothstep(.02, .1, v)),
      chordPoints: 5,
    });
    bones.push(
      { name: upper, parent: 'Root', position: new Vector3(s * .2, -.02, .12) },
      { name: lower, parent: upper, position: new Vector3(s * .44, -.03, .06) },
    );
  }

  // --- Rear flippers: small rounded paddles either side of the tail ---
  for (const side of [1, -1] as const) {
    const s = side;
    const name = side > 0 ? 'RearL' : 'RearR';
    fin(mesh, {
      stations: 4,
      le: path([[s * .13, -.018, -.31], [s * .23, -.024, -.37], [s * .27, -.027, -.46]]),
      te: path([[s * .1, -.022, -.37], [s * .18, -.026, -.44], [s * .27, -.027, -.46]]),
      thickness: (v) => .022 * (1 - .6 * v),
      side: new Vector3(0, 1, 0),
      color: (_p, _v, u, face) => (face < 0 ? FLIPPER_BELOW : mix(FLIPPER, FLIPPER_EDGE, smoothstep(.75, 1, u) * .7)),
      skin: (_p, v) => blendSkins({ Root: 1 }, { [name]: 1 }, smoothstep(.05, .3, v)),
    });
    bones.push({ name, parent: 'Root', position: new Vector3(s * .13, -.02, -.34) });
  }

  // --- A short tail ---
  mesh.begin();
  const tailRing = (z: number, r: number) => Array.from({ length: 6 }, (_, k) => {
    const a = TAU * k / 6;
    return mesh.vertex(new Vector3(Math.sin(a) * r, -.012 + Math.cos(a) * r * .8, z), SKIN, blendSkins({ Root: 1 }, { Tail: 1 }, smoothstep(.39, .43, -z)));
  });
  const tail = [tailRing(-.39, .022), tailRing(-.45, .014)];
  for (let k = 0; k < 6; k++) mesh.quad(tail[0][k], tail[0][(k + 1) % 6], tail[1][(k + 1) % 6], tail[1][k]);
  const tip = mesh.vertex(new Vector3(0, -.014, -.5), SKIN, { Tail: 1 });
  for (let k = 0; k < 6; k++) mesh.tri(tip, tail[1][k], tail[1][(k + 1) % 6]);
  mesh.end();

  bones.push(
    { name: 'Root', parent: null, position: new Vector3(0, 0, CENTER_Z) },
    { name: 'Head', parent: 'Root', position: new Vector3(0, .004, .26) },
    { name: 'Tail', parent: 'Root', position: new Vector3(0, -.012, -.4) },
  );
  return { mesh, bones };
}
