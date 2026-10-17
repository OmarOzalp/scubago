/**
 * Spotted eagle ray (Aetobatus narinari): a diamond-shaped disc of long, pointed, swept-back wings
 * (a gently convex leading edge, a concave trailing edge), with a distinct domed head that juts out
 * in front of the wings and ends in a flat, rounded "duck-bill" snout, eyes on the sides of the head;
 * a very long, thin whip of a tail with a small dorsal fin at its base. Deep inky blue-black above,
 * covered in white spots and a few white rings; snow white below.
 *
 * The disc is one sheet lofted from airfoil sections across the span, as the reef manta's is, and
 * skinned to five wing segments per side so strokes travel out to the tips. The head is its own loft
 * set on the front of the disc.
 */
import { Vector3 } from 'three';
import { blendSkins, chainSkin, clamp, curve, eye, fin, hex, MeshBuilder, mix, smoothstep, TAU, type RGB, type Skin } from './kit';
import type { BoneSpec } from './export';

const TOP = hex('#18202b'), TIP = hex('#10151c'), SPOT = hex('#f4f6f2'), BELLY = hex('#f6f7f4'), MARGIN = hex('#8a949a');
const MOUTH = hex('#3a4448'), GILL = hex('#a7b0b2'), EYE = hex('#07090b'), TAIL = hex('#1b232c');

/** Planform and section shape as functions of distance from the midline (half-span 0.5). */
const leadingEdge = curve([[0, .19], [.04, .188], [.06, .182], [.08, .172], [.12, .152], [.2, .11], [.28, .06], [.35, .008], [.41, -.05], [.45, -.1], [.48, -.15], [.5, -.2]]);
const trailingEdge = curve([[0, -.235], [.03, -.233], [.06, -.226], [.1, -.21], [.16, -.19], [.24, -.172], [.32, -.165], [.38, -.168], [.43, -.176], [.47, -.187], [.5, -.2]]);
const thickness = curve([[0, .075], [.04, .07], [.07, .052], [.1, .034], [.15, .02], [.25, .011], [.35, .007], [.45, .004], [.5, .002]]);
const lift = curve([[0, .004], [.08, .002], [.15, 0], [.5, -.012]]);
/** Joints of each wing chain, from the shoulder to near the tip. */
export const WING_JOINTS = [.075, .15, .23, .31, .39];
const TAIL_START = -.225, TAIL_LENGTH = .95;
const TAIL_JOINTS = [-.32, -.52, -.78];

const K = 12; // points along each surface of a section
function half(u: number) {
  return 5 * (.2969 * Math.sqrt(u) - .126 * u - .3516 * u * u + .2843 * u ** 3 - .1036 * u ** 4);
}
/** Surface point at signed span x, chord fraction u (0 leading edge, 1 trailing edge), upper or lower side. */
function sheet(x: number, u: number, upper: boolean) {
  const a = Math.min(.5, Math.abs(x));
  const le = leadingEdge(a), te = trailingEdge(a), t = thickness(a);
  const bulge = half(u) * t;
  return new Vector3(x, lift(a) + (upper ? 1.15 : -.85) * bulge, le - u * (le - te));
}
function sheetNormal(x: number, u: number, upper: boolean) {
  const du = Math.min(.01, u, 1 - u) || .005, dx = .004;
  const a = sheet(x + dx, u, upper).sub(sheet(x - dx, u, upper));
  const b = sheet(x, Math.min(1, u + du), upper).sub(sheet(x, Math.max(0, u - du), upper));
  const n = a.cross(b).normalize();
  if ((upper && n.y < 0) || (!upper && n.y > 0)) n.negate();
  return n;
}

function wingSkin(x: number, z: number): Skin {
  const a = Math.abs(x);
  const side = x >= 0 ? 'L' : 'R';
  let skin = chainSkin(a, [0, ...WING_JOINTS], ['Root', ...WING_JOINTS.map((_, i) => `Wing${side}${i + 1}`)], .5);
  const center = 1 - smoothstep(.045, .09, a);
  skin = blendSkins(skin, { Head: 1 }, smoothstep(.08, .15, z) * center);
  return blendSkins(skin, { Tail1: 1 }, smoothstep(-.19, -.225, z) * (1 - smoothstep(.02, .05, a)));
}

/** The back darkens a little toward the wing tips; the belly is white with a gray rim at the tips. */
const topColor = (x: number) => mix(TOP, TIP, smoothstep(.3, .48, Math.abs(x)));
function bottomColor(x: number, u: number): RGB {
  const a = Math.abs(x);
  return mix(BELLY, MARGIN, clamp(smoothstep(.42, .5, a) * .7 + smoothstep(.85, .98, u) * smoothstep(.25, .4, a) * .35));
}

export function buildSpottedEagleRay() {
  const mesh = new MeshBuilder();
  const bones: BoneSpec[] = [];
  // Stations across the span: dense over the body and toward the tips where the outline turns.
  const half_ = [0, .02, .04, .055, .07, .085, .1, .12, .14, .165, .19, .22, .25, .28, .31, .34, .37, .4, .425, .446, .464, .478, .489, .496];
  const xs = [...half_.slice(1).reverse().map((a) => -a), ...half_];
  const us = Array.from({ length: K }, (_, i) => (1 - Math.cos(Math.PI * i / (K - 1))) / 2);

  mesh.begin();
  const rings = xs.map((x) => {
    const ring: number[] = [];
    us.forEach((u) => {
      const p = sheet(x, u, true);
      ring.push(mesh.vertex(p, topColor(x), wingSkin(x, p.z)));
    });
    us.slice(1, -1).reverse().forEach((u) => {
      const p = sheet(x, u, false);
      ring.push(mesh.vertex(p, bottomColor(x, u), wingSkin(x, p.z)));
    });
    return ring;
  });
  const m = rings[0].length;
  for (let r = 0; r < rings.length - 1; r++) {
    for (let i = 0; i < m; i++) mesh.quad(rings[r][i], rings[r][(i + 1) % m], rings[r + 1][(i + 1) % m], rings[r + 1][i]);
  }
  for (const [ring, x] of [[rings[0], -.5], [rings[rings.length - 1], .5]] as const) {
    const tip = sheet(x, .5, true).add(sheet(x, .5, false)).multiplyScalar(.5);
    const t = mesh.vertex(tip, mix(TIP, BELLY, .3), wingSkin(x, tip.z));
    for (let i = 0; i < m; i++) mesh.tri(t, ring[i], ring[(i + 1) % m]);
  }
  mesh.end();

  // The head: a domed crown between the eyes, narrowing into the flat, rounded duck-bill snout.
  // Sections along z: [z, half-width, height above the axis, depth below it].
  const sections = [[.11, .05, .036, .03], [.15, .058, .046, .03], [.19, .058, .05, .028], [.22, .052, .042, .024], [.245, .042, .028, .018],
    [.265, .035, .017, .013], [.285, .031, .011, .009], [.3, .025, .008, .007], [.31, .016, .006, .005]] as const;
  const around = 14;
  mesh.begin();
  const headRows = sections.map(([z, w, up, down]) => Array.from({ length: around }, (_, k) => {
    const angle = TAU * k / around;
    const c = Math.cos(angle), s = Math.sin(angle);
    // A rounded-square section: flat across the top of the bill, full over the crown.
    const shape = (v: number) => Math.sign(v) * Math.abs(v) ** .75;
    const p = new Vector3(w * shape(c), .004 + (s > 0 ? up : down) * shape(s), z);
    return mesh.vertex(p, s > -.15 ? TOP : BELLY, blendSkins({ Root: 1 }, { Head: 1 }, smoothstep(.1, .16, z)));
  }));
  for (let i = 0; i < headRows.length - 1; i++) {
    for (let k = 0; k < around; k++) mesh.quad(headRows[i][k], headRows[i][(k + 1) % around], headRows[i + 1][(k + 1) % around], headRows[i + 1][k]);
  }
  const nose = mesh.vertex(new Vector3(0, .004, .316), TOP, { Head: 1 });
  const back = mesh.vertex(new Vector3(0, .004, .1), TOP, { Root: 1 });
  for (let k = 0; k < around; k++) {
    mesh.tri(nose, headRows[headRows.length - 1][k], headRows[headRows.length - 1][(k + 1) % around]);
    mesh.tri(back, headRows[0][(k + 1) % around], headRows[0][k]);
  }
  mesh.end();

  // Eyes bulge from the sides of the crown.
  for (const side of [1, -1]) eye(mesh, new Vector3(side * .057, .026, .19), new Vector3(side, .45, .1), .0085, EYE, { Head: 1 }, .6);

  // Decals lie just above the sheet so they bend with it.
  const decal = (line: readonly (readonly [number, number])[], upper: boolean, width: (t: number) => number, color: RGB) => {
    mesh.begin();
    const ids: number[][] = [];
    line.forEach(([x, u], i) => {
      const t = i / (line.length - 1);
      const [x0, u0] = line[Math.max(0, i - 1)], [x1, u1] = line[Math.min(line.length - 1, i + 1)];
      const tangent = sheet(x1, u1, upper).sub(sheet(x0, u0, upper)).normalize();
      const n = sheetNormal(x, u, upper);
      const across = n.clone().cross(tangent).normalize();
      const gx = sheet(x + .003, u, upper).sub(sheet(x - .003, u, upper)).divideScalar(.006);
      const gu = sheet(x, Math.min(1, u + .005), upper).sub(sheet(x, Math.max(0, u - .005), upper)).divideScalar(.01);
      const w = width(t);
      const dx = across.dot(gx) / gx.lengthSq() * w, du = across.dot(gu) / gu.lengthSq() * w;
      ids.push([1, -1].map((sign) => {
        const px = x + sign * dx, pu = clamp(u + sign * du, .002, .998);
        const nn = sheetNormal(px, pu, upper);
        const p = sheet(px, pu, upper).addScaledVector(nn, .0009);
        return mesh.vertex(p, color, wingSkin(px, p.z), nn);
      }));
    });
    for (let i = 0; i < ids.length - 1; i++) mesh.quad(ids[i][0], ids[i][1], ids[i + 1][1], ids[i + 1][0]);
    mesh.end({ closed: false, normals: false, outward: (i) => new Vector3(mesh.normals[i * 3], mesh.normals[i * 3 + 1], mesh.normals[i * 3 + 2]) });
  };
  /** A round white spot (a short, lens-shaped stroke) or, with `ring`, a white ring, centered at span x, chord u. */
  const spot = (x: number, u: number, r: number, ring = false) => {
    const chord = leadingEdge(Math.abs(x)) - trailingEdge(Math.abs(x));
    const du = r / chord;
    if (ring) {
      const line = Array.from({ length: 11 }, (_, j) => {
        const a = TAU * j / 10;
        return [x + .78 * r * Math.cos(a), u + .78 * du * Math.sin(a)] as const;
      });
      decal(line, true, () => .26 * r, SPOT);
      return;
    }
    decal(Array.from({ length: 5 }, (_, j) => [x + (j / 4 - .5) * 2 * r, u] as const), true, (t) => r * Math.sin(Math.PI * (.04 + .92 * t)) ** .55, SPOT);
  };
  // White spots scattered over the whole back (thrown at random, none crowding another), larger over
  // the body and smaller toward the tips, a few of them rings.
  const random = (n: number) => {
    const v = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
    return v - Math.floor(v);
  };
  const placed: { x: number; z: number; r: number }[] = [];
  for (let n = 0; n < 900 && placed.length < 74; n++) {
    const x = (random(n * 3) * 2 - 1) * .46, z = .17 - .4 * random(n * 3 + 1);
    const a = Math.abs(x), le = leadingEdge(a), te = trailingEdge(a);
    const margin = .022 + .02 * smoothstep(.3, .45, a);
    if (z > le - margin || z < te + margin || (a < .065 && z > .07)) continue;
    const r = (.0122 - .0052 * smoothstep(.18, .44, a)) * (.8 + .4 * random(n * 3 + 2));
    if (placed.some((q) => Math.hypot(q.x - x, q.z - z) < 1.75 * (q.r + r))) continue;
    placed.push({ x, z, r });
    spot(x, (le - z) / (le - te), r, placed.length % 6 === 2 && a < .36);
  }

  // Underside: the mouth under the bill's base and five short gill slits per side.
  decal(Array.from({ length: 7 }, (_, i) => [(i / 6 * 2 - 1) * .026, .02] as const), false, (t) => .0034 * Math.sin(Math.PI * (.08 + .84 * t)) ** .5, MOUTH);
  for (const side of [1, -1]) {
    for (let i = 0; i < 5; i++) {
      const u = .14 + i * .035;
      decal(Array.from({ length: 3 }, (_, j) => [side * (.03 + .018 * j / 2), u + .008 * (j / 2) ** 2] as const), false, () => .0013, GILL);
    }
  }

  // Pelvic fins peek out behind the disc on either side of the tail base.
  for (const side of [1, -1]) {
    fin(mesh, {
      stations: 4,
      le: (v) => new Vector3(side * (.012 + .026 * v), -.004, -.205 - .04 * v),
      te: (v) => new Vector3(side * (.012 + .01 * v), -.004, -.205 - .03 - .014 * v),
      thickness: (v) => .006 * (1 - .6 * v),
      side: new Vector3(0, 1, 0),
      color: (p) => (p.y > -.004 ? TOP : BELLY),
      skin: () => ({ Root: .5, Tail1: .5 }),
    });
  }
  // A small dorsal fin at the tail base.
  fin(mesh, {
    stations: 4,
    le: (v) => new Vector3(0, .006 + .02 * v, -.222 - .012 * v),
    te: (v) => new Vector3(0, .006 + .02 * v * .55, -.25 - .002 * v),
    thickness: (v) => .006 * (1 - .6 * v),
    side: new Vector3(1, 0, 0),
    color: () => TOP,
    skin: () => ({ Tail1: 1 }),
  });

  // The whip of a tail, far longer than the disc, tapering to a thread.
  mesh.begin();
  const sides = 6, steps = 16;
  const rows: number[][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, z = TAIL_START - TAIL_LENGTH * t;
    const r = .0085 * (1 - t) ** 1.25 + .0005;
    const skin = chainSkin(-z, [0, ...TAIL_JOINTS.map((j) => -j)], ['Root', 'Tail1', 'Tail2', 'Tail3'], -(TAIL_START - TAIL_LENGTH));
    rows.push(Array.from({ length: sides }, (_, k) => {
      const a = TAU * k / sides;
      const p = new Vector3(Math.cos(a) * r * 1.15, -.001 + Math.sin(a) * r, z);
      return mesh.vertex(p, mix(TAIL, BELLY, Math.sin(a) < -.4 ? .25 : 0), skin);
    }));
  }
  for (let i = 0; i < steps; i++) for (let k = 0; k < sides; k++) mesh.quad(rows[i][k], rows[i][(k + 1) % sides], rows[i + 1][(k + 1) % sides], rows[i + 1][k]);
  const tipPoint = new Vector3(0, -.001, TAIL_START - TAIL_LENGTH - .006);
  const tip = mesh.vertex(tipPoint, TAIL, { Tail3: 1 });
  const cap = mesh.vertex(new Vector3(0, -.001, TAIL_START + .004), TAIL, { Root: .5, Tail1: .5 });
  for (let k = 0; k < sides; k++) {
    mesh.tri(tip, rows[steps][(k + 1) % sides], rows[steps][k]);
    mesh.tri(cap, rows[0][k], rows[0][(k + 1) % sides]);
  }
  mesh.end();

  const spar = (a: number) => leadingEdge(a) - .38 * (leadingEdge(a) - trailingEdge(a));
  bones.push(
    { name: 'Root', parent: null, position: new Vector3(0, 0, 0) },
    { name: 'Head', parent: 'Root', position: new Vector3(0, .006, .12) },
    // The manta rig's cephalic lobes: an eagle ray has none, so nothing is weighted to them.
    { name: 'CephalicL', parent: 'Head', position: new Vector3(.03, .004, .26) },
    { name: 'CephalicR', parent: 'Head', position: new Vector3(-.03, .004, .26) },
    ...(['L', 'R'] as const).flatMap((side) => WING_JOINTS.map((a, i) => ({
      name: `Wing${side}${i + 1}`, parent: i === 0 ? 'Root' : `Wing${side}${i}`,
      position: new Vector3((side === 'L' ? 1 : -1) * a, lift(a), spar(a)),
    }))),
    ...TAIL_JOINTS.map((z, i) => ({ name: `Tail${i + 1}`, parent: i === 0 ? 'Root' : `Tail${i}`, position: new Vector3(0, -.001, z) })),
  );
  return { mesh, bones };
}
