/**
 * Giant moray (Gymnothorax javanicus): a long, thick, muscular body, a little taller than wide; a
 * broad head with heavy jaw muscles, small eyes set forward and a long gape held slightly open, a
 * few pale teeth showing; a continuous fold of fin along the back from behind the head to the tail,
 * meeting the anal fin around a narrow tail. Dark olive-brown with darker leopard spots and
 * yellowish mottling between them, the head darker still. The lower jaw has its own bone, so the
 * mouth opens and closes as it breathes.
 *
 * Model space: snout at z = +0.5, tail tip at z = -0.5 (one body length).
 */
import { Vector3 } from 'three';
import { SWIM_RIGS, type MorayRig } from '../../../src/lib/marine-rigs';
import { blendSkins, chainSkin, clamp, curve, eye, hex, MeshBuilder, mix, noise, smoothstep, TAU, type RGB, type Skin } from './kit';
import type { BoneSpec } from './export';

const BASE = hex('#565030'), HEAD = hex('#3f3a22'), SPOT = hex('#26220f'), MOTTLE = hex('#8f854a');
const BELLY = hex('#6f6942'), MOUTH = hex('#4a1b17'), TOOTH = hex('#ece3cc'), EYE = hex('#c8b052'), FIN_EDGE = hex('#34301b');

const RIG = SWIM_RIGS['giant-moray'] as MorayRig;
/** Body position from the snout (0) to the tail tip (1), and back to model z. */
const atZ = (z: number) => .5 - z, zAt = (x: number) => .5 - x;
/** The gape: from the snout back to the corner of the mouth, a little below the head's midline. */
const GAPE_BACK = .385;
const gapeY = (z: number) => -.006 - .008 * smoothstep(.5, GAPE_BACK, z);

// Half-height and half-width along the body: a broad head with heavy cheeks, a thick body, a narrow tail.
const height = curve([[-.5, .005], [-.48, .016], [-.42, .028], [-.32, .04], [-.2, .05], [-.05, .057], [.1, .06], [.25, .06], [.33, .059], [.38, .058], [.42, .05], [.455, .036], [.48, .022], [.5, .008]]);
const width = curve([[-.5, .003], [-.48, .01], [-.42, .019], [-.32, .03], [-.2, .041], [-.05, .048], [.1, .052], [.25, .052], [.33, .054], [.38, .056], [.42, .05], [.455, .038], [.48, .024], [.5, .008]]);

const mottle = (p: Vector3, scale: number, seed: number) =>
  noise(p.z * scale + 2.3 * noise(p.x * scale * 2, seed + 1) + 3.7 * noise(p.y * scale * 2, seed + 2), seed);

/** Leopard spots over olive brown with yellowish mottling between; the head darker, the belly a little lighter. */
function skin(p: Vector3, below: number): RGB {
  const head = smoothstep(.3, .42, p.z);
  const spot = smoothstep(.25, .5, mottle(p, 34 + 18 * head, 5));
  const light = smoothstep(.35, .7, mottle(p, 21, 13));
  const base = mix(mix(BASE, MOTTLE, light * .55 * (1 - head * .6)), HEAD, head * .7);
  return mix(mix(base, SPOT, spot * (.85 - .25 * below)), BELLY, below * .45);
}

export function buildGiantMoray() {
  const mesh = new MeshBuilder();
  const [neck, ...rest] = RIG.joints;
  const bodies = Array.from({ length: 8 }, (_, i) => `Body${i + 1}`);
  const bones: BoneSpec[] = [
    { name: 'Root', parent: null, position: new Vector3(0, 0, zAt(neck)) },
    { name: 'Head', parent: 'Root', position: new Vector3(0, 0, zAt(neck)) },
    { name: 'Jaw', parent: 'Head', position: new Vector3(0, gapeY(GAPE_BACK), GAPE_BACK) },
    ...bodies.map((name, i) => ({ name, parent: i ? bodies[i - 1] : 'Root', position: new Vector3(0, 0, zAt(i ? rest[i - 1] : neck)) })),
  ];
  // Head ahead of the neck; the lower jaw (below the gape, ahead of its corner) on the Jaw bone; the body along its chain.
  const along = (x: number): Skin => chainSkin(x, RIG.joints, bodies, 1);
  const weight = (p: Vector3): Skin => {
    const x = atZ(p.z);
    const head = smoothstep(neck + .03, neck - .03, x);
    if (head <= 0) return along(x);
    // Only ahead of the hinge at the corner of the mouth, so the throat behind it stays put.
    const jaw = p.z > GAPE_BACK && p.y < gapeY(p.z) ? smoothstep(GAPE_BACK, GAPE_BACK + .03, p.z) : 0;
    return blendSkins(along(x), jaw > 0 ? blendSkins({ Head: 1 }, { Jaw: 1 }, jaw) : { Head: 1 }, head);
  };

  // --- Body: a long loft, slightly compressed side to side, the snout and jaws shaped at the front ---
  // Rings closer together at the head and the tail, where the outline turns fastest.
  const zs = Array.from({ length: 40 }, (_, i) => { const t = i / 39; return -.5 + t - .06 * Math.sin(TAU * t); });
  // Each ring runs from one side of the gape over the back to the other (7 points), then under the belly
  // (5 more). Ahead of the corner of the mouth the two lips are separate vertices, the upper on the head
  // and the lower on the jaw, so the mouth opens instead of stretching skin across it.
  const UPPER = 7, LOWER = 5;
  const gapeAngle = (z: number) => Math.acos(clamp(gapeY(Math.min(z, .5)) / height(z), -.9, .9));
  mesh.begin();
  const rings = zs.map((z) => {
    const h = height(z), w = width(z), g = gapeAngle(z), mouth = z > GAPE_BACK;
    const point = (a: number) => {
      const y = Math.cos(a) * h;
      return new Vector3(Math.sin(a) * w * (1 + .05 * noise(z * 40 + a * 3, 3)), y, z);
    };
    const add = (a: number, jaw: boolean) => {
      const p = point(a);
      // Lip vertices sit exactly on the gape; the lower lip follows the jaw.
      const weightAt = jaw && mouth ? blendSkins({ Head: 1 }, { Jaw: 1 }, smoothstep(GAPE_BACK, GAPE_BACK + .03, z)) : weight(p);
      return mesh.vertex(p, skin(p, smoothstep(-.2, -.8, Math.cos(a))), weightAt);
    };
    const upper = Array.from({ length: UPPER }, (_, i) => add(-g + 2 * g * i / (UPPER - 1), false));
    const lowerStart = mouth ? add(g, true) : upper[UPPER - 1];
    const lowerEnd = mouth ? add(-g, true) : upper[0];
    const below = Array.from({ length: LOWER }, (_, i) => add(g + (TAU - 2 * g) * (i + 1) / (LOWER + 1), true));
    return { upper, lower: [lowerStart, ...below, lowerEnd] };
  });
  for (let j = 0; j < rings.length - 1; j++) {
    const a = rings[j], b = rings[j + 1];
    for (let k = 0; k < UPPER - 1; k++) mesh.quad(a.upper[k], a.upper[k + 1], b.upper[k + 1], b.upper[k]);
    for (let k = 0; k < LOWER + 1; k++) mesh.quad(a.lower[k], a.lower[k + 1], b.lower[k + 1], b.lower[k]);
  }
  // The snout closes to two tips, the upper jaw's and the lower jaw's.
  const last = rings[rings.length - 1], first = rings[0];
  const upperTip = mesh.vertex(new Vector3(0, gapeY(.5) + .004, .506), HEAD, { Head: 1 });
  const lowerTip = mesh.vertex(new Vector3(0, gapeY(.5) - .004, .503), HEAD, { Jaw: 1 });
  for (let k = 0; k < UPPER - 1; k++) mesh.tri(upperTip, last.upper[k + 1], last.upper[k]);
  for (let k = 0; k < LOWER + 1; k++) mesh.tri(lowerTip, last.lower[k + 1], last.lower[k]);
  const tail = mesh.vertex(new Vector3(0, 0, -.505), BASE, along(1));
  const tailRing = [...first.upper, ...first.lower.slice(1, -1)];
  for (let k = 0; k < tailRing.length; k++) mesh.tri(tail, tailRing[k], tailRing[(k + 1) % tailRing.length]);
  mesh.end();

  // --- Mouth: a dark lining between the jaws (it opens as the jaw drops), with a few pale teeth ---
  mesh.begin();
  const mouthZs = [GAPE_BACK, .405, .425, .445, .465, .485, .5];
  const lining = mouthZs.map((z) => {
    const w = width(z) * .9, y = gapeY(z);
    const upperL = mesh.vertex(new Vector3(w, y + .002, z), MOUTH, { Head: 1 });
    const upperR = mesh.vertex(new Vector3(-w, y + .002, z), MOUTH, { Head: 1 });
    const lowerL = mesh.vertex(new Vector3(w, y - .002, z), MOUTH, { Jaw: 1 });
    const lowerR = mesh.vertex(new Vector3(-w, y - .002, z), MOUTH, { Jaw: 1 });
    const roof = mesh.vertex(new Vector3(0, y + .01, z - .006), MOUTH, { Head: 1 });
    const floor = mesh.vertex(new Vector3(0, y - .006, z - .006), MOUTH, z > GAPE_BACK + .005 ? { Jaw: 1 } : { Head: 1 });
    return { upperL, upperR, lowerL, lowerR, roof, floor };
  });
  for (let j = 0; j < lining.length - 1; j++) {
    const a = lining[j], b = lining[j + 1];
    mesh.quad(a.upperL, b.upperL, b.roof, a.roof); mesh.quad(a.roof, b.roof, b.upperR, a.upperR);
    mesh.quad(a.lowerL, a.floor, b.floor, b.lowerL); mesh.quad(a.floor, a.lowerR, b.lowerR, b.floor);
    // A dark curtain down the middle, from the roof of the mouth to its floor: it stretches as the jaw drops,
    // so the open mouth reads dark from either side.
    mesh.quad(a.roof, b.roof, b.floor, a.floor);
  }
  mesh.end({ closed: false, normals: true, outward: (i) => new Vector3(0, gapeY(mesh.point(i).z) - mesh.point(i).y, 0) });
  // Teeth: small pale points along both jaws, longest near the front.
  mesh.begin();
  for (const z of [.41, .435, .46, .485]) {
    for (const side of [1, -1]) {
      for (const [jaw, dir] of [['Head', -1], ['Jaw', 1]] as const) {
        const w = width(z) * .74 * side, y = gapeY(z) + (dir < 0 ? .002 : -.002), length = .006 + .006 * smoothstep(.4, .49, z);
        const base1 = mesh.vertex(new Vector3(w, y, z - .004), TOOTH, { [jaw]: 1 });
        const base2 = mesh.vertex(new Vector3(w, y, z + .004), TOOTH, { [jaw]: 1 });
        const point = mesh.vertex(new Vector3(w * .92, y + dir * length, z), TOOTH, { [jaw]: 1 });
        mesh.tri(base1, base2, point);
      }
    }
  }
  mesh.end({ closed: false, normals: true, outward: (i) => new Vector3(Math.sign(mesh.point(i).x), 0, 0) });

  // --- Eyes: small, set high and forward on the snout ---
  for (const side of [1, -1]) eye(mesh, new Vector3(side * .029, .022, .448), new Vector3(side, .55, .35), .009, EYE, { Head: 1 }, .55);

  // --- Fin fold: a continuous low fin along the back from behind the head, round the tail, and forward beneath to the anal fin ---
  const crest = (z: number) => .004 + .02 * smoothstep(.36, .25, z) * smoothstep(-.52, -.25, z) + .01 * smoothstep(-.3, -.48, z);
  const finZs = Array.from({ length: 26 }, (_, i) => .35 - .85 * i / 25);
  for (const dir of [1, -1]) {
    const start = dir > 0 ? .35 : -.02;
    mesh.begin();
    const strips = finZs.filter((z) => z <= start).map((z) => {
      const base = dir * (height(z) - .003), top = base + dir * crest(z);
      const p0 = new Vector3(.0035, base, z), p1 = new Vector3(0, top, z), p2 = new Vector3(-.0035, base, z);
      const tone = (p: Vector3) => mix(skin(p, 0), FIN_EDGE, .55);
      return [mesh.vertex(p0, skin(p0, 0), weight(p0)), mesh.vertex(p1, tone(p1), weight(p1)), mesh.vertex(p2, skin(p2, 0), weight(p2))];
    });
    for (let j = 0; j < strips.length - 1; j++) {
      mesh.quad(strips[j][0], strips[j + 1][0], strips[j + 1][1], strips[j][1]);
      mesh.quad(strips[j][1], strips[j + 1][1], strips[j + 1][2], strips[j][2]);
    }
    mesh.end({ closed: false, normals: true, outward: (i) => new Vector3(Math.sign(mesh.point(i).x) || 1, 0, 0) });
  }

  return { mesh, bones };
}
