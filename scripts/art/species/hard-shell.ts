/**
 * Shared parts of the hard-shelled sea turtles (hawksbill, loggerhead): a carapace built scute by
 * scute from one net of seams (nuchal, five vertebrals, costals, marginals, supracaudals), each scute
 * its own little pillowed patch so the seams stay crisp in the vertex colors; a pale plastron that
 * closes the shell at its rim; a lofted head; and the flippers with their claws and the tail. Each
 * species supplies the plan outline, the layout of the net, how it paints a scute and its head.
 *
 * Model space: head tip at z = +0.5, tail tip at z = -0.5 (one body length), nose +Z, Y up, +X left.
 */
import { Vector3 } from 'three';
import { blendSkins, chainSkin, clamp, curve, fin, MeshBuilder, path, smoothstep, TAU, type RGB, type Skin } from './kit';
import type { BoneSpec } from './export';

type V2 = readonly [number, number];
const UP = new Vector3(0, 1, 0);
/** Height of the rim, where the carapace and the plastron meet. */
export const RIM_Y = .001;

export type ScuteKind = 'nuchal' | 'vertebral' | 'costal' | 'marginal' | 'supracaudal';
export type ScutePaint = {
  kind: ScuteKind;
  /** Place in its series, front to back (a vertebral 0..4, a costal 0.., a marginal 0..), and its side: 1 left, -1 right, 0 on the midline. */
  index: number;
  side: number;
  x: number;
  z: number;
  /** 0 at the middle of the shell, 1 on its rim. */
  rho: number;
  /** 0 at the scute's center, 1 on its edge. */
  edge: number;
  /** Which of the `n` vertices around the edge this vertex belongs to, and the angle of that vertex around the scute's center. */
  i: number;
  n: number;
  angle: number;
  /** A number unique to the scute, for its own irregular marking. */
  seed: number;
};

export type ShellSpec = {
  /** The right half of the plan outline: [position from the front (0) to the rear (1), half-width as a fraction of the shell's length]. */
  width: readonly (readonly [number, number])[];
  /** Where the shell's front edge, rear edge and the center of its dome lie (z). */
  front: number;
  back: number;
  center: number;
  /** The inner edge of the marginals, as a fraction of the way out to the rim. */
  ring: number;
  dome: { height: number; power: number; keel: number; keelWidth: number };
  marginals: {
    count: number;
    /** Where the first and last seam fall along the rim (0 front-center .. 1 rear-center). */
    from: number;
    to: number;
    /** How far (units) the rear corner of marginal k flares out into a tooth, 0 for none. */
    tooth: (k: number) => number;
  };
  /** The vertebral series: waist nodes (6) and the lateral corners (5) between them, each [position down the ring 0..1, half-width in units]. */
  waists: readonly (readonly [number, number])[];
  corners: readonly (readonly [number, number])[];
  /** The corners (1..5) the costal seams start from, and where each meets the ring (position down the ring 0..1). */
  seams: readonly { corner: number; reach: number }[];
  /** How much each scute swells at its middle, and how far an overlapping scute's rear edge stands above the one behind it. */
  pillow: number;
  lip: number;
  /** Which edges of the interior scutes get a dark skirt covering the step to the next scute. */
  skirt: 'rear' | 'all' | 'none';
  seam: RGB;
  paint: (scute: ScutePaint) => RGB;
};

const dist = (a: V2, b: V2) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const flip = (p: V2): V2 => [-p[0], p[1]];

function centroid(poly: readonly V2[]): V2 {
  let area = 0, cx = 0, cz = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, z0] = poly[i], [x1, z1] = poly[(i + 1) % poly.length];
    const f = x0 * z1 - x1 * z0;
    area += f; cx += (x0 + x1) * f; cz += (z0 + z1) * f;
  }
  if (Math.abs(area) < 1e-9) return [poly.reduce((s, p) => s + p[0], 0) / poly.length, poly.reduce((s, p) => s + p[1], 0) / poly.length];
  return [cx / (3 * area), cz / (3 * area)];
}

/** Split long edges evenly, so neighbors that share an edge always share its vertices. */
function densify(poly: readonly V2[], maxLength: number): V2[] {
  const out: V2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const n = Math.max(1, Math.ceil(dist(a, b) / maxLength - 1e-6));
    for (let j = 0; j < n; j++) out.push([a[0] + (b[0] - a[0]) * j / n, a[1] + (b[1] - a[1]) * j / n]);
  }
  return out;
}

/** The plan of the shell: its outline, rim, dome and the net of seams laid over it. */
export function planform(spec: ShellSpec) {
  const length = spec.front - spec.back;
  const half = curve(spec.width.map(([v, w]) => [v, w * length] as const));
  const N = 120;
  const pts: V2[] = Array.from({ length: N + 1 }, (_, i) => {
    const v = .5 - .5 * Math.cos(Math.PI * i / N);
    return [Math.abs(half(v)), spec.front - v * length] as const;
  });
  const arc = [0];
  for (let i = 1; i <= N; i++) arc.push(arc[i - 1] + dist(pts[i - 1], pts[i]));
  const total = arc[N];
  /** The outline's right half at fraction q of the way from the front (0) to the rear (1). */
  const outline = (q: number): V2 => {
    const t = clamp(q) * total;
    let i = 1;
    while (i < N && arc[i] < t) i++;
    const f = (t - arc[i - 1]) / Math.max(arc[i] - arc[i - 1], 1e-9);
    return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f];
  };
  const tangent = (q: number): V2 => {
    const a = outline(q - .01), b = outline(q + .01), d = dist(a, b) || 1;
    return [(b[0] - a[0]) / d, (b[1] - a[1]) / d];
  };
  const qAtZ = (z: number) => {
    let lo = 0, hi = 1;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (outline(mid)[1] > z) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  };

  // Radius of the rim by angle from straight ahead around the dome's center.
  const polar: [number, number][] = pts.map(([x, z]) => [Math.atan2(x, z - spec.center), Math.hypot(x, z - spec.center)]);
  for (let i = 1; i <= N; i++) polar[i][0] = Math.max(polar[i][0], polar[i - 1][0]);
  const rim = (angle: number) => {
    const a = Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle)));
    let i = 1;
    while (i < N && polar[i][0] < a) i++;
    const f = clamp((a - polar[i - 1][0]) / Math.max(polar[i][0] - polar[i - 1][0], 1e-9));
    return polar[i - 1][1] + (polar[i][1] - polar[i - 1][1]) * f;
  };
  const rho = (x: number, z: number) => {
    const dz = z - spec.center, r = Math.hypot(x, dz);
    return r < 1e-6 ? 0 : Math.min(1, r / rim(Math.atan2(x, dz)));
  };
  const { dome } = spec;
  /** Height of the bare shell at a point of the plan. */
  const surface = (x: number, z: number) => {
    const t = 1 - rho(x, z) ** 2;
    return RIM_Y + dome.height * t ** dome.power + dome.keel * Math.exp(-((x / dome.keelWidth) ** 2)) * t ** .6;
  };

  const ringPoint = (q: number): V2 => {
    const [x, z] = outline(q);
    return [x * spec.ring, spec.center + (z - spec.center) * spec.ring];
  };
  const ringFront = spec.center + (spec.front - spec.center) * spec.ring;
  const ringBack = spec.center + (spec.back - spec.center) * spec.ring;
  const ringZ = (t: number) => ringFront + (ringBack - ringFront) * t;
  const qAtRingZ = (t: number) => qAtZ(spec.center + (ringZ(t) - spec.center) / spec.ring);
  return { length, front: spec.front, back: spec.back, outline, tangent, qAtZ, rim, rho, surface, ringPoint, ringZ, qAtRingZ, total };
}
export type Planform = ReturnType<typeof planform>;

/** A scute while it is being laid out, before it is tessellated. */
type Scute = { kind: ScuteKind; index: number; side: number; pts: V2[]; rear: V2; rings: number[]; skirt: 'rear' | 'all' | 'none'; pillow: number; lip: number };

/** The carapace's scutes; returns the plan and the rim nodes the plastron has to meet. */
export function buildCarapace(mesh: MeshBuilder, spec: ShellSpec) {
  const plan = planform(spec);
  const { outline, tangent, ringPoint, surface } = plan;
  const m = spec.marginals;
  const dq = (m.to - m.from) / m.count;
  const mq = Array.from({ length: m.count + 1 }, (_, k) => m.from + dq * k);
  const reachQ = spec.seams.map((s) => plan.qAtRingZ(s.reach));
  const ringQs = [...mq, ...reachQ].sort((a, b) => a - b);
  const ringNodes = (qa: number, qb: number) => ringQs.filter((q) => q >= qa - 1e-9 && q <= qb + 1e-9).map(ringPoint);
  const rimQs = new Set<number>([0, 1]);

  // Right-hand chain along the vertebrals: waist, corner, waist, corner, ... waist.
  const chain: V2[] = [];
  spec.waists.forEach(([t, w], j) => {
    chain.push([w, plan.ringZ(t)]);
    if (j < spec.corners.length) chain.push([spec.corners[j][1], plan.ringZ(spec.corners[j][0])]);
  });
  const lastWaist = chain[chain.length - 1];
  const midline: V2 = [0, lastWaist[1]];

  const scutes: Scute[] = [];
  const interior = { rings: [1, .62, .3], skirt: spec.skirt, pillow: spec.pillow, lip: spec.lip };
  const edgeOnly = { rings: [1, .5], skirt: 'none' as const, pillow: spec.pillow * .6, lip: 0 };

  // Nuchal: across the front, back to the first vertebral's front edge.
  {
    const q0 = mq[0];
    [q0, q0 / 2].forEach((q) => rimQs.add(q));
    const outer: V2[] = [flip(outline(q0)), flip(outline(q0 / 2)), outline(0), outline(q0 / 2), outline(q0)];
    scutes.push({ kind: 'nuchal', index: 0, side: 0, rear: [0, -1], ...edgeOnly,
      pts: [...outer, ringPoint(q0), chain[0], flip(chain[0]), flip(ringPoint(q0))] });
  }
  // Vertebrals.
  for (let j = 1; j <= spec.corners.length; j++) {
    const b0 = chain[2 * (j - 1)], c = chain[2 * j - 1], b1 = chain[2 * j];
    scutes.push({ kind: 'vertebral', index: j - 1, side: 0, rear: [0, -1], ...interior,
      pts: [b0, c, b1, ...(j === spec.corners.length ? [midline] : []), flip(b1), flip(c), flip(b0)] });
  }
  // Costals and marginals, for both sides.
  const costals = spec.seams.length + 1;
  for (const side of [1, -1] as const) {
    const sx = (p: V2): V2 => (side > 0 ? p : flip(p));
    for (let i = 0; i < costals; i++) {
      const start = i === 0 ? 0 : 2 * spec.seams[i - 1].corner - 1;
      const end = i === costals - 1 ? chain.length - 1 : 2 * spec.seams[i].corner - 1;
      const qa = i === 0 ? mq[0] : reachQ[i - 1], qb = i === costals - 1 ? mq[m.count] : reachQ[i];
      const inner = chain.slice(start, end + 1).reverse();
      scutes.push({ kind: 'costal', index: i, side, rear: [0, -1], ...interior,
        pts: [...ringNodes(qa, qb), ...inner].map(sx) });
    }
    for (let k = 0; k < m.count; k++) {
      const qa = mq[k], qb = mq[k + 1];
      const fractions = [0, .5, 1];
      const tooth = m.tooth(k);
      const t = tangent(qb), n: V2 = [t[1], -t[0]];
      const outer = fractions.map((f) => {
        const q = qa + (qb - qa) * f;
        if (f < 1) rimQs.add(q);
        const [x, z] = outline(q);
        const push = tooth * f ** 1.5;
        return [x + (t[0] * .4 + n[0] * .8) * push, z + (t[1] * .4 + n[1] * .8) * push] as V2;
      });
      rimQs.add(qb);
      const ta = tangent((qa + qb) / 2);
      scutes.push({ kind: 'marginal', index: k, side, rear: sx(ta), ...edgeOnly,
        ...(tooth > 0 ? { skirt: 'rear' as const, lip: spec.lip * .7 } : {}),
        pts: [...outer, ...ringNodes(qa, qb).reverse()].map(sx) });
    }
    // Supracaudal.
    const q = mq[m.count], mid = (q + 1) / 2;
    [mid].forEach((v) => rimQs.add(v));
    scutes.push({ kind: 'supracaudal', index: 0, side, rear: [0, -1], ...edgeOnly,
      pts: [outline(q), outline(mid), outline(1), midline, chain[chain.length - 1], ringPoint(q)].map(sx) });
  }

  // --- Tessellate each scute as a pillowed patch of rings round its center ---
  mesh.begin();
  const maxEdge = .085;
  for (const sc of scutes) {
    const poly = densify(sc.pts, maxEdge);
    const n = poly.length;
    const [cx, cz] = centroid(poly);
    const projections = poly.map((p) => p[0] * sc.rear[0] + p[1] * sc.rear[1]);
    const lo = Math.min(...projections), hi = Math.max(...projections);
    const seed = (sc.kind.length * 17 + sc.index * 5.3 + (sc.side + 2) * 31.7) % 97;
    const vertexAt = (p: V2, s: number, i: number) => {
      const x = cx + (p[0] - cx) * s, z = cz + (p[1] - cz) * s;
      const f = clamp((x * sc.rear[0] + z * sc.rear[1] - lo) / Math.max(hi - lo, 1e-6));
      const y = surface(x, z) + sc.pillow * (1 - s * s) + sc.lip * f;
      const color = spec.paint({ kind: sc.kind, index: sc.index, side: sc.side, x, z, rho: plan.rho(x, z), edge: s, i, n, angle: Math.atan2(p[0] - cx, p[1] - cz), seed });
      return { id: mesh.vertex(new Vector3(x, y, z), color, { Root: 1 }), x, y, z };
    };
    const rings = sc.rings.map((s) => poly.map((p, i) => vertexAt(p, s, i)));
    const center = vertexAt([cx, cz], 0, 0);
    const up = (a: number, b: number, c: number) => {
      const pa = mesh.point(a), pb = mesh.point(b), pc = mesh.point(c);
      if (pb.sub(pa).cross(pc.sub(pa)).y < 0) mesh.tri(a, c, b); else mesh.tri(a, b, c);
    };
    for (let r = 0; r < rings.length - 1; r++) {
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        up(rings[r][i].id, rings[r][j].id, rings[r + 1][j].id);
        up(rings[r][i].id, rings[r + 1][j].id, rings[r + 1][i].id);
      }
    }
    const inner = rings[rings.length - 1];
    for (let i = 0; i < n; i++) up(inner[i].id, inner[(i + 1) % n].id, center.id);

    // A dark skirt hangs from the edges that stand over the next scute, covering the step.
    if (sc.skirt !== 'none') {
      for (let i = 0; i < n; i++) {
        const a = rings[0][i], b = rings[0][(i + 1) % n];
        const ex = b.x - a.x, ez = b.z - a.z, len = Math.hypot(ex, ez) || 1;
        let nx = ez / len, nz = -ex / len;
        if (nx * ((a.x + b.x) / 2 - cx) + nz * ((a.z + b.z) / 2 - cz) < 0) { nx = -nx; nz = -nz; }
        const facing = nx * sc.rear[0] + nz * sc.rear[1];
        if (facing < (sc.skirt === 'rear' ? .45 : -.4)) continue;
        const drop = (v: typeof a) => mesh.vertex(new Vector3(v.x, surface(v.x, v.z) - .003, v.z), spec.seam, { Root: 1 });
        const ta = mesh.vertex(new Vector3(a.x, a.y, a.z), spec.seam, { Root: 1 }), tb = mesh.vertex(new Vector3(b.x, b.y, b.z), spec.seam, { Root: 1 });
        const ba = drop(a), bb = drop(b);
        const normal = mesh.point(tb).sub(mesh.point(ta)).cross(mesh.point(ba).sub(mesh.point(ta)));
        if (normal.x * nx + normal.z * nz < 0) { mesh.tri(ta, bb, tb); mesh.tri(ta, ba, bb); } else { mesh.tri(ta, tb, bb); mesh.tri(ta, bb, ba); }
      }
    }
  }
  mesh.end({ closed: false, outward: () => UP });
  return { plan, rimQs: [...rimQs].sort((a, b) => a - b) };
}

export type PlastronSpec = {
  /** How far the underside hangs below the rim at the middle. */
  depth: number;
  paint: (x: number, z: number, edge: number) => RGB;
  /** The plastron's scute seams: a line down the middle and crosswise lines at these fractions of its length (front 0 .. rear 1). */
  seams?: { at: readonly number[]; color: RGB; half: number };
};

/** The pale underside, meeting the carapace at the rim nodes. */
export function buildPlastron(mesh: MeshBuilder, plan: Planform, rimQs: readonly number[], center: number, spec: PlastronSpec) {
  const loop: V2[] = [...rimQs.map((q) => plan.outline(q)), ...rimQs.slice(1, -1).reverse().map((q) => flip(plan.outline(q)))];
  const n = loop.length;
  const scales = [.36, .68, 1];
  const depthAt = (s: number) => spec.depth * (1 - s ** 2.5) ** .7;
  mesh.begin();
  const vertex = (x: number, z: number, s: number) => mesh.vertex(new Vector3(x, RIM_Y - depthAt(s), z), spec.paint(x, z, s), { Root: 1 });
  const rings = scales.map((s) => loop.map((p) => vertex(p[0] * s, center + (p[1] - center) * s, s)));
  const hub = vertex(0, center, 0);
  for (let r = 0; r < rings.length - 1; r++) {
    for (let i = 0; i < n; i++) mesh.quad(rings[r][i], rings[r][(i + 1) % n], rings[r + 1][(i + 1) % n], rings[r + 1][i]);
  }
  for (let i = 0; i < n; i++) mesh.tri(hub, rings[0][(i + 1) % n], rings[0][i]);
  mesh.end({ closed: false, outward: () => new Vector3(0, -1, 0) });

  if (!spec.seams) return;
  // Seams: thin dark ribbons just under the surface, along the middle and across.
  const { at, color, half } = spec.seams;
  const zAt = (f: number) => plan.front - plan.length * f;
  const below = (x: number, z: number) => RIM_Y - depthAt(plan.rho(x, z)) - .0007;
  mesh.begin();
  const ribbon = (points: readonly V2[], perp: V2) => {
    const row = points.map(([x, z]) => [
      mesh.vertex(new Vector3(x - perp[0] * half, below(x, z), z - perp[1] * half), color, { Root: 1 }),
      mesh.vertex(new Vector3(x + perp[0] * half, below(x, z), z + perp[1] * half), color, { Root: 1 }),
    ]);
    for (let i = 0; i < row.length - 1; i++) mesh.quad(row[i][0], row[i][1], row[i + 1][1], row[i + 1][0]);
  };
  ribbon(Array.from({ length: 9 }, (_, i) => [0, zAt(.14 + .7 * i / 8)] as V2), [1, 0]);
  for (const f of at) {
    const z = zAt(f), reach = .5 * plan.outline(plan.qAtZ(z))[0];
    ribbon(Array.from({ length: 7 }, (_, i) => [reach * (2 * i / 6 - 1), z] as V2), [0, 1]);
  }
  mesh.end({ closed: false, outward: () => new Vector3(0, -1, 0) });
}

/** A small cone standing on the shell: a barnacle, a claw's blunt cousin. */
export function cone(mesh: MeshBuilder, base: Vector3, axis: Vector3, radius: number, length: number, color: RGB, tipColor: RGB, skin: Skin, sides = 6, tipRadius = 0) {
  const a = axis.clone().normalize();
  const t1 = (Math.abs(a.y) < .9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0)).cross(a).normalize(), t2 = a.clone().cross(t1);
  mesh.begin();
  const ring = (center: Vector3, r: number, c: RGB) => Array.from({ length: sides }, (_, i) => {
    const angle = TAU * i / sides;
    return mesh.vertex(center.clone().addScaledVector(t1, Math.cos(angle) * r).addScaledVector(t2, Math.sin(angle) * r), c, skin);
  });
  const bottom = ring(base, radius, color), top = ring(base.clone().addScaledVector(a, length), tipRadius, tipColor);
  for (let i = 0; i < sides; i++) mesh.quad(bottom[i], bottom[(i + 1) % sides], top[(i + 1) % sides], top[i]);
  const cap = mesh.vertex(base.clone().addScaledVector(a, length * 1.001), tipColor, skin);
  for (let i = 0; i < sides; i++) mesh.tri(cap, top[i], top[(i + 1) % sides]);
  mesh.end();
}

// --- The head ---

export type HeadSection = {
  /** Center height, half-width and half-height of the cross-section at z; `boxy` > 2 squares the corners (2 is an ellipse). */
  cy: number; hw: number; hh: number; boxy?: number;
};
export type HeadSpec = {
  zs: readonly number[];
  sides: number;
  section: (z: number) => HeadSection;
  /** Vertex color at ring position `theta` (0 on top, rising toward the animal's left). */
  color: (p: Vector3, z: number, theta: number, k: number) => RGB;
  /** The snout's tip and the neck's end, which close the loft. */
  snout: { p: Vector3; color: RGB };
  neck: { p: Vector3; color: RGB };
  skin: (z: number) => Skin;
};

/** A point on the head's surface at z and ring angle theta (0 on top, rising toward +x). */
export function headSurface(section: (z: number) => HeadSection, z: number, theta: number) {
  const s = section(z), e = 2 / (s.boxy ?? 2);
  const sx = Math.sin(theta), sy = Math.cos(theta);
  return new Vector3(Math.sign(sx) * Math.abs(sx) ** e * s.hw, s.cy + Math.sign(sy) * Math.abs(sy) ** e * s.hh, z);
}

export function loftHead(mesh: MeshBuilder, spec: HeadSpec) {
  mesh.begin();
  const rings = spec.zs.map((z) => Array.from({ length: spec.sides }, (_, k) => {
    const theta = TAU * k / spec.sides;
    const p = headSurface(spec.section, z, theta);
    return mesh.vertex(p, spec.color(p, z, theta, k), spec.skin(z));
  }));
  for (let j = 0; j < rings.length - 1; j++) {
    for (let k = 0; k < spec.sides; k++) mesh.quad(rings[j][k], rings[j][(k + 1) % spec.sides], rings[j + 1][(k + 1) % spec.sides], rings[j + 1][k]);
  }
  const snout = mesh.vertex(spec.snout.p, spec.snout.color, { Head: 1 });
  const neck = mesh.vertex(spec.neck.p, spec.neck.color, { Root: 1 });
  const last = rings[rings.length - 1], first = rings[0];
  for (let k = 0; k < spec.sides; k++) {
    mesh.tri(snout, last[k], last[(k + 1) % spec.sides]);
    mesh.tri(neck, first[(k + 1) % spec.sides], first[k]);
  }
  mesh.end();
}

/** A patch laid on a curved surface: a scale or plate of the head, a thin pale edge round a darker middle. */
export function decal(mesh: MeshBuilder, outline: readonly Vector3[], normal: Vector3, lift: number, center: RGB, edge: RGB, skin: Skin) {
  const c = outline.reduce((s, p) => s.add(p), new Vector3()).multiplyScalar(1 / outline.length);
  const n = outline.length;
  mesh.begin();
  const hub = mesh.vertex(c.clone().addScaledVector(normal, lift * 1.8), center, skin, normal);
  const outer = outline.map((p) => mesh.vertex(p.clone().addScaledVector(normal, lift), edge, skin, normal));
  const inner = outline.map((p) => mesh.vertex(c.clone().lerp(p, .76).addScaledVector(normal, lift * 1.6), center, skin, normal));
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    mesh.quad(outer[i], outer[j], inner[j], inner[i]);
    mesh.tri(hub, inner[i], inner[j]);
  }
  mesh.end({ closed: false, normals: false, outward: () => normal });
}

/**
 * A plate of the head's scales over z0..z1 and ring angles t0..t1 (negative angles are the animal's right):
 * a quadrilateral with its corners cut and nudged a little, so no two look alike.
 */
export function headPlate(mesh: MeshBuilder, section: (z: number) => HeadSection, z0: number, z1: number, t0: number, t1: number, center: RGB, edge: RGB, skin: Skin, lift = .0012) {
  const at = (z: number, t: number) => headSurface(section, z, t);
  const seed = z0 * 91.7 + t0 * 37.3 + t1 * 11.1;
  const jitter = (i: number) => (Math.sin(seed * (i + 3.1) * 12.9898) * 43758.5453 % 1) * .09;
  const corners: [number, number][] = [[z0, t0], [z1, t0], [z1, t1], [z0, t1]].map(([z, t], i) => [z + jitter(i) * (z1 - z0), t + jitter(i + 5) * (t1 - t0)]);
  const outline: Vector3[] = [];
  corners.forEach(([za, ta], i) => {
    const [zb, tb] = corners[(i + 1) % 4];
    outline.push(at(za + (zb - za) * .2, ta + (tb - ta) * .2), at(za + (zb - za) * .8, ta + (tb - ta) * .8));
  });
  const zm = (z0 + z1) / 2, tm = (t0 + t1) / 2, d = .004;
  const normal = at(zm, tm + d).sub(at(zm, tm - d)).cross(at(zm + d, tm).sub(at(zm - d, tm))).normalize();
  const out = at(zm, tm).sub(new Vector3(0, section(zm).cy, zm));
  if (normal.dot(out) < 0) normal.negate();
  decal(mesh, outline, normal, lift, center, edge, skin);
}

/** A thin line on the head, such as the mouth's: a ribbon through (z, ring angle) points, `half` radians wide each way. */
export function headLine(mesh: MeshBuilder, section: (z: number) => HeadSection, points: readonly (readonly [number, number])[], half: number, color: RGB, skin: Skin, lift = .001) {
  mesh.begin();
  const rows = points.map(([z, t]) => {
    const a = headSurface(section, z, t - half), b = headSurface(section, z, t + half);
    const out = headSurface(section, z, t).sub(new Vector3(0, section(z).cy, z)).normalize().multiplyScalar(lift);
    return [mesh.vertex(a.add(out), color, skin), mesh.vertex(b.add(out), color, skin)];
  });
  for (let i = 0; i < rows.length - 1; i++) mesh.quad(rows[i][0], rows[i][1], rows[i + 1][1], rows[i + 1][0]);
  mesh.end({ closed: false, outward: () => new Vector3(Math.sign(points[0][1]), 0, 0) });
}

// --- Limbs ---

type P3 = readonly [number, number, number];
export type FrontFlipper = {
  /** The leading and trailing edge for the animal's left side (x > 0); the right is mirrored. */
  le: readonly P3[]; te: readonly P3[];
  stations: number; chordPoints: number;
  thickness: (v: number) => number;
  color: (v: number, u: number, face: number, side: number) => RGB;
  /** Where the bones sit and where the forearm starts (as a fraction down the flipper). */
  shoulder: P3; elbow: P3; elbowAt: number;
  /** Claws on the leading edge, at these positions down the flipper. */
  claws: { at: readonly number[]; length: number; radius: number; color: RGB; tip: RGB };
};

export function buildFrontFlippers(mesh: MeshBuilder, bones: BoneSpec[], f: FrontFlipper) {
  for (const side of [1, -1] as const) {
    const s = side;
    const mirror = (pts: readonly P3[]) => pts.map((p) => [p[0] * s, p[1], p[2]] as const);
    const le = path3(mirror(f.le)), te = path3(mirror(f.te));
    const [upper, lower] = side > 0 ? ['FrontL1', 'FrontL2'] : ['FrontR1', 'FrontR2'];
    const skinAt = (v: number) => blendSkins({ Root: 1 }, chainSkin(v, [0, f.elbowAt], [upper, lower], 1), smoothstep(.02, .1, v));
    fin(mesh, {
      stations: f.stations, le, te, thickness: f.thickness, side: new Vector3(0, 1, 0), chordPoints: f.chordPoints,
      color: (_p, v, u, face) => f.color(v, u, face, s),
      skin: (_p, v) => skinAt(v),
    });
    for (const v of f.claws.at) {
      const a = le(v), b = te(v);
      const out = a.clone().sub(b).setY(0).normalize();
      const along = le(Math.min(1, v + .04)).sub(le(Math.max(0, v - .04))).setY(0).normalize();
      const axis = out.multiplyScalar(.55).addScaledVector(along, .75).add(new Vector3(0, -.2, 0));
      cone(mesh, a.clone().addScaledVector(out, -.004), axis, f.claws.radius, f.claws.length, f.claws.color, f.claws.tip, skinAt(v), 5);
    }
    bones.push(
      { name: upper, parent: 'Root', position: new Vector3(s * f.shoulder[0], f.shoulder[1], f.shoulder[2]) },
      { name: lower, parent: upper, position: new Vector3(s * f.elbow[0], f.elbow[1], f.elbow[2]) },
    );
  }
}

const path3 = (pts: readonly P3[]) => path(pts as readonly (readonly [number, number, number])[]);

export type RearFlipper = {
  le: readonly P3[]; te: readonly P3[];
  thickness: (v: number) => number;
  color: (u: number, face: number) => RGB;
  root: P3;
  /** Claws on the rear flipper's leading edge (the hawksbill has them): positions down the flipper. */
  claws?: { at: readonly number[]; length: number; radius: number; color: RGB; tip: RGB };
};

export function buildRearFlippers(mesh: MeshBuilder, bones: BoneSpec[], f: RearFlipper) {
  for (const side of [1, -1] as const) {
    const s = side;
    const mirror = (pts: readonly P3[]) => pts.map((p) => [p[0] * s, p[1], p[2]] as const);
    const le = path3(mirror(f.le)), te = path3(mirror(f.te));
    const name = side > 0 ? 'RearL' : 'RearR';
    const skinAt = (v: number) => blendSkins({ Root: 1 }, { [name]: 1 }, smoothstep(.05, .3, v));
    fin(mesh, {
      stations: 4, le, te, thickness: f.thickness, side: new Vector3(0, 1, 0),
      color: (_p, _v, u, face) => f.color(u, face),
      skin: (_p, v) => skinAt(v),
    });
    if (f.claws) {
      for (const v of f.claws.at) {
        const a = le(v), b = te(v);
        const out = a.clone().sub(b).setY(0).normalize();
        const axis = out.multiplyScalar(.6).add(new Vector3(0, -.2, -.5));
        cone(mesh, a.clone().addScaledVector(out, -.003), axis, f.claws.radius, f.claws.length, f.claws.color, f.claws.tip, skinAt(v), 5);
      }
    }
    bones.push({ name, parent: 'Root', position: new Vector3(s * f.root[0], f.root[1], f.root[2]) });
  }
}

/** A short, stout tail with the animal's skin color, under the shell's rear point. */
export function buildTail(mesh: MeshBuilder, color: RGB, z0: number, z1: number, tip: number, radius: number, y: number) {
  mesh.begin();
  const ring = (z: number, r: number) => Array.from({ length: 6 }, (_, k) => {
    const a = TAU * k / 6;
    return mesh.vertex(new Vector3(Math.sin(a) * r, y + Math.cos(a) * r * .8, z), color, blendSkins({ Root: 1 }, { Tail: 1 }, smoothstep(-z0 - .01, -z0 + .03, -z)));
  });
  const a = ring(z0, radius), b = ring(z1, radius * .62);
  for (let k = 0; k < 6; k++) mesh.quad(a[k], a[(k + 1) % 6], b[(k + 1) % 6], b[k]);
  const end = mesh.vertex(new Vector3(0, y - .002, tip), color, { Tail: 1 });
  for (let k = 0; k < 6; k++) mesh.tri(end, b[k], b[(k + 1) % 6]);
  mesh.end();
}
