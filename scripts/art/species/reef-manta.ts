/**
 * Reef manta ray (Mobula alfredi): one continuous sheet lofted from airfoil
 * sections across the span, so the thick body flows into thin triangular wings
 * without a seam. Forward-rolled cephalic lobes, a terminal mouth, a thin
 * trailing tail, pale shoulder patches on a near-black back and a white belly
 * with dark wing margins. Wing skin weights follow five segments per side so
 * strokes can travel outward across the sheet.
 */
import { Vector3 } from 'three';
import { blendSkins, chainSkin, clamp, curve, eye, fin, hex, MeshBuilder, mix, noise, smoothstep, TAU, type RGB, type Skin } from './kit';
import type { BoneSpec } from './export';

const TOP = hex('#1f272b'), PALE = hex('#c3ccc9'), BELLY = hex('#eef0ec'), MARGIN = hex('#6d777a');
const MOUTH = hex('#2f393c'), GILL = hex('#9aa4a4'), SPOT = hex('#3e484c'), EYE = hex('#080d0f');

/** Planform and section shape as functions of distance from the midline (half-span 0.5). */
const leadingEdge = curve([[0, .205], [.045, .204], [.062, .198], [.078, .176], [.095, .163], [.15, .138], [.25, .087], [.35, .026], [.43, -.036], [.47, -.07], [.5, -.108]]);
const trailingEdge = curve([[0, -.222], [.04, -.22], [.07, -.206], [.12, -.178], [.2, -.148], [.3, -.128], [.38, -.12], [.44, -.116], [.48, -.112], [.5, -.108]]);
const thickness = curve([[0, .082], [.04, .075], [.07, .058], [.1, .036], [.15, .022], [.25, .0125], [.35, .0078], [.45, .0045], [.5, .002]]);
const lift = curve([[0, .006], [.07, .004], [.12, 0], [.5, -.004]]);
/** Joints of each wing chain, from the shoulder to near the tip. */
export const WING_JOINTS = [.085, .16, .24, .32, .4];
const TAIL_JOINTS = [-.2, -.3, -.39];

const K = 12; // points along each surface of a section
function half(u: number) {
  return 5 * (.2969 * Math.sqrt(u) - .126 * u - .3516 * u * u + .2843 * u ** 3 - .1036 * u ** 4);
}
/** Surface point at signed span x, chord fraction u (0 leading edge, 1 trailing edge), upper or lower side. */
function sheet(x: number, u: number, upper: boolean) {
  const a = Math.min(.5, Math.abs(x));
  const le = leadingEdge(a), te = trailingEdge(a), t = thickness(a);
  const bulge = half(u) * t;
  // The back is domed; the belly is flatter.
  return new Vector3(x, lift(a) + (upper ? 1.18 : -.82) * bulge, le - u * (le - te));
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
  // Head and tail base follow their own bones near the midline.
  const center = 1 - smoothstep(.05, .1, a);
  skin = blendSkins(skin, { Head: 1 }, smoothstep(.09, .15, z) * center);
  return blendSkins(skin, { Tail1: 1 }, smoothstep(-.17, -.21, z) * (1 - smoothstep(.02, .05, a)));
}

function topColor(x: number, u: number): RGB {
  const a = Math.abs(x);
  const z = sheet(x, u, true).z;
  // Pale shoulder patches sit behind the head between a thin dark leading-edge band and the dark
  // spine, fading backward and outward: the soft-edged dark "Y" saddle of a reef manta.
  const behindEdge = leadingEdge(a) - z;
  const front = smoothstep(.012, .045, behindEdge);
  const back = 1 - smoothstep(.075 - .1 * (a - .1), .16 - .12 * (a - .1), behindEdge);
  const spine = smoothstep(.07 + .25 * Math.max(0, .1 - z), .11 + .25 * Math.max(0, .1 - z), a);
  const outer = 1 - smoothstep(.2, .31, a + .025 * noise(z * 20, 2));
  return mix(TOP, PALE, clamp(front * back * spine * outer * 1.25));
}
function bottomColor(x: number, u: number): RGB {
  const a = Math.abs(x);
  const margin = smoothstep(.8, .95, u) * smoothstep(.1, .2, a) + smoothstep(.43, .5, a) * .6;
  return mix(BELLY, MARGIN, clamp(margin));
}

export function buildReefManta() {
  const mesh = new MeshBuilder();
  const bones: BoneSpec[] = [];
  // Stations across the span: dense over the body and toward the tips where the outline turns.
  const half_ = [0, .02, .04, .056, .07, .082, .095, .11, .125, .142, .16, .18, .2, .22, .245, .27, .3, .33, .36, .39, .415, .438, .458, .474, .486, .495];
  const xs = [...half_.slice(1).reverse().map((a) => -a), ...half_];
  const us = Array.from({ length: K }, (_, i) => (1 - Math.cos(Math.PI * i / (K - 1))) / 2);

  mesh.begin();
  const rings = xs.map((x) => {
    const ring: number[] = [];
    us.forEach((u) => {
      const p = sheet(x, u, true);
      ring.push(mesh.vertex(p, topColor(x, u), wingSkin(x, p.z)));
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
    const t = mesh.vertex(tip, mix(TOP, BELLY, .3), wingSkin(x, tip.z));
    for (let i = 0; i < m; i++) mesh.tri(t, ring[i], ring[(i + 1) % m]);
  }
  mesh.end();

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
  // Terminal mouth across the front of the head, just under the leading edge.
  decal(Array.from({ length: 9 }, (_, i) => [(i / 8 * 2 - 1) * .052, .018] as const), false, (t) => .0042 * Math.sin(Math.PI * (.08 + .84 * t)) ** .5, MOUTH);
  // Five gill slits per side on the underside.
  for (const side of [1, -1]) {
    for (let i = 0; i < 5; i++) {
      const u = .19 + i * .045;
      decal(Array.from({ length: 4 }, (_, j) => [side * (.026 + .03 * j / 3), u + .012 * (j / 3) ** 2] as const), false, () => .0016, GILL);
    }
  }
  // A few dark belly spots between the gill rows; the pattern is unique to each reef manta.
  for (const [x, u, r] of [[-.012, .5, .007], [.009, .56, .006], [-.004, .64, .0055], [.016, .47, .005], [.004, .43, .0045], [-.019, .6, .005]] as const) {
    decal(Array.from({ length: 3 }, (_, j) => [x + (j - 1) * r * .7, u] as const), false, (t) => r * Math.sin(Math.PI * (.15 + .7 * t)) ** .5, SPOT);
  }

  // Cephalic lobes: rolled forward-pointing horns either side of the mouth.
  for (const side of [1, -1]) {
    const base = new Vector3(side * .066, .002, .186);
    const path = (v: number) => base.clone().add(new Vector3(-side * .006 * v * v, -.01 * v - .006 * v * v, .08 * v));
    fin(mesh, {
      stations: 6,
      le: (v) => path(v).add(new Vector3(0, .013 * (1 - .5 * v), 0)),
      te: (v) => path(v).add(new Vector3(0, -.013 * (1 - .5 * v), 0)),
      thickness: (v) => .016 * (1 - .45 * v),
      side: new Vector3(side, 0, 0),
      color: (p) => mix(TOP, BELLY, smoothstep(.001, -.012, p.y) * .45),
      skin: (_p, v) => blendSkins({ Head: 1 }, { [side > 0 ? 'CephalicL' : 'CephalicR']: 1 }, smoothstep(.05, .35, v)),
      spacing: (t) => t,
    });
    bones.push({ name: side > 0 ? 'CephalicL' : 'CephalicR', parent: 'Head', position: base.clone().add(new Vector3(0, 0, .008)) });
    // Eyes sit on the sides of the head just behind the lobes.
    const eyeAt = new Vector3(side * .08, .014, .166);
    eye(mesh, eyeAt, new Vector3(side, .35, .15), .0075, EYE, { Head: 1 }, .6);
  }

  // Pelvic fins peek out behind the disc on either side of the tail base.
  for (const side of [1, -1]) {
    fin(mesh, {
      stations: 4,
      le: (v) => new Vector3(side * (.012 + .03 * v), -.006, -.19 - .05 * v),
      te: (v) => new Vector3(side * (.012 + .012 * v), -.006, -.19 - .035 - .015 * v),
      thickness: (v) => .007 * (1 - .6 * v),
      side: new Vector3(0, 1, 0),
      color: (p) => (p.y > -.006 ? TOP : BELLY),
      skin: () => ({ Root: .5, Tail1: .5 }),
    });
  }
  // A small dorsal fin at the tail base.
  fin(mesh, {
    stations: 4,
    le: (v) => new Vector3(0, .006 + .018 * v, -.172 - .014 * v),
    te: (v) => new Vector3(0, .006 + .018 * v * .6, -.2 - .002 * v),
    thickness: (v) => .006 * (1 - .6 * v),
    side: new Vector3(1, 0, 0),
    color: () => TOP,
    skin: () => ({ Root: .6, Tail1: .4 }),
  });

  // The whip-like tail: a tapered tube trailing from the rear of the body.
  mesh.begin();
  const sides = 6, steps = 11, start = -.19, length = .3;
  const rows: number[][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, z = start - length * t;
    const r = .0078 * (1 - t) ** 1.1 + .0006;
    // Distance behind the disc center runs along the tail chain.
    const skin = chainSkin(-z, [0, ...TAIL_JOINTS.map((j) => -j)], ['Root', 'Tail1', 'Tail2', 'Tail3'], -(start - length));
    rows.push(Array.from({ length: sides }, (_, k) => {
      const a = TAU * k / sides;
      const p = new Vector3(Math.cos(a) * r * 1.2, -.002 + Math.sin(a) * r, z);
      return mesh.vertex(p, mix(TOP, BELLY, Math.sin(a) < -.4 ? .35 : 0), skin);
    }));
  }
  for (let i = 0; i < steps; i++) for (let k = 0; k < sides; k++) mesh.quad(rows[i][k], rows[i][(k + 1) % sides], rows[i + 1][(k + 1) % sides], rows[i + 1][k]);
  const tipPoint = new Vector3(0, -.002, start - length - .006);
  const tip = mesh.vertex(tipPoint, TOP, { Tail3: 1 });
  const cap = mesh.vertex(new Vector3(0, -.002, start + .004), TOP, { Root: .5, Tail1: .5 });
  for (let k = 0; k < sides; k++) {
    mesh.tri(tip, rows[steps][(k + 1) % sides], rows[steps][k]);
    mesh.tri(cap, rows[0][k], rows[0][(k + 1) % sides]);
  }
  mesh.end();

  const spar = (a: number) => leadingEdge(a) - .38 * (leadingEdge(a) - trailingEdge(a));
  bones.push(
    { name: 'Root', parent: null, position: new Vector3(0, 0, 0) },
    { name: 'Head', parent: 'Root', position: new Vector3(0, .004, .1) },
    ...(['L', 'R'] as const).flatMap((side) => WING_JOINTS.map((a, i) => ({
      name: `Wing${side}${i + 1}`, parent: i === 0 ? 'Root' : `Wing${side}${i}`,
      position: new Vector3((side === 'L' ? 1 : -1) * a, lift(a), spar(a)),
    }))),
    ...TAIL_JOINTS.map((z, i) => ({ name: `Tail${i + 1}`, parent: i === 0 ? 'Root' : `Tail${i}`, position: new Vector3(0, -.002, z) })),
  );
  return { mesh, bones };
}
