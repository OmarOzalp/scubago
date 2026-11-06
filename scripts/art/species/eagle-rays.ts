/**
 * The eagle rays' shared lofter (the bull ray and the cownose ray; the spotted eagle ray keeps its own
 * file): a diamond disc lofted from airfoil sections across the span, as the spotted eagle ray's is, skinned to five wing
 * segments a side so the strokes travel out to the tips; a head of its own set on the front of the disc,
 * its snout either a blunt duck's bill or notched into the cownose's two lobes; eyes on the sides of the
 * head; a whip of a tail with a small dorsal fin and a spine at its base. A design supplies the planform,
 * the head, the colours and the markings; this file does the rest.
 */
import { Vector3 } from 'three';
import { blendSkins, chainSkin, clamp, curve, eye, fin, MeshBuilder, mix, smoothstep, TAU, type RGB, type Skin } from './kit';
import type { BoneSpec } from './export';

/** Joints of each wing chain, from the shoulder to near the tip (half-span 0.5, as the spotted eagle ray's). */
export const EAGLE_WING_JOINTS = [.075, .15, .23, .31, .39];

export type EagleRayDesign = {
  /** Planform as functions of distance from the midline (half-span 0.5): the edges' z, the half thickness, the camber. */
  leading: readonly (readonly [number, number])[];
  trailing: readonly (readonly [number, number])[];
  thickness: readonly (readonly [number, number])[];
  lift: readonly (readonly [number, number])[];
  /** Head sections along z: [z, half-width, height above the axis, depth below it]; the last is the snout tip. */
  head: readonly (readonly [number, number, number, number])[];
  /** How square the section is (1 is an ellipse, smaller is boxier). */
  headShape?: number;
  /** A notch in the snout's front, splitting it into two lobes: how deep, how wide, and from which z it begins. */
  notch?: { depth: number; width: number; from: number };
  eye: { x: number; y: number; z: number; r: number };
  colors: { top: RGB; tip: RGB; belly: RGB; margin: RGB; mouth: RGB; gill: RGB; eye: RGB; tail: RGB; spine: RGB; snout?: RGB };
  /** Tail: where it starts (z), its length, its base radius, and the small dorsal fin's height and position behind the disc. */
  tail: { start: number; length: number; radius: number; dorsal: number };
  /** The back's colour at span x, chord u (default: the top colour darkening toward the tips). */
  topAt?: (x: number, u: number, z: number) => RGB;
  /** Decals on the back, drawn with the lofter's helpers. */
  markings?: (h: Helpers) => void;
};

export type Helpers = {
  sheet: (x: number, u: number, upper: boolean) => Vector3;
  leadingEdge: (a: number) => number;
  trailingEdge: (a: number) => number;
  /** A thin stroke lying on the sheet through (x, u) points. */
  decal: (line: readonly (readonly [number, number])[], upper: boolean, width: (t: number) => number, color: RGB) => void;
};

const K = 12; // points along each surface of a section
const half = (u: number) => 5 * (.2969 * Math.sqrt(u) - .126 * u - .3516 * u * u + .2843 * u ** 3 - .1036 * u ** 4);

export function buildEagleRay(d: EagleRayDesign) {
  const leadingEdge = curve(d.leading), trailingEdge = curve(d.trailing), thickness = curve(d.thickness), lift = curve(d.lift);
  const C = d.colors;
  const TAIL_START = d.tail.start, TAIL_LENGTH = d.tail.length;
  const TAIL_JOINTS = [TAIL_START - .1, TAIL_START - .3 * TAIL_LENGTH - .06, TAIL_START - .6 * TAIL_LENGTH];

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
  const wingSkin = (x: number, z: number): Skin => {
    const a = Math.abs(x);
    const side = x >= 0 ? 'L' : 'R';
    let skin = chainSkin(a, [0, ...EAGLE_WING_JOINTS], ['Root', ...EAGLE_WING_JOINTS.map((_, i) => `Wing${side}${i + 1}`)], .5);
    const center = 1 - smoothstep(.045, .09, a);
    skin = blendSkins(skin, { Head: 1 }, smoothstep(.08, .15, z) * center);
    return blendSkins(skin, { Tail1: 1 }, smoothstep(TAIL_START + .035, TAIL_START, z) * (1 - smoothstep(.02, .05, a)));
  };
  const topColor = (x: number, u: number, z: number) => d.topAt ? d.topAt(x, u, z) : mix(C.top, C.tip, smoothstep(.3, .48, Math.abs(x)));
  const bottomColor = (x: number, u: number): RGB => {
    const a = Math.abs(x);
    return mix(C.belly, C.margin, clamp(smoothstep(.42, .5, a) * .7 + smoothstep(.85, .98, u) * smoothstep(.25, .4, a) * .35));
  };

  const mesh = new MeshBuilder();
  const bones: BoneSpec[] = [];
  const half_ = [0, .02, .04, .055, .07, .085, .1, .12, .14, .165, .19, .22, .25, .28, .31, .34, .37, .4, .425, .446, .464, .478, .489, .496];
  const xs = [...half_.slice(1).reverse().map((a) => -a), ...half_];
  const us = Array.from({ length: K }, (_, i) => (1 - Math.cos(Math.PI * i / (K - 1))) / 2);

  mesh.begin();
  const rings = xs.map((x) => {
    const ring: number[] = [];
    us.forEach((u) => {
      const p = sheet(x, u, true);
      ring.push(mesh.vertex(p, topColor(x, u, p.z), wingSkin(x, p.z)));
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
    const t = mesh.vertex(tip, mix(C.tip, C.belly, .3), wingSkin(x, tip.z));
    for (let i = 0; i < m; i++) mesh.tri(t, ring[i], ring[(i + 1) % m]);
  }
  mesh.end();

  // The head: a crown between the eyes narrowing into the snout; `notch` splits the snout's front in two.
  const around = 16, rounded = d.headShape ?? .75;
  const front = d.head[d.head.length - 1][0];
  const notchAt = (x: number, z: number) => {
    if (!d.notch) return 0;
    return d.notch.depth * (1 - smoothstep(0, d.notch.width, Math.abs(x))) * smoothstep(d.notch.from, front, z);
  };
  mesh.begin();
  const headRows = d.head.map(([z, w, up, down]) => Array.from({ length: around }, (_, k) => {
    const angle = TAU * k / around;
    const c = Math.cos(angle), s = Math.sin(angle);
    const shape = (v: number) => Math.sign(v) * Math.abs(v) ** rounded;
    const x = w * shape(c);
    const p = new Vector3(x, .004 + (s > 0 ? up : down) * shape(s), z - notchAt(x, z));
    const color = s > -.15 ? (C.snout ? mix(C.top, C.snout, smoothstep(.22, .3, z)) : C.top) : C.belly;
    return mesh.vertex(p, color, blendSkins({ Root: 1 }, { Head: 1 }, smoothstep(.1, .16, z)));
  }));
  for (let i = 0; i < headRows.length - 1; i++) {
    for (let k = 0; k < around; k++) mesh.quad(headRows[i][k], headRows[i][(k + 1) % around], headRows[i + 1][(k + 1) % around], headRows[i + 1][k]);
  }
  const nose = mesh.vertex(new Vector3(0, .004, front - notchAt(0, front) + .006), C.top, { Head: 1 });
  const back = mesh.vertex(new Vector3(0, .004, d.head[0][0] - .01), C.top, { Root: 1 });
  const lastRow = headRows[headRows.length - 1];
  for (let k = 0; k < around; k++) {
    mesh.tri(nose, lastRow[k], lastRow[(k + 1) % around]);
    mesh.tri(back, headRows[0][(k + 1) % around], headRows[0][k]);
  }
  mesh.end();

  // Eyes bulge from the sides of the head.
  for (const side of [1, -1]) eye(mesh, new Vector3(side * d.eye.x, d.eye.y, d.eye.z), new Vector3(side, .45, .1), d.eye.r, C.eye, { Head: 1 }, .6);

  // Decals lie just above the sheet so they bend with it.
  const decal: Helpers['decal'] = (line, upper, width, color) => {
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
  d.markings?.({ sheet, leadingEdge, trailingEdge, decal });

  // Underside: the mouth under the head and five short gill slits per side.
  decal(Array.from({ length: 7 }, (_, i) => [(i / 6 * 2 - 1) * .028, .02] as const), false, (t) => .0036 * Math.sin(Math.PI * (.08 + .84 * t)) ** .5, C.mouth);
  for (const side of [1, -1]) {
    for (let i = 0; i < 5; i++) {
      const u = .14 + i * .035;
      decal(Array.from({ length: 3 }, (_, j) => [side * (.03 + .018 * j / 2), u + .008 * (j / 2) ** 2] as const), false, () => .0013, C.gill);
    }
  }

  // Pelvic fins peek out behind the disc on either side of the tail base.
  const tz = TAIL_START;
  for (const side of [1, -1]) {
    fin(mesh, {
      stations: 4,
      le: (v) => new Vector3(side * (.012 + .026 * v), -.004, tz + .02 - .04 * v),
      te: (v) => new Vector3(side * (.012 + .01 * v), -.004, tz - .01 - .014 * v),
      thickness: (v) => .006 * (1 - .6 * v),
      side: new Vector3(0, 1, 0),
      color: (p) => (p.y > -.004 ? C.top : C.belly),
      skin: () => ({ Root: .5, Tail1: .5 }),
    });
  }
  // A small dorsal fin at the tail base.
  fin(mesh, {
    stations: 4,
    le: (v) => new Vector3(0, .006 + d.tail.dorsal * v, tz - .003 - .012 * v),
    te: (v) => new Vector3(0, .006 + d.tail.dorsal * v * .55, tz - .03 - .002 * v),
    thickness: (v) => .006 * (1 - .6 * v),
    side: new Vector3(1, 0, 0),
    color: () => C.tail,
    skin: () => ({ Tail1: 1 }),
  });

  // The whip of a tail, far longer than the disc, tapering to a thread.
  mesh.begin();
  const sides = 6, steps = 16;
  const trows: number[][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, z = TAIL_START - TAIL_LENGTH * t;
    const r = d.tail.radius * (1 - t) ** 1.25 + .0005;
    const skin = chainSkin(-z, [0, ...TAIL_JOINTS.map((j) => -j)], ['Root', 'Tail1', 'Tail2', 'Tail3'], -(TAIL_START - TAIL_LENGTH));
    trows.push(Array.from({ length: sides }, (_, k) => {
      const a = TAU * k / sides;
      const p = new Vector3(Math.cos(a) * r * 1.15, -.001 + Math.sin(a) * r, z);
      return mesh.vertex(p, mix(C.tail, C.belly, Math.sin(a) < -.4 ? .25 : 0), skin);
    }));
  }
  for (let i = 0; i < steps; i++) for (let k = 0; k < sides; k++) mesh.quad(trows[i][k], trows[i][(k + 1) % sides], trows[i + 1][(k + 1) % sides], trows[i + 1][k]);
  const tip = mesh.vertex(new Vector3(0, -.001, TAIL_START - TAIL_LENGTH - .006), C.tail, { Tail3: 1 });
  const cap = mesh.vertex(new Vector3(0, -.001, TAIL_START + .004), C.tail, { Root: .5, Tail1: .5 });
  for (let k = 0; k < sides; k++) {
    mesh.tri(tip, trows[steps][(k + 1) % sides], trows[steps][k]);
    mesh.tri(cap, trows[0][k], trows[0][(k + 1) % sides]);
  }
  mesh.end();
  // The stinging spine: a short, pale, flat blade riding the tail behind the dorsal fin.
  fin(mesh, {
    stations: 3,
    le: (v) => new Vector3(0, .004 + .004 * v, tz - .12 - .01 * v),
    te: (v) => new Vector3(0, .004 + .004 * v * .5, tz - .13 - .05 * (1 - v)),
    thickness: (v) => .003 * (1 - .6 * v),
    side: new Vector3(1, 0, 0),
    color: () => C.spine,
    skin: () => ({ Tail1: .6, Tail2: .4 }),
  });

  const spar = (a: number) => leadingEdge(a) - .38 * (leadingEdge(a) - trailingEdge(a));
  bones.push(
    { name: 'Root', parent: null, position: new Vector3(0, 0, 0) },
    { name: 'Head', parent: 'Root', position: new Vector3(0, .006, .12) },
    // The manta rig's cephalic lobes: an eagle ray has none, so nothing is weighted to them.
    { name: 'CephalicL', parent: 'Head', position: new Vector3(.03, .004, front - .05) },
    { name: 'CephalicR', parent: 'Head', position: new Vector3(-.03, .004, front - .05) },
    ...(['L', 'R'] as const).flatMap((side) => EAGLE_WING_JOINTS.map((a, i) => ({
      name: `Wing${side}${i + 1}`, parent: i === 0 ? 'Root' : `Wing${side}${i}`,
      position: new Vector3((side === 'L' ? 1 : -1) * a, lift(a), spar(a)),
    }))),
    ...TAIL_JOINTS.map((z, i) => ({ name: `Tail${i + 1}`, parent: i === 0 ? 'Root' : `Tail${i}`, position: new Vector3(0, -.001, z) })),
  );
  return { mesh, bones };
}
