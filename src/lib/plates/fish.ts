/**
 * Bony fish, side on, facing left, in units of 1% of total length (snout at x = 0). Fins are built
 * from their rays: spines with the membrane notched between them, soft rays under a smooth edge,
 * tails of every shape fanned from the tail stock. Scales are engraved as rows of small arcs.
 */
import { add, clamp, type Ctrl, dist, lerp, mul, norm, perp, type Pt, resample, rng, spline, sub } from './kit';
import { at, atX, contours, type FinShape, lineAlong, outlineOf, outsideTrunk, region, spliceFins, type Strip, tAtX, trunk } from './side';
import { emptyGeom, type Eye, type Fill, type Line, type Paint, type Part, type PlateGeom } from './types';

export interface RayedFinSpec {
  /** x of the first and last ray's base. */
  from: number;
  to: number;
  /** Ray lengths along the fin (u from 0 at the front to 1 at the back): a number, points [u, h] to interpolate, or a function. */
  h: number | [number, number][] | ((u: number) => number);
  /** Spines at the front (stiff rays with the membrane notched between them). */
  spines?: number;
  /** Soft rays after the spines. */
  rays?: number;
  /** How deep the membrane dips between spines (0 to 1 of their length). */
  notch?: number;
  /** Lean of the rays from upright, degrees backwards, at the front and back. */
  rake?: [number, number];
  /** Smooth the edge over the soft rays (otherwise each ray tip is a point). */
  smooth?: boolean;
  paint?: Paint;
}

export interface RayedFin extends FinShape {
  rays: Line[];
  tips: Pt[];
  bases: Pt[];
}

const heightAt = (h: RayedFinSpec['h'], u: number): number => {
  if (typeof h === 'number') return h;
  if (typeof h === 'function') return h(u);
  for (let i = 1; i < h.length; i++) {
    if (u <= h[i][0]) {
      const [u0, h0] = h[i - 1];
      const [u1, h1] = h[i];
      const k = (u - u0) / (u1 - u0 || 1);
      // Smoothstep between the given points.
      return h0 + (h1 - h0) * (k * k * (3 - 2 * k));
    }
  }
  return h[h.length - 1][1];
};

/** A fin of rays standing on a body edge: dir -1 for the back (up), 1 for the belly (down). */
export function rayedFin(edge: Pt[], spec: RayedFinSpec, dir: -1 | 1): RayedFin {
  const { from, to, spines = 0, rays = 8, notch = 0.35, rake = [20, 50], smooth = true } = spec;
  const n = spines + rays;
  const bases: Pt[] = [];
  const tips: Pt[] = [];
  const yAtX = (x: number) => {
    for (let i = 1; i < edge.length; i++) if (edge[i][0] >= x) return lerp(edge[i - 1], edge[i], (x - edge[i - 1][0]) / (edge[i][0] - edge[i - 1][0] || 1))[1];
    return edge[edge.length - 1][1];
  };
  for (let i = 0; i < n; i++) {
    const u = n === 1 ? 0 : i / (n - 1);
    const x = from + (to - from) * u;
    const b: Pt = [x, yAtX(x)];
    const a = ((rake[0] + (rake[1] - rake[0]) * u) * Math.PI) / 180;
    const d: Pt = [Math.sin(a), dir * Math.cos(a)];
    bases.push(b);
    tips.push(add(b, mul(d, heightAt(spec.h, u))));
  }
  const ctrl: Ctrl[] = [bases[0]];
  for (let i = 0; i < n; i++) {
    const spine = i < spines;
    ctrl.push(spine || !smooth ? [tips[i][0], tips[i][1], 1] : tips[i]);
    if (spine && i < n - 1) {
      // The membrane between this spine and the next dips towards the body.
      const mb = lerp(bases[i], bases[i + 1], 0.5);
      const mt = lerp(tips[i], tips[i + 1], 0.5);
      ctrl.push(lerp(mb, mt, 1 - notch));
    }
  }
  ctrl.push([bases[n - 1][0], bases[n - 1][1], 1]);
  const outline = spline(ctrl, false, 1, 10);
  const dip = -dir * 3;
  const poly = [...outline, [bases[n - 1][0], bases[n - 1][1] + dip] as Pt, [bases[0][0], bases[0][1] + dip] as Pt];
  const lines: Line[] = [];
  for (let i = 0; i < n; i++) {
    const spine = i < spines;
    lines.push({ pts: [bases[i], lerp(bases[i], tips[i], spine ? 1 : 0.94)], w: spine ? 1 : 0.6, taper: spine ? undefined : 'end' });
  }
  // Leading and trailing edges (for markings that follow the fin).
  let ai = 0;
  outline.forEach((p, i) => {
    if (dir * (p[1] - yAtX(p[0])) > dir * (outline[ai][1] - yAtX(outline[ai][0]))) ai = i;
  });
  return { outline, poly, le: outline.slice(0, ai + 1), te: outline.slice(ai).reverse(), apex: outline[ai], rays: lines, tips, bases };
}

export type TailType = 'forked' | 'lunate' | 'emarginate' | 'truncate' | 'rounded' | 'lyre' | 'pointed' | 'scalloped' | 'clavus' | 'heart';

export interface BonyCaudalSpec {
  type: TailType;
  /** Length behind the tail stock. */
  len: number;
  /** Half the span at the lobe tips. */
  h: number;
  /** For forked tails: how far back the fork is (0 at the stock, 1 at the tips). */
  fork?: number;
  rays?: number;
  /** For lyre tails: extra length of the filaments. */
  filament?: number;
  paint?: Paint;
}

/** A tail fanned out behind the tail stock, rays running from the stock to the trailing edge. */
export function bonyCaudal(s: Strip, c: BonyCaudalSpec): FinShape & { rays: Line[]; trailing: Pt[] } {
  const top = s.top[s.top.length - 1];
  const bot = s.bot[s.bot.length - 1];
  const x0 = top[0];
  const cy = (top[1] + bot[1]) / 2;
  const hp = (bot[1] - top[1]) / 2;
  const { type, len: L, h: H, fork = 0.55, rays = 14, filament = 0 } = c;
  const P = (x: number, y: number): Pt => [x0 + x, cy + y];
  let edge: Ctrl[];
  switch (type) {
    case 'rounded':
      edge = [P(0.62 * L, -0.92 * H), P(0.92 * L, -0.55 * H), P(L, 0), P(0.92 * L, 0.55 * H), P(0.62 * L, 0.92 * H)];
      break;
    case 'clavus': {
      // The ocean sunfish's rudder: a rounded frill with a scalloped edge.
      edge = [];
      const lobes = 9;
      for (let k = 0; k <= lobes * 2; k++) {
        const a = -Math.PI / 2 + (Math.PI * k) / (lobes * 2);
        const r = k % 2 ? 0.86 : 1;
        edge.push([x0 + Math.cos(a) * L * r, cy + Math.sin(a) * H * r, ...(k % 2 ? [] : [1])] as Ctrl);
      }
      break;
    }
    case 'heart':
      // Deeply notched, with big rounded lobes (garibaldi).
      edge = [P(0.78 * L, -H), P(L, -0.72 * H), P(0.94 * L, -0.32 * H), [x0 + fork * L, cy, 1], P(0.94 * L, 0.32 * H), P(L, 0.72 * H), P(0.78 * L, H)];
      break;
    case 'truncate':
      edge = [P(0.85 * L, -H), [x0 + L, cy - H * 0.97, 1], P(L * 1.005, 0), [x0 + L, cy + H * 0.97, 1], P(0.85 * L, H)];
      break;
    case 'emarginate':
      edge = [[x0 + L, cy - H, 1], P(0.9 * L, -0.4 * H), P(0.86 * L, 0), P(0.9 * L, 0.4 * H), [x0 + L, cy + H, 1]];
      break;
    case 'pointed':
      edge = [P(0.5 * L, -0.75 * H), [x0 + L, cy, 1], P(0.5 * L, 0.75 * H)];
      break;
    case 'lunate':
      edge = [[x0 + L, cy - H, 1], P(0.62 * L, -0.42 * H), [x0 + fork * L, cy, 1], P(0.62 * L, 0.42 * H), [x0 + L, cy + H, 1]];
      break;
    case 'lyre':
      edge = [[x0 + L + filament, cy - H - filament * 0.25, 1], P(L * 0.86, -H * 0.72), P(L * 0.62, -H * 0.3), [x0 + fork * L, cy, 1], P(L * 0.62, H * 0.3), P(L * 0.86, H * 0.72), [x0 + L + filament, cy + H + filament * 0.25, 1]];
      break;
    case 'scalloped':
      edge = [[x0 + L, cy - H, 1], P(0.82 * L, -0.62 * H), P(0.8 * L, -0.42 * H), P(0.66 * L, -0.12 * H), [x0 + fork * L, cy, 1], P(0.66 * L, 0.12 * H), P(0.8 * L, 0.42 * H), P(0.82 * L, 0.62 * H), [x0 + L, cy + H, 1]];
      break;
    case 'forked':
    default:
      edge = [[x0 + L, cy - H, 1], P(0.78 * L, -0.5 * H), [x0 + fork * L, cy, 1], P(0.78 * L, 0.5 * H), [x0 + L, cy + H, 1]];
  }
  // Leading edges of the lobes bulge a little as they leave the stock.
  const lead = (sign: -1 | 1): Ctrl => P(L * 0.42, sign * (hp + (H - hp) * 0.58));
  // The clavus rises straight from the stock's ends: a leading bulge there would loop out past them.
  const ctrl: Ctrl[] = type === 'clavus' ? [top, ...edge, bot] : [top, lead(-1), ...edge, lead(1), bot];
  const outline = spline(ctrl, false, 1, 10, { start: norm([1, -(H - hp) / L]), end: norm([-1, -(H - hp) / L]) });
  // The trailing edge: from the upper tip round to the lower one.
  const near = (p: Pt) => outline.reduce((bi, q, i) => (dist(q, p) < dist(outline[bi], p) ? i : bi), 0);
  const first = edge[0];
  const last = edge[edge.length - 1];
  const i0 = near([first[0], first[1]]);
  const i1 = near([last[0], last[1]]);
  const trailing = resample(outline.slice(i0, i1 + 1), rays);
  const raysOut: Line[] = trailing
    .map((t, i) => {
      const b = lerp(top, bot, 0.08 + (0.84 * i) / (rays - 1));
      return { pts: [add(b, [-1.2, 0]), lerp(b, t, 0.96)], w: 0.6, taper: 'end' as const };
    })
    // On a rounded clavus the end rays are chords that leave the fin; they stick out as ticks.
    .filter((_, i) => type !== 'clavus' || (i > 0 && i < rays - 1));
  const poly = [...outline, add(bot, [-3, 0]), add(top, [-3, 0])];
  const apex = outline[near([first[0], first[1]])];
  return { outline, poly, le: outline.slice(0, i0 + 1), te: outline.slice(i0, Math.round((i0 + i1) / 2)).reverse(), apex, rays: raysOut, trailing };
}

export interface FanSpec {
  /** Where the fin's base starts, as [x, depth fraction]. */
  at: [number, number];
  /** Base length (it runs down and back a little). */
  base: number;
  /** Ray lengths across the fan, from the top ray to the bottom one. */
  h: number | [number, number][] | ((u: number) => number);
  /** Angles of the top and bottom rays (degrees below horizontal, pointing back). */
  angles: [number, number];
  rays?: number;
  smooth?: boolean;
  /** Membrane dipping between the ray tips (lionfish feathers), 0 to 1. */
  notch?: number;
  paint?: Paint;
}

/** A paired fin as a fan of rays from a short base on the flank (or under the belly). */
export function fanFin(s: Strip, f: FanSpec): Part & { shape: FinShape; tips: Pt[] } {
  const { at: [x, fr], base, h, angles, rays = 10, smooth = true, notch = 0, paint = 'fin' } = f;
  const b0 = atX(s, x, fr);
  const b1 = add(b0, [base * 0.35, base * 0.94]);
  const tips: Pt[] = [];
  const bases: Pt[] = [];
  for (let i = 0; i < rays; i++) {
    const u = i / (rays - 1);
    const b = lerp(b0, b1, u);
    const a = ((angles[0] + (angles[1] - angles[0]) * u) * Math.PI) / 180;
    bases.push(b);
    tips.push(add(b, [Math.cos(a) * heightAt(h, u), Math.sin(a) * heightAt(h, u)]));
  }
  const tipCtrl: Ctrl[] = [];
  tips.forEach((t, i) => {
    tipCtrl.push(notch || !(smooth || i === 0 || i === rays - 1) ? [t[0], t[1], 1] : t);
    if (notch && i < rays - 1) tipCtrl.push(lerp(lerp(bases[i], bases[i + 1], 0.5), lerp(t, tips[i + 1], 0.5), 1 - notch));
  });
  const ctrl: Ctrl[] = [[b0[0], b0[1], 1], ...tipCtrl, [b1[0], b1[1], 1]];
  const outline = spline(ctrl, true, 0.85, 8);
  const lines: Line[] = tips.map((t, i) => ({ pts: [bases[i], lerp(bases[i], t, 0.93)], w: 0.7, taper: 'end' as const }));
  return { poly: outline, paint, lines, shape: { outline, poly: outline, le: [b0, tips[0]], te: [b1, tips[rays - 1]], apex: tips[0] }, tips };
}

export interface FishCtx {
  s: Strip;
  trunk: Pt[];
  dorsal: RayedFin[];
  anal: RayedFin[];
  caudal: FinShape & { rays: Line[]; trailing: Pt[] };
  pectoral?: Part & { shape: FinShape; tips: Pt[] };
  pelvic?: Part & { shape: FinShape; tips: Pt[] };
  rand: () => number;
  X: (x: number) => number;
}

export interface FishSpec {
  tip: Pt;
  top: Ctrl[];
  bot: Ctrl[];
  blunt?: number;
  noseTilt?: number;
  dorsal?: RayedFinSpec[];
  anal?: RayedFinSpec[];
  caudal: BonyCaudalSpec;
  pectoral?: FanSpec;
  pelvic?: FanSpec;
  eye: { x: number; f: number; r: number; iris?: Paint; ring?: boolean; pupil?: Eye['pupil'] };
  /** The gill cover's edge: where it is at mid-depth, and how far it bows back. */
  gill?: { x: number; bow?: number; f0?: number; f1?: number; preopercle?: boolean };
  /** The mouth line, as [x, depth] points. */
  mouth?: [number, number][];
  /** Lips: a thickness, drawn along the mouth line. */
  lips?: number;
  /** Colour of the lips (default: the body's). */
  lipPaint?: Paint;
  /** Weight of the mouth line (default 1.3: big-mouthed fish want a heavier one). */
  mouthW?: number;
  /** Rows of scales (0 or absent: smooth skin). */
  scales?: number;
  /** Scale columns per row (defaults to match the rows). */
  scaleCols?: number;
  /** The lateral line's depth along the body (a number, a function of t, or false for none). */
  lateral?: number | ((t: number) => number) | false;
  belly?: number | ((t: number) => number);
  softBelly?: boolean;
  /** Fewer, lighter engraving lines on scaled fish. */
  engraving?: 'scaled' | 'smooth' | 'none';
  extra?: (c: FishCtx) => { marks?: Fill[]; tint?: Fill[]; lines?: Line[]; near?: Part[]; far?: Part[]; median?: { part: 'dorsal' | 'anal' | 'caudal' | 'pectoral' | 'pelvic'; index?: number; marks: Fill[] }[] };
  seed?: number;
}

export function fish(spec: FishSpec): PlateGeom {
  const g = emptyGeom();
  const s = trunk({ tip: spec.tip, top: spec.top, bot: spec.bot, blunt: spec.blunt ?? 0.6, noseTilt: spec.noseTilt });
  const trunkPoly = outlineOf(s);
  const X = (x: number) => tAtX(s, x);
  const dorsal = (spec.dorsal ?? []).map((d) => rayedFin(s.top, d, -1));
  const anal = (spec.anal ?? []).map((d) => rayedFin(s.bot, d, 1));
  const cd = bonyCaudal(s, spec.caudal);
  const topEdge = spliceFins(s.top, dorsal);
  const botEdge = spliceFins(s.bot, anal);
  g.body = [...topEdge, ...cd.outline.slice(1, -1), ...botEdge.reverse()];
  g.trunk = trunkPoly;
  const rand = rng(spec.seed ?? 5);

  const medPart = (f: RayedFin, paint: Paint = 'fin'): Part => ({ poly: f.poly, paint, lines: outsideTrunk(f.rays, trunkPoly) });
  const dParts = dorsal.map((f, i) => medPart(f, spec.dorsal![i].paint));
  const aParts = anal.map((f, i) => medPart(f, spec.anal![i].paint));
  const cPart: Part = { poly: cd.poly, paint: spec.caudal.paint ?? 'fin', lines: outsideTrunk(cd.rays, trunkPoly) };
  g.median = [...dParts, ...aParts, cPart];

  const belly = spec.belly ?? 0.62;
  if (spec.softBelly !== false) g.tint.push({ poly: region(s, 0, 1, typeof belly === 'number' ? belly - 0.1 : (t) => belly(t) - 0.1, 1.02), paint: 'belly', o: 0.45, clip: 'trunk' });
  g.tint.push({ poly: region(s, 0, 1, belly, 1.02), paint: 'belly', clip: 'trunk' });
  g.tint.push({ poly: region(s, 0, 1, -0.02, 0.16), paint: 'dark', o: 0.12, clip: 'trunk' });

  const mode = spec.engraving ?? (spec.scales ? 'scaled' : 'smooth');
  if (mode === 'scaled') g.engraving = contours(s, { top: [0.03, 0.07, 0.115], bot: [0.84, 0.9, 0.95], weight: 0.9 });
  else if (mode === 'smooth') g.engraving = contours(s);

  // Gill cover: its rear edge bowing back, and the preopercle inside it.
  if (spec.gill) {
    const { x, bow = 2.2, f0 = 0.1, f1 = 0.92, preopercle = true } = spec.gill;
    const op = spline([atX(s, x - bow * 0.5, f0), atX(s, x + bow * 0.6, (f0 + 0.5) / 2 + 0.1), atX(s, x + bow * 0.55, 0.62), atX(s, x - bow * 0.1, f1)], false);
    g.lines.push({ pts: op, w: 1.2 }, { pts: op.map(([px, py]) => [px + 0.5, py] as Pt), w: 0.55, o: 0.5, detail: true });
    if (preopercle) g.lines.push({ pts: spline([atX(s, x - bow * 1.8, f0 + 0.18), atX(s, x - bow * 1.2, 0.6), atX(s, x - bow * 1.9, f1 - 0.02)], false), w: 0.7, o: 0.8 });
  }
  // Scales: rows of small arcs, each bowed back towards the tail.
  if (spec.scales) {
    const rows = spec.scales;
    const gx = spec.gill?.x ?? 22;
    const t0 = X(gx + 1.5);
    const cols = spec.scaleCols ?? Math.round(rows * 2.6);
    for (let r = 0; r < rows; r++) {
      const f = 0.04 + (0.92 * (r + 0.5)) / rows;
      for (let k = 0; k < cols; k++) {
        const t = t0 + (1 - t0) * ((k + (r % 2) * 0.5) / cols);
        if (t > 0.995) continue;
        const c0 = at(s, t, f);
        const up = at(s, t, f - 0.5 / rows);
        const dn = at(s, t, f + 0.5 / rows);
        const dx = (at(s, Math.min(1, t + 0.5 / cols), f)[0] - c0[0]) * 0.9;
        const arc = spline([up, add(c0, [dx, 0]), dn], false, 1, 4);
        g.engraving.push({ pts: arc, w: 0.55, o: 0.5, taper: 'both', detail: rows > 14 });
      }
    }
  }
  if (spec.lateral !== false && spec.lateral != null) {
    const ll = spec.lateral;
    g.lines.push({ pts: lineAlong(s, ll, X((spec.gill?.x ?? 20) + 1), 0.99), w: 0.8, o: 0.8, taper: 'both' });
  }
  const pectoral = spec.pectoral && fanFin(s, spec.pectoral);
  const pelvic = spec.pelvic && fanFin(s, spec.pelvic);
  // The pelvic fin sits below and behind the pectoral, so it's drawn first.
  if (pelvic) g.near.push(pelvic);
  if (pectoral) g.near.push(pectoral);
  if (spec.mouth) {
    const m = spline(spec.mouth.map(([x, f]) => atX(s, x, f)), false);
    g.lines.push({ pts: m, w: spec.mouthW ?? 1.3 });
    if (spec.lips) {
      const off = spec.lips;
      const lip = spec.lipPaint ?? 'back';
      g.marks.push({ poly: [...m, ...m.slice().reverse().map(([x, y], i, arr) => [x + off * 0.2, y - off * Math.sin((Math.PI * i) / (arr.length - 1 || 1))] as Pt)], paint: lip, edge: 0.8 });
      g.marks.push({ poly: [...m, ...m.slice().reverse().map(([x, y], i, arr) => [x + off * 0.2, y + off * Math.sin((Math.PI * i) / (arr.length - 1 || 1))] as Pt)], paint: lip, edge: 0.8 });
    }
  }
  const { x: ex, f: ef, r: er, iris = '#C9A54A', ring, pupil } = spec.eye;
  g.eyes.push({ c: atX(s, ex, ef), r: er, iris, ring, pupil });
  g.heavy.push(s.bot);

  const ctx: FishCtx = {
    s,
    trunk: trunkPoly,
    dorsal,
    anal,
    caudal: cd,
    pectoral,
    pelvic,
    rand,
    X,
  };
  const extra = spec.extra?.(ctx);
  if (extra) {
    g.marks.push(...(extra.marks ?? []));
    g.tint.push(...(extra.tint ?? []));
    g.lines.push(...(extra.lines ?? []));
    g.near.push(...(extra.near ?? []));
    g.far.push(...(extra.far ?? []));
    for (const m of extra.median ?? []) {
      const target =
        m.part === 'dorsal' ? dParts[m.index ?? 0] : m.part === 'anal' ? aParts[m.index ?? 0] : m.part === 'caudal' ? cPart : m.part === 'pectoral' ? ctx.pectoral : ctx.pelvic;
      if (target) target.marks = [...(target.marks ?? []), ...m.marks];
    }
  }
  void clamp;
  void perp;
  void sub;
  return g;
}

/** Bands across the body between depth lines, in body coordinates. */
export const band = (s: Strip, x0: number, x1: number, f0: number | ((t: number) => number), f1: number | ((t: number) => number)) => region(s, tAtX(s, x0), tAtX(s, x1), f0, f1);

/** Scale rims as crescents of colour, row on row over the body (the French angelfish's gold). */
export function scaleRims(s: Strip, rows: number, cols: number, t0: number, paint: Paint, o = 1, f0 = 0.04, f1 = 0.96): Fill[] {
  const out: Fill[] = [];
  for (let r = 0; r < rows; r++) {
    const f = f0 + ((f1 - f0) * (r + 0.5)) / rows;
    for (let k = 0; k < cols; k++) {
      const t = t0 + (1 - t0) * ((k + (r % 2) * 0.5) / cols);
      if (t > 0.99) continue;
      const c0 = at(s, t, f);
      const up = at(s, t, f - 0.42 / rows);
      const dn = at(s, t, f + 0.42 / rows);
      const dx = (at(s, Math.min(1, t + 0.5 / cols), f)[0] - c0[0]) * 0.85;
      const outer = spline([up, add(c0, [dx, 0]), dn], false, 1, 4);
      const inner = spline([lerp(up, c0, 0.25), add(c0, [dx * 0.45, 0]), lerp(dn, c0, 0.25)], false, 1, 4);
      out.push({ poly: [...outer, ...inner.reverse()], paint, o, clip: 'trunk' });
    }
  }
  return out;
}

/** A ring (annulus) round a point. */
export function ring(c: Pt, r0: number, r1: number, n = 24): Pt[] {
  const outer: Pt[] = [];
  const inner: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    outer.push([c[0] + Math.cos(a) * r1, c[1] + Math.sin(a) * r1]);
    inner.push([c[0] + Math.cos(a) * r0, c[1] + Math.sin(a) * r0]);
  }
  return [...outer, ...inner.reverse()];
}
