/**
 * Cephalopods. Octopuses are drawn as a soft body (mantle, head, eye turret and the webbed crown
 * melted together) with eight tapering arms laid along curves, suckers showing on the underside;
 * cuttlefish and squid as a side-view mantle with a fin along its edge and a cone of arms.
 */
import { add, centroidOf, clamp, type Ctrl, inside, lerp, mul, norm, offsetLine, perp, type Pt, resample, rng, spline, sub } from './kit';
import { discRings } from './ray';
import { type Lobe, softUnion } from './soft';
import { at, contours, outlineOf, type Strip, trunk } from './side';
import { emptyGeom, type Eye, type Fill, type Line, type Paint, type Part, type PlateGeom } from './types';

export interface ArmSpec {
  path: Ctrl[];
  /** Half-width at the base and at the tip. */
  w: [number, number];
  /** The side the suckers show on (1: left of the arm's direction, -1: right), 0 for none. */
  suckers?: 1 | -1 | 0;
  /** Two staggered rows seen face-on, for an arm twisted to show its underside. */
  face?: boolean;
  /** Behind the body. */
  far?: boolean;
  paint?: Paint;
  /** Where the suckers start, as a fraction along the arm. */
  from?: number;
}

export interface Arm {
  center: Pt[];
  width: (t: number) => number;
  poly: Pt[];
  /** A point a fraction t along the arm, f across it (-1 and 1 are its two edges). */
  at: (t: number, f: number) => Pt;
  /** The patch of arm between t0 and t1, f0 to f1 across it. */
  band: (t0: number, t1: number, f0?: number, f1?: number) => Pt[];
  spec: ArmSpec;
}

export function makeArm(spec: ArmSpec): Arm {
  const center = resample(spline(spec.path, false), 90);
  const [w0, w1] = spec.w;
  const width = (t: number) => w1 + (w0 - w1) * (1 - t) ** 1.15;
  const n = center.length;
  const idx = (t: number) => Math.round(clamp(t, 0, 1) * (n - 1));
  const nrm = (t: number) => perp(norm(sub(center[Math.min(n - 1, idx(t) + 1)], center[Math.max(0, idx(t) - 1)])));
  const pt = (t: number, f: number): Pt => add(center[idx(t)], mul(nrm(t), f * width(t)));
  const band = (t0: number, t1: number, f0 = -1, f1 = 1) => {
    const ts = Array.from({ length: 8 }, (_, k) => t0 + ((t1 - t0) * k) / 7);
    return [...ts.map((t) => pt(t, f0)), ...ts.reverse().map((t) => pt(t, f1))];
  };
  // A rounded tip.
  const tipDir = norm(sub(center[n - 1], center[n - 3]));
  const poly = [...offsetLine(center, (t) => width(t)), add(center[n - 1], mul(tipDir, w1 * 0.9)), ...offsetLine(center, (t) => -width(t)).reverse()];
  return { center, width, poly, at: pt, band, spec };
}

/** Suckers along an arm: a row of small rings on its underside, or two staggered rows face-on. */
export function suckers(arm: Arm, paint: Paint, size = 1, gap = 1): Fill[] {
  const side = arm.spec.suckers ?? 0;
  if (!side && !arm.spec.face) return [];
  const out: Fill[] = [];
  const len = segLength(arm.center);
  let t = arm.spec.from ?? 0.12;
  let k = 0;
  while (t < 0.96) {
    const w = arm.width(t);
    const f = arm.spec.face ? (k % 2 ? 0.42 : -0.42) : side * 0.58;
    const r = w * (arm.spec.face ? 0.36 : 0.34) * size;
    const c = arm.at(t, f);
    out.push({ poly: ellipseAt(c, r, r * (arm.spec.face ? 1 : 0.85)), paint, edge: 0.55 });
    if (r > 0.45) out.push({ poly: ellipseAt(c, r * 0.38, r * 0.32), paint: 'dark', o: 0.55 });
    t += (r * 2.1 * gap) / len / (arm.spec.face ? 1.6 : 1);
    k++;
  }
  return out;
}

const segLength = (pts: Pt[]) => {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return s;
};

const ellipseAt = (c: Pt, rx: number, ry: number): Pt[] =>
  Array.from({ length: 10 }, (_, i) => [c[0] + Math.cos((i / 10) * Math.PI * 2) * rx, c[1] + Math.sin((i / 10) * Math.PI * 2) * ry] as Pt);

/** Shading cut along an arm on its underside, heavier towards the base. */
function armShade(arm: Arm, far: boolean): Line[] {
  const side = arm.spec.suckers || 1;
  const lines: Line[] = [];
  for (const [f, w] of [
    [0.72, 1.3],
    [0.45, 0.8],
  ] as const) {
    const pts = arm.center.map((_, i) => arm.at(i / (arm.center.length - 1), side * f));
    lines.push({ pts: pts.slice(3, -4), w: w * (far ? 1.2 : 1), taper: 'both' });
  }
  if (far) lines.push({ pts: arm.center.slice(3, -6), w: 0.9, o: 0.5, taper: 'both' });
  return lines;
}

/** An arm drawn as its own shape: shading along the underside, suckers and any markings. */
export function armPart(arm: Arm, sucker: Paint = 'light', size = 1, gap = 1, marks: Fill[] = []): Part {
  return { poly: arm.poly, paint: arm.spec.paint ?? 'back', lines: armShade(arm, !!arm.spec.far), edge: 0.8, marks: [...marks, ...suckers(arm, sucker, size, gap)] };
}

/** Lobes along an ellipse's edge, for knobbly skin (papillae) on a mantle. */
export function bumps(c: Pt, rx: number, ry: number, rot: number, from: number, to: number, n: number, r: number): Lobe[] {
  const a = (rot * Math.PI) / 180;
  return Array.from({ length: n }, (_, i) => {
    const u = from + ((to - from) * i) / Math.max(1, n - 1);
    const t = (u * Math.PI) / 180;
    const x = Math.cos(t) * rx;
    const y = Math.sin(t) * ry;
    return { c: [c[0] + x * Math.cos(a) - y * Math.sin(a), c[1] + x * Math.sin(a) + y * Math.cos(a)] as Pt, rx: r, ry: r * 0.8, rot: rot + u };
  });
}

export interface OctoCtx {
  body: Pt[];
  arms: Arm[];
  rand: () => number;
  /** Fills kept to the body but not hidden under the arms. */
  inBody: (p: Pt) => boolean;
}

export interface OctopusSpec {
  /** Mantle, head, eye turret and crown, melted together. */
  lobes: Lobe[];
  soft?: number;
  arms: ArmSpec[];
  /** Where the arms meet: covered over so their bases melt into the crown. */
  crown: Lobe;
  eye: Eye & { horn?: number };
  /** Engraving rings that follow the outline, closing in on `hub`. */
  hub: Pt;
  rings?: number[];
  sucker?: { paint?: Paint; size?: number; gap?: number };
  /** How much of each arm's base melts into the body as webbing. */
  web?: number;
  extra?: (c: OctoCtx) => { marks?: Fill[]; lines?: Line[]; near?: Part[]; far?: Part[]; tint?: Fill[]; arms?: (arm: Arm, i: number) => Fill[]; cover?: Fill[] };
  seed?: number;
}

export function octopus(spec: OctopusSpec): PlateGeom {
  const g = emptyGeom();
  const rand = rng(spec.seed ?? 5);
  const arms = spec.arms.map(makeArm);
  const web = spec.web ?? 0.16;
  const webLobes: Lobe[] = arms.flatMap((a) =>
    [0.04, web * 0.6, web].map((t) => {
      const c = a.at(t, 0);
      const d = norm(sub(a.at(t + 0.02, 0), a.at(Math.max(0, t - 0.02), 0)));
      return { c, rx: a.width(t) * 1.7, ry: a.width(t) * 1.25, rot: (Math.atan2(d[1], d[0]) * 180) / Math.PI };
    }),
  );
  const body = softUnion([...spec.lobes, spec.crown, ...webLobes], spec.soft ?? 0.22, 0.35);
  g.body = body;
  g.trunk = body;
  const ctx: OctoCtx = { body, arms, rand, inBody: (p) => inside(p, body) };
  const extra = spec.extra?.(ctx);

  const sp = spec.sucker?.paint ?? 'light';
  for (const [i, arm] of arms.entries()) {
    const part = armPart(arm, sp, spec.sucker?.size, spec.sucker?.gap, extra?.arms?.(arm, i));
    (arm.spec.far ? g.far : g.near).push(part);
  }
  // The crown laid over the near arms' bases.
  const cover = softUnion([spec.crown], 0.2, 0.35);
  const covered = (extra?.marks ?? []).filter((m) => inside(centroidOf(m.poly), cover));
  g.near.push({ poly: cover, paint: 'back', lines: [], edge: 0, marks: [...covered, ...(extra?.cover ?? [])] });

  g.engraving.push(...discRings(body, spec.hub, spec.rings ?? [0.9, 0.78, 0.66, 0.54, 0.42], 1.1));

  const e = spec.eye;
  if (e.horn) {
    const top = add(e.c, [0, -e.r * 1.1]);
    g.near.push({ poly: spline([add(top, [-e.r * 0.6, 0.4]), add(top, [-e.r * 0.1, -e.horn * 0.6]), [top[0] + e.r * 0.2, top[1] - e.horn, 1], add(top, [e.r * 0.5, 0.2])], true), paint: 'back', lines: [], edge: 0.7 });
  }
  // A lid line over the eye.
  g.lines.push({ pts: spline([add(e.c, [-e.r * 1.25, e.r * 0.1]), add(e.c, [0, -e.r * 1.35]), add(e.c, [e.r * 1.25, e.r * 0.1])], false), w: 1.1, taper: 'both' });
  g.eyes.push({ ...e, pupil: e.pupil ?? 'bar' });

  if (extra) {
    g.marks.push(...(extra.marks ?? []).map((m) => ({ ...m, clip: m.clip ?? ('trunk' as const) })));
    g.lines.push(...(extra.lines ?? []));
    g.near.push(...(extra.near ?? []));
    g.far.unshift(...(extra.far ?? []));
    g.tint.push(...(extra.tint ?? []));
  }
  return g;
}

export interface CuttleSpec {
  /** The mantle and head in side view, the arms' base at `tip`. */
  tip: Pt;
  top: Ctrl[];
  bot: Ctrl[];
  blunt?: number;
  /** A fin skirt along the bottom (and top) edge, from t0 to t1 along the body, height h(t). */
  fin: { t0: number; t1: number; h: (t: number) => number; top?: boolean; paint?: Paint; waves?: number };
  arms: ArmSpec[];
  eye: Eye;
  extra?: (c: { s: Strip; body: Pt[]; arms: Arm[]; rand: () => number; fin: Pt[] }) => { marks?: Fill[]; lines?: Line[]; near?: Part[]; far?: Part[]; tint?: Fill[]; fin?: Fill[]; arms?: (arm: Arm, i: number) => Fill[] };
  sucker?: Paint;
  seed?: number;
}

export function cuttle(spec: CuttleSpec): PlateGeom {
  const g = emptyGeom();
  const rand = rng(spec.seed ?? 7);
  const s = trunk({ tip: spec.tip, top: spec.top, bot: spec.bot, blunt: spec.blunt ?? 0.6 });
  const body = outlineOf(s);
  g.body = body;
  g.trunk = body;
  const arms = spec.arms.map(makeArm);
  // The fin: a rippling skirt outside the edge, behind the body.
  const finOf = (side: 'bot' | 'top') => {
    const ts = Array.from({ length: 70 }, (_, k) => spec.fin.t0 + ((spec.fin.t1 - spec.fin.t0) * k) / 69);
    const f = side === 'bot' ? 0.86 : 0.14;
    const out = side === 'bot' ? 1 : -1;
    const waves = spec.fin.waves ?? 7;
    const edge = ts.map((t, k) => {
      const base = at(s, t, side === 'bot' ? 1 : 0);
      const u = k / 69;
      return add(base, [0, out * spec.fin.h(u) * (0.8 + 0.2 * Math.sin(u * waves * Math.PI * 2))]);
    });
    const inner = ts.map((t) => at(s, t, f));
    const base = ts.map((t) => at(s, t, side === 'bot' ? 1 : 0));
    return { poly: [...inner, ...edge.slice().reverse()], edge, base };
  };
  const finB = finOf('bot');
  const finLinesOf = (fin: { edge: Pt[]; base: Pt[] }) =>
    fin.edge.filter((_, k) => k % 3 === 1).map((p, i) => ({ pts: [fin.base[i * 3 + 1], lerp(fin.base[i * 3 + 1], p, 0.92)], w: 0.5, o: 0.5, taper: 'end' as const }));
  const extra = spec.extra?.({ s, body, arms, rand, fin: finB.poly });
  g.far.push({ poly: finB.poly, paint: spec.fin.paint ?? 'fin', lines: finLinesOf(finB), edge: 0.7, marks: extra?.fin });
  if (spec.fin.top) {
    const finT = finOf('top');
    g.far.push({ poly: finT.poly, paint: spec.fin.paint ?? 'fin', lines: finLinesOf(finT), edge: 0.7, marks: extra?.fin });
  }
  for (const [i, arm] of arms.entries()) {
    const part: Part = { poly: arm.poly, paint: arm.spec.paint ?? 'back', lines: armShade(arm, !!arm.spec.far), edge: 0.75, marks: [...(extra?.arms?.(arm, i) ?? []), ...suckers(arm, spec.sucker ?? 'light', 0.9)] };
    (arm.spec.far ? g.far : g.near).push(part);
  }
  g.engraving = contours(s, { top: [0.04, 0.1, 0.18], bot: [0.66, 0.76, 0.84, 0.92] });
  g.heavy.push(s.bot);
  g.lines.push({ pts: spline([add(spec.eye.c, [-spec.eye.r * 1.3, spec.eye.r * 0.2]), add(spec.eye.c, [0, -spec.eye.r * 1.4]), add(spec.eye.c, [spec.eye.r * 1.3, spec.eye.r * 0.2])], false), w: 1.1, taper: 'both' });
  g.eyes.push({ ...spec.eye, pupil: spec.eye.pupil ?? 'w' });
  if (extra) {
    g.marks.push(...(extra.marks ?? []));
    g.lines.push(...(extra.lines ?? []));
    g.near.push(...(extra.near ?? []));
    g.far.push(...(extra.far ?? []));
    g.tint.push(...(extra.tint ?? []));
  }
  return g;
}
