/**
 * Shared shark construction (also used for the dolphin's body). A species design
 * supplies its own proportions, fin outlines, tail and markings; this module lofts
 * the body, attaches fins so their roots are buried in the skin, paints markings
 * as thin conforming decals and places the swim rig's spine bones.
 */
import { Vector3 } from 'three';
import type { CetaceanRig, SharkRig } from '../../../src/lib/marine-rigs';
import { blendSkins, chainSkin, clamp, curve, eye, fin, MeshBuilder, smoothstep, TAU, type RGB, type Skin } from './kit';
import type { BoneSpec } from './export';

type Points = readonly (readonly [number, number])[];

export type SharkDesign = {
  /** The spine joints the body is skinned to (a dolphin's body is lofted the same way). */
  rig: Pick<SharkRig | CetaceanRig, 'joints'>;
  /** Z of the snout tip; the model origin sits near the center of mass. */
  nose: number;
  /** Axial position where the body loft ends inside the caudal fin. */
  bodyEnd: number;
  /** Cross-section control points along the body: [s, value]. */
  width: Points; top: Points; bottom: Points; center: Points;
  /** Superellipse exponents: 2 is elliptical, higher is boxier. */
  squareTop: Points; squareBottom: Points;
  /** Lateral keel on the caudal peduncle. */
  keel?: Points;
  /** Low longitudinal ridges: angle from the dorsal midline and height along the body. */
  ridges?: { angle: number; height: Points }[];
  /** Blunt fronts close with a domed face instead of a point. */
  frontDome?: number;
  rings: number;
  columnsAbove: number;
  columnsBelow: number;
  /** Angle from the dorsal midline where the dark back meets the pale belly. */
  boundary: (s: number) => number;
  /** Half-width of the aligned column pair at the boundary; small values give a crisp edge. */
  boundaryGap: number;
  paint: (s: number, theta: number, p: Vector3) => RGB;
};

export type SharkContext = ReturnType<typeof sharkContext>;

export function sharkContext(design: SharkDesign) {
  const mesh = new MeshBuilder();
  const bones: BoneSpec[] = [];
  const width = curve(design.width), top = curve(design.top), bottom = curve(design.bottom), center = curve(design.center);
  const squareTop = curve(design.squareTop), squareBottom = curve(design.squareBottom);
  const keel = design.keel ? curve(design.keel) : null;
  const ridges = (design.ridges ?? []).map((r) => ({ angle: r.angle, height: curve(r.height) }));
  const [root, spine2, rearBody, tailBase, tail] = design.rig.joints;
  const chainJoints = [0, root, spine2, rearBody, tailBase, tail];
  const chainNames = ['Head', 'Spine1', 'Spine2', 'RearBody', 'TailBase', 'Tail'];
  const z = (s: number) => design.nose - s;
  const sOf = (zz: number) => design.nose - zz;

  /** Body surface at axial position s and angle theta (0 = dorsal midline, +pi/2 = left flank). */
  function raw(s: number, theta: number) {
    const sinT = Math.sin(theta), cosT = Math.cos(theta);
    const up = cosT >= 0;
    const e = 2 / (up ? squareTop(s) : squareBottom(s));
    const h = up ? top(s) : bottom(s);
    let x = width(s) * Math.sign(sinT) * Math.abs(sinT) ** e;
    let y = center(s) + h * Math.sign(cosT) * Math.abs(cosT) ** e;
    if (keel) x += keel(s) * Math.sign(sinT) * Math.abs(sinT) ** 24;
    for (const ridge of ridges) {
      const folded = Math.abs(Math.atan2(sinT, cosT));
      const bump = ridge.height(s) * Math.exp(-(((folded - ridge.angle) / .05) ** 2));
      x += bump * sinT; y += bump * cosT;
    }
    return new Vector3(x, y, z(s));
  }
  function normal(s: number, theta: number) {
    const ds = .0025, dt = .012;
    const a = raw(Math.min(design.bodyEnd, s + ds), theta).sub(raw(Math.max(0, s - ds), theta));
    const b = raw(s, theta + dt).sub(raw(s, theta - dt));
    const n = b.cross(a).normalize();
    const p = raw(s, theta);
    if (n.dot(new Vector3(p.x, p.y - center(s), 0)) < 0) n.negate();
    return n;
  }
  const surface = (s: number, theta: number, lift = 0) => raw(s, theta).addScaledVector(normal(s, theta), lift);
  const skin = (s: number): Skin => chainSkin(s, chainJoints, chainNames, 1);
  const fold = (theta: number) => Math.abs(Math.atan2(Math.sin(theta), Math.cos(theta)));
  const yTop = (s: number) => center(s) + top(s);
  const yBottom = (s: number) => center(s) - bottom(s);

  /** Column angles for one side, with a tight pair straddling the countershading boundary. */
  function columns(s: number) {
    const b = design.boundary(s), gap = design.boundaryGap;
    const side: number[] = [];
    for (let i = 0; i <= design.columnsAbove; i++) side.push((b - gap) * i / design.columnsAbove);
    for (let i = 0; i <= design.columnsBelow; i++) side.push(b + gap + (Math.PI - b - gap) * i / design.columnsBelow);
    return [...side, ...side.slice(1, -1).reverse().map((t) => TAU - t)];
  }

  function body() {
    mesh.begin();
    const n = design.rings;
    // Denser rings at the snout and peduncle where the outline turns fastest.
    const ss = Array.from({ length: n }, (_, j) => {
      const t = j / (n - 1);
      return design.bodyEnd * (.55 * t + .45 * (1 - Math.cos(Math.PI * t)) / 2 - .02 * Math.sin(TAU * t));
    });
    ss[0] = design.frontDome ? 0 : .0025;
    const rows: number[][] = [];
    for (const s of ss) {
      rows.push(columns(s).map((theta) => {
        const p = raw(s, theta);
        return mesh.vertex(p, design.paint(s, fold(theta), p), skin(s));
      }));
    }
    const m = rows[0].length;
    for (let j = 0; j < n - 1; j++) {
      for (let k = 0; k < m; k++) mesh.quad(rows[j][k], rows[j][(k + 1) % m], rows[j + 1][(k + 1) % m], rows[j + 1][k]);
    }
    // Snout: a point, or a domed face for broad blunt heads.
    const first = rows[0];
    if (design.frontDome) {
      let previous = first;
      for (const scale of [.66, .3]) {
        const ring = columns(0).map((theta) => {
          const edge = raw(0, theta);
          const p = new Vector3(edge.x * scale, center(0) + (edge.y - center(0)) * scale, z(0) + design.frontDome! * (1 - scale * scale));
          return mesh.vertex(p, design.paint(0, fold(theta), p), skin(0));
        });
        for (let k = 0; k < m; k++) mesh.quad(ring[k], ring[(k + 1) % m], previous[(k + 1) % m], previous[k]);
        previous = ring;
      }
      const tip = new Vector3(0, center(0), z(0) + design.frontDome);
      const c = mesh.vertex(tip, design.paint(0, Math.PI / 2, tip), skin(0));
      for (let k = 0; k < m; k++) mesh.tri(c, previous[(k + 1) % m], previous[k]);
    } else {
      const tip = new Vector3(0, center(0), z(0));
      const c = mesh.vertex(tip, design.paint(0, 0, tip), skin(0));
      for (let k = 0; k < m; k++) mesh.tri(c, first[(k + 1) % m], first[k]);
    }
    const last = rows[n - 1];
    const endPoint = new Vector3(0, center(design.bodyEnd), z(design.bodyEnd) - .004);
    const e = mesh.vertex(endPoint, design.paint(design.bodyEnd, Math.PI / 2, endPoint), skin(design.bodyEnd));
    for (let k = 0; k < m; k++) mesh.tri(e, last[k], last[(k + 1) % m]);
    mesh.end();
  }

  /**
   * A fin on the dorsal or ventral midline, outlined by its leading and trailing
   * edges as axial positions against height above (or below) the skin.
   */
  function midlineFin(options: {
    le: Points; te: Points; height: number; thickness: number; ventral?: boolean; bone?: string; stations?: number;
    color: (p: Vector3, v: number, u: number) => RGB; sink?: number;
  }) {
    const le = curve(options.le), te = curve(options.te);
    const sink = options.sink ?? .012;
    const sign = options.ventral ? -1 : 1;
    const at = (s: number, h: number) => new Vector3(0, (options.ventral ? yBottom(s) : yTop(s)) + sign * h, z(s));
    const height = (v: number) => -sink + v * (options.height + sink);
    fin(mesh, {
      stations: options.stations ?? 7,
      le: (v) => at(le(height(v)), height(v)),
      te: (v) => at(te(height(v)), height(v)),
      thickness: (v) => options.thickness * (1 - .75 * v),
      side: new Vector3(1, 0, 0),
      color: options.color,
      skin: (p, v) => {
        const base = skin(sOf(p.z));
        return options.bone ? blendSkins(base, { [options.bone]: 1 }, smoothstep(.12, .55, v)) : base;
      },
    });
    const baseS = (le(0) + te(0)) / 2;
    return { base: at(baseS, 0), baseS };
  }

  /**
   * A paired fin rooted on the flank at angle `theta`. The outline is drawn in
   * the fin plane: axial offset behind the root's leading edge against span.
   */
  function pairedFin(options: {
    rootS: number; theta: number; le: Points; te: Points; span: number; droop: number; thickness: number;
    bone?: (left: boolean) => string; color: (p: Vector3, v: number, u: number, left: boolean, face: number) => RGB; stations?: number;
    sweep?: number; sink?: number;
  }) {
    const le = curve(options.le), te = curve(options.te);
    const sink = options.sink ?? .015;
    const roots: Vector3[] = [];
    for (const left of [true, false]) {
      const side = left ? 1 : -1;
      const theta = side * options.theta;
      const origin = surface(options.rootS, theta, 0).addScaledVector(normal(options.rootS, theta), -sink);
      const out = new Vector3(side * Math.cos(options.droop), -Math.sin(options.droop), 0).normalize();
      const back = new Vector3(0, 0, -1).applyAxisAngle(new Vector3(0, 1, 0), -side * (options.sweep ?? 0));
      const at = (b: number) => origin.clone().addScaledVector(out, b);
      const span = (v: number) => v * (options.span + sink);
      fin(mesh, {
        stations: options.stations ?? 7,
        le: (v) => at(span(v)).addScaledVector(back, le(span(v))),
        te: (v) => at(span(v)).addScaledVector(back, te(span(v))),
        thickness: (v) => options.thickness * (1 - .78 * v),
        side: new Vector3(Math.sin(options.droop) * side, Math.cos(options.droop), 0),
        color: (p, v, u, face) => options.color(p, v, u, left, face),
        skin: (p, v) => {
          const base = skin(sOf(p.z));
          return options.bone ? blendSkins(base, { [options.bone(left)]: 1 }, smoothstep(.1, .5, v)) : base;
        },
      });
      roots.push(origin.clone().addScaledVector(back, (le(0) + te(0)) / 2).addScaledVector(out, sink));
    }
    return roots;
  }

  /**
   * The caudal fin as one fin running from the lower lobe tip to the upper lobe
   * tip. Leading and trailing edges are axial positions against height, so the
   * fork between the lobes falls out of the trailing edge curve.
   */
  function caudalFin(options: {
    le: Points; te: Points; low: number; high: number; thickness: (y: number) => number;
    upperPivot: number; lowerPivot: number; color: (p: Vector3, v: number, u: number) => RGB; stations?: number;
  }) {
    const le = curve(options.le), te = curve(options.te);
    const y = (v: number) => options.low + v * (options.high - options.low);
    const axis = center(tail);
    fin(mesh, {
      stations: options.stations ?? 16, rootPoint: true,
      le: (v) => new Vector3(0, y(v), z(le(y(v)))),
      te: (v) => new Vector3(0, y(v), z(te(y(v)))),
      thickness: (v) => options.thickness(y(v)),
      side: new Vector3(1, 0, 0),
      color: options.color,
      skin: (p) => {
        let weights = skin(sOf(p.z));
        weights = blendSkins(weights, { TailUpper: 1 }, smoothstep(options.upperPivot - .02, options.upperPivot + .07, p.y));
        return blendSkins(weights, { TailLower: 1 }, smoothstep(-(options.lowerPivot - .015), -(options.lowerPivot + .05), p.y));
      },
    });
    const pivot = (height: number) => new Vector3(0, height, z((le(height) + te(height)) / 2));
    return { upper: pivot(axis + options.upperPivot), lower: pivot(axis - options.lowerPivot) };
  }

  /** A ribbon decal along a centerline of [s, theta] points, lying just above the skin. */
  function ribbon(line: readonly (readonly [number, number])[], halfWidth: (t: number) => number, color: RGB, lift = .001) {
    mesh.begin();
    const ids: number[][] = [];
    line.forEach(([s, theta], i) => {
      const t = i / (line.length - 1);
      const [s0, t0] = line[Math.max(0, i - 1)], [s1, t1] = line[Math.min(line.length - 1, i + 1)];
      const tangent = raw(s1, t1).sub(raw(s0, t0)).normalize();
      const n = normal(s, theta);
      const across = n.clone().cross(tangent).normalize();
      const gs = raw(s + .002, theta).sub(raw(s - .002, theta)).divideScalar(.004);
      const gt = raw(s, theta + .01).sub(raw(s, theta - .01)).divideScalar(.02);
      const w = halfWidth(t);
      const ds = across.dot(gs) / gs.lengthSq() * w, dt = across.dot(gt) / gt.lengthSq() * w;
      ids.push([1, -1].map((sign) => {
        const ps = clamp(s + sign * ds, 0, design.bodyEnd), pt = theta + sign * dt;
        return mesh.vertex(surface(ps, pt, lift), color, skin(ps), normal(ps, pt));
      }));
    });
    for (let i = 0; i < ids.length - 1; i++) mesh.quad(ids[i][0], ids[i][1], ids[i + 1][1], ids[i + 1][0]);
    mesh.end({ closed: false, normals: false, outward: (i) => new Vector3(mesh.normals[i * 3], mesh.normals[i * 3 + 1], mesh.normals[i * 3 + 2]) });
  }

  /** A small round spot decal of world radius r centered at [s, theta]. */
  function spot(s: number, theta: number, r: number, color: RGB, squash = 1, lift = .001) {
    mesh.begin();
    const gs = raw(s + .002, theta).sub(raw(s - .002, theta)).length() / .004;
    const gt = raw(s, theta + .01).sub(raw(s, theta - .01)).length() / .02;
    const c = mesh.vertex(surface(s, theta, lift * 1.4), color, skin(s), normal(s, theta));
    const ring = Array.from({ length: 6 }, (_, i) => {
      const a = TAU * i / 6 + .3;
      const ps = s + Math.cos(a) * r * squash / gs, pt = theta + Math.sin(a) * r / gt;
      return mesh.vertex(surface(ps, pt, lift), color, skin(ps), normal(ps, pt));
    });
    for (let i = 0; i < 6; i++) mesh.tri(c, ring[i], ring[(i + 1) % 6]);
    mesh.end({ closed: false, normals: false, outward: (i) => new Vector3(mesh.normals[i * 3], mesh.normals[i * 3 + 1], mesh.normals[i * 3 + 2]) });
  }

  function eyes(options: { s: number; theta: number; radius: number; color: RGB; sink?: number }) {
    for (const side of [1, -1]) {
      const theta = side * options.theta;
      const n = normal(options.s, theta);
      const p = surface(options.s, theta, -(options.sink ?? .25) * options.radius);
      eye(mesh, p, n, options.radius, options.color, skin(options.s));
    }
  }

  function gills(options: { from: number; to: number; count: number; top: number; bottom: number; halfWidth: number; slant: number; color: RGB }) {
    for (const side of [1, -1]) {
      for (let i = 0; i < options.count; i++) {
        const s = options.from + (options.to - options.from) * i / Math.max(1, options.count - 1);
        const line = Array.from({ length: 6 }, (_, j) => {
          const t = j / 5;
          const theta = options.top + (options.bottom - options.top) * t;
          return [s + options.slant * (t - .5) - .004 * Math.sin(Math.PI * t), side * theta] as const;
        });
        ribbon(line, (t) => options.halfWidth * (.45 + .55 * Math.sin(Math.PI * t)), options.color);
      }
    }
  }

  /** Spine bones sit on the body axis at the rig's joints; fin bones sit at their fin bases. */
  function spineBones() {
    const axis = (s: number) => new Vector3(0, center(s), z(s));
    bones.push(
      { name: 'Root', parent: null, position: axis(root) },
      { name: 'Head', parent: 'Root', position: axis(root) },
      { name: 'Spine1', parent: 'Root', position: axis(root) },
      { name: 'Spine2', parent: 'Spine1', position: axis(spine2) },
      { name: 'RearBody', parent: 'Spine2', position: axis(rearBody) },
      { name: 'TailBase', parent: 'RearBody', position: axis(tailBase) },
      { name: 'Tail', parent: 'TailBase', position: axis(tail) },
    );
  }

  return {
    design, mesh, bones, raw, surface, normal, skin, z, sOf, width, top, bottom, center, yTop, yBottom,
    body, midlineFin, pairedFin, caudalFin, ribbon, spot, eyes, gills, spineBones,
  };
}
