/**
 * Red lionfish (Pterois volitans): a hand and a half long, an ambusher of reefs and wrecks that hangs
 * in the water on its fins. A big head with a wide, oblique mouth, large eyes and fleshy tentacles above
 * them, on a moderately compressed body that tapers to a short tail stock; the whole animal banded in
 * vertical maroon-red and cream stripes, some broad, some thin. Its fins are its glory: huge pectorals
 * of long, separate, feathery rays spread out like wings, thirteen long venomous dorsal spines standing
 * like a mane (each with a little membrane), and soft dorsal, anal and rounded tail fins of clear
 * membrane with rows of dark spots on their rays.
 */
import { Vector3 } from 'three';
import { SWIM_RIGS, type SharkRig } from '../../../src/lib/marine-rigs';
import { blendSkins, hex, mix, noise, smoothstep, TAU, type MeshBuilder, type RGB, type Skin } from './kit';
import { sharkContext, type SharkContext, type SharkDesign } from './shark';

// Body: cream with maroon-red bars (thin ones a touch brighter), a pinker belly.
const CREAM = hex('#f2e6d8'), PINK = hex('#e6b8aa'), RED = hex('#8c1c18'), DEEP = hex('#5a0f0d'), BRICK = hex('#a8281f');
// Fins: pale membrane, rosy rays, near-black spots.
const MEMBRANE = hex('#fddcd0'), RAY = hex('#e8806f'), SPOT = hex('#4a1a15'), FAN_WEB = hex('#fde6dc');
const EYE = hex('#c79a45'), PUPIL = hex('#070405'), MOUTH = hex('#4a1511'), LIP = hex('#d8a496');

const rig = SWIM_RIGS.lionfish as SharkRig;

/** Maroon bars down the head and body: centre and half-width along the body; the thin ones are single rings. */
const BARS = [
  { c: .092, hw: .006, thin: true }, { c: .146, hw: .03 }, { c: .206, hw: .006, thin: true }, { c: .262, hw: .024 },
  { c: .315, hw: .006, thin: true }, { c: .372, hw: .03 }, { c: .431, hw: .006, thin: true }, { c: .476, hw: .018 },
  { c: .522, hw: .006, thin: true }, { c: .574, hw: .026 }, { c: .625, hw: .006, thin: true }, { c: .67, hw: .022 },
  { c: .743, hw: .013 },
] as const;

const paint = (s: number, theta: number, p: Vector3): RGB => {
  const bar = BARS.find((b) => Math.abs(s - b.c) <= b.hw);
  const white = mix(CREAM, PINK, .16 + .16 * noise(p.z * 46 + p.y * 33, 3) + .25 * smoothstep(2.2, 3, theta));
  if (!bar) return white;
  const red = mix('thin' in bar ? BRICK : RED, DEEP, .16 + .2 * smoothstep(0, .5, theta) * (1 - smoothstep(.5, 1.4, theta)) + .08 * noise(p.z * 80 + p.y * 60, 7));
  return mix(red, PINK, .55 * smoothstep(2.4, 3, theta));
};

export const LIONFISH: SharkDesign = {
  rig, nose: .4, bodyEnd: .8, frontDome: .03,
  // A big blunt head swelling to the deepest part of the body just behind it, then tapering to a short,
  // slim tail stock; moderately compressed, about two thirds as wide as deep.
  width: [[0, .036], [.02, .056], [.06, .078], [.12, .095], [.2, .104], [.28, .1], [.4, .087], [.5, .071], [.6, .055], [.7, .042], [.8, .034]],
  top: [[0, .04], [.02, .075], [.06, .108], [.12, .132], [.2, .148], [.28, .152], [.4, .138], [.5, .116], [.6, .092], [.7, .068], [.8, .05]],
  bottom: [[0, .042], [.02, .075], [.06, .106], [.12, .13], [.2, .142], [.28, .146], [.4, .132], [.5, .111], [.6, .087], [.7, .065], [.8, .048]],
  center: [[0, -.012], [.1, -.004], [.3, 0], [.8, 0]],
  squareTop: [[0, 2], [.08, 2.3], [.2, 2.5], [.4, 2.2], [.8, 2.1]],
  squareBottom: [[0, 2], [.1, 2.2], [.25, 2.3], [.8, 2.1]],
  rings: 40, columnsAbove: 5, columnsBelow: 4,
  boundary: () => 2.2, boundaryGap: .3,
  paint,
};

const COLUMNS = 16, EDGE = .0014;

/** Ring stations for the loft: a ring pair astride each broad bar's edges, one on each thin bar, fillers between. */
function stations() {
  const end = LIONFISH.bodyEnd;
  const marks = [0, end];
  for (const bar of BARS) {
    if ('thin' in bar) marks.push(bar.c);
    else marks.push(bar.c - bar.hw - EDGE, bar.c - bar.hw + EDGE, bar.c + bar.hw - EDGE, bar.c + bar.hw + EDGE);
  }
  marks.sort((a, b) => a - b);
  const out: number[] = [];
  for (const mark of marks) {
    const last = out[out.length - 1];
    if (last !== undefined) {
      const gap = mark - last, n = Math.ceil(gap / (last < .3 ? .027 : .038));
      for (let i = 1; i < n; i++) out.push(last + gap * i / n);
    }
    out.push(mark);
  }
  return out;
}

/** The body loft, with its rings placed on the bars' edges so the stripes come out crisp. */
function banded(ctx: SharkContext) {
  const { mesh, raw, skin, z, center } = ctx;
  const { frontDome, bodyEnd } = LIONFISH;
  const ss = stations();
  const thetas = Array.from({ length: COLUMNS }, (_, k) => TAU * k / COLUMNS);
  const fold = (theta: number) => Math.abs(Math.atan2(Math.sin(theta), Math.cos(theta)));
  mesh.begin();
  const rows = ss.map((s) => thetas.map((theta) => {
    const p = raw(s, theta);
    return mesh.vertex(p, paint(s, fold(theta), p), skin(s));
  }));
  const m = COLUMNS;
  for (let j = 0; j < rows.length - 1; j++) {
    for (let k = 0; k < m; k++) mesh.quad(rows[j][k], rows[j][(k + 1) % m], rows[j + 1][(k + 1) % m], rows[j + 1][k]);
  }
  // A domed snout and a pointed end, as the shared loft closes them.
  let previous = rows[0];
  for (const scale of [.66, .3]) {
    const ring = thetas.map((theta) => {
      const edge = raw(0, theta);
      const p = new Vector3(edge.x * scale, center(0) + (edge.y - center(0)) * scale, z(0) + frontDome! * (1 - scale * scale));
      return mesh.vertex(p, paint(0, fold(theta), p), skin(0));
    });
    for (let k = 0; k < m; k++) mesh.quad(ring[k], ring[(k + 1) % m], previous[(k + 1) % m], previous[k]);
    previous = ring;
  }
  const nose = new Vector3(0, center(0), z(0) + frontDome!);
  const c = mesh.vertex(nose, paint(0, Math.PI / 2, nose), skin(0));
  for (let k = 0; k < m; k++) mesh.tri(c, previous[(k + 1) % m], previous[k]);
  const last = rows[rows.length - 1];
  const tailEnd = new Vector3(0, center(bodyEnd), z(bodyEnd) - .004);
  const e = mesh.vertex(tailEnd, paint(bodyEnd, Math.PI / 2, tailEnd), skin(bodyEnd));
  for (let k = 0; k < m; k++) mesh.tri(e, last[k], last[(k + 1) % m]);
  mesh.end();
}

/** Close a part made of sheets and slender prisms: normals are given by the part, and the faces are oriented by them. */
const finish = (mesh: MeshBuilder) => mesh.end({
  closed: false, normals: false,
  outward: (i) => new Vector3(mesh.normals[i * 3], mesh.normals[i * 3 + 1], mesh.normals[i * 3 + 2]),
});

type Station = { t: number; p: Vector3 };

/**
 * A thin three-sided spine along a path, tapering to a point, in crisp bands of colour: each band is
 * its own short prism, so the stripes don't blur into each other. `stations` run from the buried base
 * (t = 0) to the tip (t = 1); `radius(t)` is its thickness; `colors[i]` paints the band between stations i and i + 1.
 */
function spine(mesh: MeshBuilder, options: {
  stations: Station[]; radius: (t: number) => number; colors: readonly RGB[]; skin: (t: number, p: Vector3) => Skin;
}) {
  const { stations, radius, colors } = options;
  const frame = (i: number) => {
    const tangent = stations[Math.min(stations.length - 1, i + 1)].p.clone().sub(stations[Math.max(0, i - 1)].p).normalize();
    const u = new Vector3().crossVectors(tangent, Math.abs(tangent.z) > .9 ? new Vector3(1, 0, 0) : new Vector3(0, 0, 1)).normalize();
    return { u, v: new Vector3().crossVectors(tangent, u) };
  };
  mesh.begin();
  const ring = (i: number, color: RGB) => {
    const { t, p } = stations[i];
    const r = radius(t), { u, v } = frame(i);
    if (r < 1e-5) return [mesh.vertex(p, color, options.skin(t, p), new Vector3().crossVectors(u, v))];
    return [0, 1, 2].map((k) => {
      const a = TAU * k / 3 + .5;
      const n = u.clone().multiplyScalar(Math.cos(a)).addScaledVector(v, Math.sin(a));
      const q = p.clone().addScaledVector(n, r);
      return mesh.vertex(q, color, options.skin(t, q), n);
    });
  };
  for (let b = 0; b < colors.length; b++) {
    const lower = ring(b, colors[b]), upper = ring(b + 1, colors[b]);
    if (upper.length === 1) for (let k = 0; k < 3; k++) mesh.tri(lower[k], lower[(k + 1) % 3], upper[0]);
    else for (let k = 0; k < 3; k++) mesh.quad(lower[k], lower[(k + 1) % 3], upper[(k + 1) % 3], upper[k]);
  }
  finish(mesh);
}

/**
 * A flat blade along a path in crisp bands of colour (a fin ray, a tentacle): `across` is the direction of
 * its width in the plane of the sheet and `normal` the sheet's face. A band that starts or ends in a point is a triangle.
 */
function blade(mesh: MeshBuilder, options: {
  stations: (Station & { across: Vector3; half: number })[]; colors: readonly RGB[]; normal: Vector3; skin: (t: number, p: Vector3) => Skin;
}) {
  const { stations, colors, normal } = options;
  mesh.begin();
  const ends = (i: number, color: RGB) => {
    const { t, p, across, half } = stations[i];
    if (half < 1e-5) return [mesh.vertex(p, color, options.skin(t, p), normal)];
    return [-1, 1].map((sign) => {
      const q = p.clone().addScaledVector(across, sign * half);
      return mesh.vertex(q, color, options.skin(t, q), normal);
    });
  };
  for (let b = 0; b < colors.length; b++) {
    const a = ends(b, colors[b]), c = ends(b + 1, colors[b]);
    if (a.length === 1) mesh.tri(a[0], c[c.length - 1], c[0]);
    else if (c.length === 1) mesh.tri(a[0], a[1], c[0]);
    else mesh.quad(a[0], a[1], c[1], c[0]);
  }
  finish(mesh);
}

export function buildLionfish() {
  const ctx = sharkContext(LIONFISH);
  const { mesh, bones, z } = ctx;
  banded(ctx);

  const here = (p: Vector3) => ctx.skin(ctx.sOf(p.z));
  const UP = new Vector3(0, 1, 0), BACK = new Vector3(0, 0, -1);

  // The mane: thirteen long, separate spines along the nape and back, banded red and cream, leaning from
  // forward at the front to well back at the rear, each joined to the next by a low membrane. They sway on `Dorsal`.
  const spineLengths = [.15, .19, .23, .26, .275, .28, .275, .265, .25, .23, .205, .18, .15];
  const spineBands = [RED, CREAM, RED, CREAM, RED] as const;
  const spineEdges = [0, .2, .4, .6, .8, 1];
  const spineAt = (k: number, t: number) => {
    const s = .195 + .0265 * k;
    const lean = -.3 + .1 * k + .05 * noise(k * 2.1, 13), splay = (k % 2 ? -1 : 1) * .06;
    const dir = UP.clone().multiplyScalar(Math.cos(lean)).addScaledVector(BACK, Math.sin(lean)).addScaledVector(new Vector3(1, 0, 0), Math.sin(splay)).normalize();
    const length = spineLengths[k] * (1 + .05 * noise(k * 1.3, 17));
    return ctx.surface(s, 0, -.006).addScaledVector(dir, length * t).addScaledVector(BACK, .1 * length * t * t);
  };
  const dorsalSkin = (t: number, p: Vector3): Skin => blendSkins(here(p), { Dorsal: 1 }, smoothstep(.05, .5, t));
  for (let k = 0; k < 13; k++) {
    spine(mesh, {
      stations: spineEdges.map((t) => ({ t, p: spineAt(k, t) })),
      radius: (t) => .006 * (1 - t) ** .85 + .0008 * (1 - t), colors: spineBands, skin: dorsalSkin,
    });
  }
  // The membrane between neighbouring spines, up the lower half: rosy at the root, pale toward its edge.
  mesh.begin();
  for (let k = 0; k < 12; k++) {
    const tm = .38 - .03 * Math.abs(k - 5) / 5;
    const pts = [[k, 0], [k + 1, 0], [k + 1, tm], [k, tm]].map(([i, t]) => {
      const p = spineAt(i, t);
      return mesh.vertex(p, mix(RAY, FAN_WEB, .35 + .65 * t / tm), dorsalSkin(t, p), new Vector3(1, 0, 0));
    });
    mesh.quad(pts[0], pts[1], pts[2], pts[3]);
  }
  finish(mesh);

  // A fan of separate rays rising from a short base line on the body: the pectorals, and on a small scale the
  // pelvics. `alphas` are the rays' angles from `out` toward `back`. Each ray is a slender blade in crisp red and
  // cream bands, running on past the pale web that joins the rays near the root, so the tips are free, feathery filaments.
  const fan = (options: {
    roots: Vector3[]; out: Vector3; alphas: number[]; lengths: number[]; webTo: number; curl: number; bow: number; bone?: string; seed: number;
    edges?: number[]; colors?: readonly RGB[]; web?: RGB[]; rayWidth?: number;
  }) => {
    const { roots, out, webTo, curl } = options;
    // The rays don't fan out quite evenly.
    const alphas = options.alphas.map((a, i, all) => a + (i > 0 && i < all.length - 1 ? .035 * noise(i * 1.9 + options.seed * 3.7, 11) : 0));
    const edges = options.edges ?? [0, .2, .34, .46, .58, .72, .86, 1];
    const colors = options.colors ?? [RED, CREAM, RED, CREAM, RED, CREAM, RED];
    const normal = new Vector3().crossVectors(out, BACK).normalize();
    const n = alphas.length;
    const lengths = options.lengths.map((l, i) => l * (1 + .04 * noise(i * 2.3 + options.seed, 5)));
    const at = (i: number, t: number) => {
      const dir = out.clone().multiplyScalar(Math.cos(alphas[i])).addScaledVector(BACK, Math.sin(alphas[i]));
      const reach = lengths[i];
      return roots[i].clone().addScaledVector(dir, reach * t).addScaledVector(UP, -curl * reach * t * t).addScaledVector(BACK, options.bow * (1 - i / (n - 1)) * reach * t * t);
    };
    const skinAt = (t: number, p: Vector3) => (options.bone ? blendSkins(here(p), { [options.bone]: 1 }, smoothstep(.04, .3, t)) : here(p));
    for (let i = 0; i < n; i++) {
      // Each ray's bands sit a little differently, so the arcs across the fan aren't perfectly concentric.
      const ts = edges.map((t, j) => (j === 0 || j === edges.length - 1 ? t : t + .03 * noise(i * 3.1 + j * 1.7 + options.seed, 9)));
      blade(mesh, {
        stations: ts.map((t) => {
          const p = at(i, t), before = at(Math.max(0, i - 1), t), after = at(Math.min(n - 1, i + 1), t);
          return { t, p, across: after.sub(before).normalize(), half: (options.rayWidth ?? .0105) * (1 - .5 * t) * (t === 0 ? 0 : 1) };
        }),
        colors, normal, skin: skinAt,
      });
    }
    // The web between neighbouring rays: rosy at the root, pale and clear toward its scalloped edge.
    mesh.begin();
    const rows = [.04, .2, .3, .42, .5, 1].map((f, r) => (r === 5 ? webTo : r === 0 ? f : f * webTo / .56));
    const tints = options.web ?? [mix(RED, FAN_WEB, .2), mix(RED, FAN_WEB, .25), mix(CREAM, FAN_WEB, .4), mix(CREAM, FAN_WEB, .45), mix(RED, FAN_WEB, .35), mix(RED, FAN_WEB, .5)];
    for (let i = 0; i < n - 1; i++) {
      const ids = rows.map((t, r) => [i, i + 1].map((k) => {
        const p = at(k, t);
        return mesh.vertex(p, tints[r], skinAt(t, p), normal);
      }));
      for (let r = 0; r < rows.length - 1; r++) mesh.quad(ids[r][0], ids[r][1], ids[r + 1][1], ids[r + 1][0]);
    }
    finish(mesh);
  };

  // The great pectoral fans, spread out and down like wings behind the gill covers: thirteen rays each,
  // the middle and hindmost the longest, reaching back toward the tail.
  const fanLengths = [.58, .7, .81, .9, .96, 1, 1, .98, .93, .87, .79, .7, .6].map((f) => f * .54);
  const fanAlphas = Array.from({ length: 13 }, (_, i) => -.3 + 1.55 * i / 12);
  const pectorals: Vector3[] = [];
  for (const side of [1, -1]) {
    const roots = fanAlphas.map((_, i) => ctx.surface(.285 + .03 * i / 12, side * (1.2 + .75 * i / 12), -.012));
    const droop = .52;
    fan({
      roots, out: new Vector3(side * Math.cos(droop), -Math.sin(droop), 0), alphas: fanAlphas, lengths: fanLengths,
      webTo: .6, curl: .1, bow: .12, seed: side, bone: side > 0 ? 'PectoralL' : 'PectoralR',
    });
    pectorals.push(roots[6]);
  }
  // Small pelvic fans under the chest, banded the same way.
  for (const side of [1, -1]) {
    const alphas = [.15, .5, .85, 1.2];
    fan({
      roots: alphas.map((_, i) => ctx.surface(.31 + .012 * i / 3, side * 2.6, -.01)), out: new Vector3(side * .3, -.95, 0).normalize(), alphas, lengths: [.095, .125, .125, .1],
      webTo: .5, curl: 0, bow: 0, seed: 7 + side, rayWidth: .007, edges: [0, .4, .7, 1], colors: [RED, CREAM, RED],
      web: [mix(RED, FAN_WEB, .3), mix(CREAM, FAN_WEB, .5), mix(CREAM, FAN_WEB, .5), mix(RED, FAN_WEB, .5), mix(RED, FAN_WEB, .6), FAN_WEB],
    });
  }

  // Soft dorsal, anal and tail fins: flat sheets of clear membrane over radiating rays, with rows of dark
  // spots along the rays. A grid with a column on each ray and one between, so a spot is a dark dot.
  const rayFin = (options: {
    rays: { base: Vector3; tip: Vector3 }[]; rows: number[]; spots: number[]; notch?: number; skin: (t: number, p: Vector3) => Skin;
  }) => {
    const { rays, rows } = options;
    const columns = 2 * rays.length - 1;
    const point = (c: number, t: number) => {
      const i = c >> 1, a = rays[i];
      if (c % 2 === 0) return a.base.clone().lerp(a.tip, t);
      const b = rays[i + 1];
      const base = a.base.clone().lerp(b.base, .5), tip = base.clone().lerp(a.tip.clone().lerp(b.tip, .5), 1 - (options.notch ?? .08));
      return base.lerp(tip, t);
    };
    mesh.begin();
    const grid = Array.from({ length: columns }, (_, c) => rows.map((t) => {
      const p = point(c, t);
      const spot = c % 2 === 0 && options.spots.includes(t);
      const color = spot ? SPOT : c % 2 === 0 ? mix(RAY, MEMBRANE, .55 * t) : mix(MEMBRANE, FAN_WEB, t);
      return mesh.vertex(p, color, options.skin(t, p), new Vector3(1, 0, 0));
    }));
    for (let c = 0; c < columns - 1; c++) for (let r = 0; r < rows.length - 1; r++) mesh.quad(grid[c][r], grid[c + 1][r], grid[c + 1][r + 1], grid[c][r + 1]);
    finish(mesh);
  };
  const dorsalRows = [0, .26, .38, .5, .7, .82, 1];
  const soft = (n: number, from: number, to: number, height: (u: number) => number, lean: (u: number) => number, ventral: boolean) =>
    Array.from({ length: n }, (_, i) => {
      const u = i / (n - 1), s = from + (to - from) * u;
      const y = ventral ? ctx.yBottom(s) + .005 : ctx.yTop(s) - .005, h = height(u) * (ventral ? -1 : 1);
      return { base: new Vector3(0, y, z(s)), tip: new Vector3(0, y + h, z(s) - Math.abs(h) * lean(u)) };
    });
  // Soft dorsal: a rounded fan behind the spines, leaning back.
  const softDorsal = soft(9, .545, .735, (u) => .112 * Math.sin(Math.PI * (.12 + .78 * u)) ** .8, (u) => .35 + .65 * u, false);
  rayFin({
    rays: softDorsal, rows: dorsalRows, spots: [.38, .82],
    skin: (t, p) => blendSkins(here(p), { Dorsal: 1 }, .6 * smoothstep(.2, .8, t) * (1 - smoothstep(.62, .78, ctx.sOf(p.z)))),
  });
  // Anal fin: a smaller rounded fan below, behind three short spines.
  rayFin({ rays: soft(6, .565, .715, (u) => .08 * Math.sin(Math.PI * (.1 + .8 * u)) ** .8, (u) => .3 + .65 * u, true), rows: dorsalRows, spots: [.38, .82], skin: (_t, p) => here(p) });

  // The tail: a rounded fan of nine rays with two rows of spots, flexing on its lobe bones.
  const axisY = ctx.center(rig.joints[4]);
  const tailRays = Array.from({ length: 9 }, (_, i) => {
    const phi = (i / 8 - .5) * 2 * 1.0, reach = .21 * (1 - .22 * (phi / 1) ** 2);
    const s0 = .79;
    return { base: new Vector3(0, axisY + .036 * phi, z(s0)), tip: new Vector3(0, axisY + .036 * phi + Math.sin(phi) * reach, z(s0) - Math.cos(phi) * reach) };
  });
  rayFin({
    rays: tailRays, rows: [0, .28, .4, .52, .7, .82, 1], spots: [.4, .82], notch: .06,
    skin: (_t, p) => {
      const weights = ctx.skin(ctx.sOf(p.z));
      return blendSkins(blendSkins(weights, { TailUpper: 1 }, smoothstep(.02, .11, p.y)), { TailLower: 1 }, smoothstep(-.02, -.11, p.y));
    },
  });

  // Eyes: a large gold iris and black pupil; the tentacles above them and the small tabs by the mouth.
  ctx.eyes({ s: .14, theta: 1.05, radius: .034, color: EYE, sink: .4 });
  for (const side of [1, -1]) {
    // The pupil: a shallow black cone laid over the iris's dome.
    const theta = side * 1.05, n = ctx.normal(.14, theta), at = ctx.surface(.14, theta, -.4 * .034);
    const across = new Vector3().crossVectors(n, UP).normalize(), up = new Vector3().crossVectors(across, n);
    mesh.begin();
    const tip = mesh.vertex(at.clone().addScaledVector(n, .034 * .55 + .0006), PUPIL, here(at), n);
    const rim = Array.from({ length: 6 }, (_, i) => {
      const a = TAU * i / 6;
      return mesh.vertex(at.clone().addScaledVector(n, .034 * .49 + .0008).addScaledVector(across, Math.cos(a) * .0155).addScaledVector(up, Math.sin(a) * .0155), PUPIL, here(at), n);
    });
    for (let i = 0; i < 6; i++) mesh.tri(tip, rim[i], rim[(i + 1) % 6]);
    finish(mesh);
  }
  const tentacle = (s: number, theta: number, dir: Vector3, length: number, width: number, edges: number[], colors: readonly RGB[]) => {
    const base = ctx.surface(s, theta, -.004);
    const across = new Vector3().crossVectors(UP, dir).normalize();
    const normal = new Vector3().crossVectors(dir, across).normalize();
    blade(mesh, {
      stations: edges.map((t) => ({ t, p: base.clone().addScaledVector(dir, length * t).addScaledVector(BACK, .25 * length * t * t), across, half: width * (1 - t) ** .7 * (t === 1 ? 0 : 1) })),
      colors, normal, skin: (_t, p) => here(p),
    });
  };
  for (const side of [1, -1]) {
    // The long fleshy tentacle above each eye, banded; a short one by the nostril.
    tentacle(.13, side * .6, new Vector3(side * .4, .88, -.3).normalize(), .11, .0115, [0, .34, .67, 1], [RED, CREAM, RED]);
    tentacle(.065, side * .5, new Vector3(side * .3, .85, .1).normalize(), .04, .0055, [0, .5, 1], [RED, CREAM]);
    // Tabs under the chin and at the corner of the mouth.
    tentacle(.07, side * 2.3, new Vector3(side * .3, -.9, -.2).normalize(), .042, .0055, [0, .5, 1], [CREAM, PINK]);
    tentacle(.115, side * 2.05, new Vector3(side * .45, -.85, -.3).normalize(), .036, .005, [0, .5, 1], [CREAM, PINK]);
    // The wide mouth, running back and down under the eye; the lower jaw's pale lip.
    const line = Array.from({ length: 9 }, (_, i) => [.004 + .165 * i / 8, side * (1.6 + .5 * (i / 8) ** 1.3)] as const);
    ctx.ribbon(line, (t) => .0075 * (.35 + .65 * Math.sin(Math.PI * Math.min(1, t * 1.08))), LIP, .0009);
    ctx.ribbon(line, (t) => .0038 * (.35 + .65 * Math.sin(Math.PI * Math.min(1, t * 1.08))), MOUTH, .0017);
  }

  ctx.spineBones();
  const tailPivot = (height: number) => new Vector3(0, height, z(.9));
  bones.push(
    { name: 'TailUpper', parent: 'Tail', position: tailPivot(axisY + .04) },
    { name: 'TailLower', parent: 'Tail', position: tailPivot(axisY - .04) },
    { name: 'Dorsal', parent: rig.dorsalParent, position: new Vector3(0, ctx.yTop(rig.dorsalAt), z(rig.dorsalAt)) },
    { name: 'PectoralL', parent: 'Root', position: pectorals[0] },
    { name: 'PectoralR', parent: 'Root', position: pectorals[1] },
  );
  return { mesh, bones };
}
