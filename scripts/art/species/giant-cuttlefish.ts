/**
 * Giant cuttlefish (Sepia apama): a broad, flattened oval mantle edged on each side by a continuous
 * fin skirt that nearly meets behind it; a shorter head with large, bulging eyes (W-shaped pupils);
 * eight short arms closing to a cone ahead. Warm tan above with darker mottling, faint cross-bands
 * and pale cream flecks, a pale band along the fins' margins, and a cream underside. The fin skirt
 * carries seven bones a side (CUTTLEFISH_FINS in marine-rigs.ts), hinged along the mantle's edge.
 *
 * Model space: arm tips at z = +0.5, the mantle's rounded rear at z = -0.5 (one body length).
 */
import { Vector3 } from 'three';
import { CUTTLEFISH_FINS, cuttlefishHalfWidth } from '../../../src/lib/marine-rigs';
import { blendSkins, chainSkin, clamp, hex, MeshBuilder, mix, noise, smoothstep, TAU, type RGB, type Skin } from './kit';
import type { BoneSpec } from './export';

const TAN = hex('#b0875a'), MOTTLE = hex('#6c4c2e'), WARM = hex('#c79a5e'), FLECK = hex('#ead7a6');
const BELLY = hex('#e7dab9'), FIN = hex('#c6a170'), FIN_EDGE = hex('#f0e4c2'), EYE = hex('#d7c58d'), PUPIL = hex('#17120d');
const ARM = hex('#a87e52'), ARM_STRIPE = hex('#dcc49a');

/** The mantle's front edge over the head, and where the head meets the arms. */
const MANTLE_FRONT = .2, HEAD_FRONT = .31;
/** The fin skirt runs along the mantle's edge between these. */
const FIN_FRONT = .175, FIN_REAR = -.465;

const mottle = (p: Vector3, scale: number, seed: number) =>
  noise(p.x * scale + 2.7 * noise(p.z * scale * .9, seed + 3) + 4.1 * noise(p.y * scale, seed + 5), seed);

/** The dorsal pattern: tan, darker mottles and faint cross-bands, warm patches and pale flecks. */
function back(p: Vector3): RGB {
  const band = smoothstep(.55, .95, Math.sin(p.z * 58 + 3 * noise(p.x * 9, 2)));
  const blotch = smoothstep(.15, .55, mottle(p, 15, 11));
  const warm = smoothstep(.3, .7, mottle(p, 23, 17));
  const fleck = smoothstep(.74, .88, mottle(p, 61, 23));
  return mix(mix(mix(TAN, WARM, warm * .6), MOTTLE, Math.max(blotch * .65, band * .35)), FLECK, fleck * .75);
}

export function buildGiantCuttlefish() {
  const mesh = new MeshBuilder();
  const bones: BoneSpec[] = [
    { name: 'Root', parent: null, position: new Vector3(0, 0, -.06) },
    { name: 'Mantle', parent: 'Root', position: new Vector3(0, 0, -.08) },
    { name: 'Head', parent: 'Root', position: new Vector3(0, .005, MANTLE_FRONT) },
  ];

  // --- Mantle and head: one flattened loft, the head a little narrower behind the mantle's front edge ---
  const halfWidth = (z: number) => {
    if (z <= MANTLE_FRONT - .01) return cuttlefishHalfWidth(z);
    const head = .098 - .026 * smoothstep(MANTLE_FRONT + .03, HEAD_FRONT, z);
    return cuttlefishHalfWidth(MANTLE_FRONT - .01) + (head - cuttlefishHalfWidth(MANTLE_FRONT - .01)) * smoothstep(MANTLE_FRONT - .01, MANTLE_FRONT + .025, z);
  };
  // Flattened above and below, the back gently domed.
  const halfHeight = (z: number) => z <= MANTLE_FRONT ? .016 + .5 * cuttlefishHalfWidth(z) : .066 - .01 * smoothstep(MANTLE_FRONT, HEAD_FRONT, z);
  const zs = [-.5, -.495, -.48, -.455, -.42, -.375, -.32, -.26, -.2, -.14, -.08, -.02, .04, .1, .15, .19, .205, .225, .25, .28, .31];
  const sides = 16;
  const skin = (z: number): Skin => blendSkins({ Mantle: 1 }, { Head: 1 }, smoothstep(MANTLE_FRONT - .02, MANTLE_FRONT + .03, z));
  mesh.begin();
  const rings = zs.map((z) => Array.from({ length: sides }, (_, k) => {
    const a = TAU * k / sides;
    const w = Math.max(.002, halfWidth(z)), h = Math.max(.002, halfHeight(z));
    // A broad oval: fuller at the sides than an ellipse, so it reads flat and wide from above.
    const sx = Math.sign(Math.sin(a)) * Math.abs(Math.sin(a)) ** .8, cy = Math.cos(a);
    const p = new Vector3(sx * w, cy * h * (cy > 0 ? 1 : .8), z);
    const under = smoothstep(.15, -.45, cy);
    return mesh.vertex(p, mix(back(p), BELLY, under), skin(z));
  }));
  for (let j = 0; j < rings.length - 1; j++) {
    for (let k = 0; k < sides; k++) mesh.quad(rings[j][k], rings[j][(k + 1) % sides], rings[j + 1][(k + 1) % sides], rings[j + 1][k]);
  }
  const rear = mesh.vertex(new Vector3(0, 0, -.503), back(new Vector3(0, 0, -.5)), { Mantle: 1 });
  // The front of the head, where the arms meet (a mouth-colored crown between them).
  const crown = mesh.vertex(new Vector3(0, .002, HEAD_FRONT + .012), ARM, { Head: 1 });
  for (let k = 0; k < sides; k++) {
    mesh.tri(rear, rings[0][k], rings[0][(k + 1) % sides]);
    mesh.tri(crown, rings[rings.length - 1][(k + 1) % sides], rings[rings.length - 1][k]);
  }
  mesh.end();

  // --- Eyes: large and bulging on the head's sides, each with a dark W-shaped pupil ---
  for (const side of [1, -1]) {
    const center = new Vector3(side * .088, .026, .252), out = new Vector3(side, .45, .1).normalize();
    const t1 = new Vector3(0, 1, 0).cross(out).normalize(), t2 = out.clone().cross(t1);
    const r = .038;
    mesh.begin();
    const top = mesh.vertex(center.clone().addScaledVector(out, r * .7), PUPIL, { Head: 1 });
    const rows: number[][] = [];
    for (let ring = 1; ring <= 3; ring++) {
      const phi = Math.PI * ring / 7;
      rows.push(Array.from({ length: 12 }, (_, s) => {
        const a = TAU * s / 12;
        const p = center.clone().addScaledVector(out, Math.cos(phi) * r * .7)
          .addScaledVector(t1, Math.sin(phi) * Math.cos(a) * r).addScaledVector(t2, Math.sin(phi) * Math.sin(a) * r);
        // A W of dark across the eye: the pupil dips in the middle.
        const along = Math.cos(a), across = Math.sin(a);
        const pupil = ring <= 2 && Math.abs(across - .35 * Math.cos(2 * Math.acos(clamp(along, -1, 1)))) < .42;
        return mesh.vertex(p, pupil ? PUPIL : ring === 3 ? mix(EYE, TAN, .55) : EYE, { Head: 1 });
      }));
    }
    const base = mesh.vertex(center.clone().addScaledVector(out, -r * .3), TAN, { Head: 1 });
    for (let s = 0; s < 12; s++) {
      const s1 = (s + 1) % 12;
      mesh.tri(top, rows[0][s], rows[0][s1]);
      for (let ring = 0; ring < 2; ring++) mesh.quad(rows[ring][s], rows[ring + 1][s], rows[ring + 1][s1], rows[ring][s1]);
      mesh.tri(base, rows[2][s1], rows[2][s]);
    }
    mesh.end();
  }

  // --- Arms: eight short, tapering arms closing to a cone; four bones, each moving a pair ---
  const groups = [['ArmLU', 1, 1], ['ArmRU', -1, 1], ['ArmLD', 1, -1], ['ArmRD', -1, -1]] as const;
  for (const [name, sx, sy] of groups) {
    const base = new Vector3(sx * .042, sy * .022, HEAD_FRONT - .01);
    bones.push({ name: `${name}1`, parent: 'Head', position: base }, { name: `${name}2`, parent: `${name}1`, position: new Vector3(sx * .03, sy * .016, .4) });
    for (const pair of [0, 1]) {
      // Each pair: one arm nearer the midline, one nearer the side.
      const angle = Math.atan2(sy, sx) + (pair ? .32 : -.32) * sx * sy;
      const r0 = .05, r1 = .009;
      const center = (z: number) => {
        const t = clamp((z - HEAD_FRONT + .015) / (.5 - HEAD_FRONT + .015), 0, 1.1);
        const r = r0 + (r1 - r0) * t ** .8;
        return new Vector3(Math.cos(angle) * r, .004 + Math.sin(angle) * r * .8, z);
      };
      const radius = (z: number) => .02 * (1 - .78 * clamp((z - HEAD_FRONT) / (.5 - HEAD_FRONT)));
      const stations = [HEAD_FRONT - .015, .335, .36, .39, .42, .45, .475, .495];
      const armSkin = (z: number): Skin => blendSkins({ Head: 1 }, chainSkin(z, [HEAD_FRONT, .4], [`${name}1`, `${name}2`], .5), smoothstep(HEAD_FRONT - .01, HEAD_FRONT + .03, z));
      mesh.begin();
      const armRings = stations.map((z, i) => Array.from({ length: 5 }, (_, k) => {
        const a = TAU * k / 5, r = radius(z);
        const p = center(z).add(new Vector3(Math.cos(a) * r, Math.sin(a) * r * .85, 0));
        return mesh.vertex(p, i % 2 && Math.sin(a) > .2 ? ARM_STRIPE : ARM, armSkin(z));
      }));
      for (let j = 0; j < armRings.length - 1; j++) {
        for (let k = 0; k < 5; k++) mesh.quad(armRings[j][k], armRings[j][(k + 1) % 5], armRings[j + 1][(k + 1) % 5], armRings[j + 1][k]);
      }
      const tip = mesh.vertex(center(.502), ARM, armSkin(.5));
      for (let k = 0; k < 5; k++) mesh.tri(tip, armRings[armRings.length - 1][k], armRings[armRings.length - 1][(k + 1) % 5]);
      mesh.end();
    }
  }

  // --- Fin skirt: a thin sheet along each side of the mantle, its margin pale ---
  const finWidth = (z: number) => .014 + .058 * Math.sin(Math.PI * clamp((FIN_FRONT - z) / (FIN_FRONT - FIN_REAR))) ** .55;
  const finZs = Array.from({ length: 22 }, (_, i) => FIN_FRONT - (FIN_FRONT - FIN_REAR) * i / 21);
  const stationZ = CUTTLEFISH_FINS.map((f) => f.z);
  for (const side of [1, -1] as const) {
    const names = CUTTLEFISH_FINS.map((_, i) => `Fin${side > 0 ? 'L' : 'R'}${i + 1}`);
    CUTTLEFISH_FINS.forEach((f, i) => bones.push({ name: names[i], parent: 'Mantle', position: new Vector3(side * (f.x - .004), -.004, f.z) }));
    // Weights along the skirt follow the stations front to back (z decreases backward).
    const along = (z: number) => chainSkin(-z, stationZ.map((v) => -v), names, -FIN_REAR + .02);
    mesh.begin();
    const rows = finZs.map((z) => {
      const edge = halfWidth(z) - .006, h = .004;
      const dz = .002, slope = (halfWidth(z + dz) - halfWidth(z - dz)) / (2 * dz);
      // Outward across the edge, in the horizontal plane (either side): (±1, 0, -slope).
      const out = new Vector3(side, 0, -slope).normalize();
      const w = finWidth(z);
      const point = (u: number, y: number) => new Vector3(side * edge, -.004 + y, z).addScaledVector(out, u * w);
      const weight = (u: number): Skin => blendSkins({ Mantle: 1 }, along(z), smoothstep(0, .45, u));
      const tone = (u: number, face: number): RGB => face < 0 ? mix(BELLY, FIN_EDGE, u * .5) : u < .2 ? mix(FIN, MOTTLE, .35) : mix(FIN, FIN_EDGE, smoothstep(.6, .88, u));
      // Top face, margin, bottom face: thin, tapering to the margin.
      return [
        mesh.vertex(point(0, h), tone(0, 1), weight(0)), mesh.vertex(point(.5, h * .55), tone(.5, 1), weight(.5)),
        mesh.vertex(point(1, 0), tone(1, 1), weight(1)),
        mesh.vertex(point(.5, -h * .55), tone(.5, -1), weight(.5)), mesh.vertex(point(0, -h), tone(0, -1), weight(0)),
      ];
    });
    for (let j = 0; j < rows.length - 1; j++) {
      for (let k = 0; k < 4; k++) mesh.quad(rows[j][k], rows[j][k + 1], rows[j + 1][k + 1], rows[j + 1][k]);
    }
    mesh.end({ closed: false, normals: true, outward: (i) => new Vector3(0, mesh.point(i).y + .004 > 0 ? 1 : -1, 0) });
  }

  return { mesh, bones };
}
