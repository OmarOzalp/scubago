/**
 * Sharks seen from above, head to the left, rolled a little towards the viewer so the dorsal fin
 * and tail still show: for the hammerheads, whose head is what tells them apart, and the
 * wobbegong, which lies flat on the bottom.
 */
import { add, type Ctrl, mul, type Pt, rng, spline } from './kit';
import { caudal, type CaudalSpec } from './shark';
import {
  contours,
  type FinShape,
  finLines,
  medianFin,
  type MedianFinSpec,
  outlineOf,
  outsideTrunk,
  spliceFins,
  type Strip,
  trunk,
} from './side';
import { emptyGeom, type Fill, type Line, type Part, type PlateGeom } from './types';

export interface TopSharkCtx {
  s: Strip;
  trunk: Pt[];
  pecs: FinShape[];
  pelvics: FinShape[];
  d1: FinShape;
  caudal: FinShape & { lower: FinShape };
  head?: Strip;
  rand: () => number;
}

export interface TopSharkSpec {
  /** Body outline from above: tip, the left side (y < 0) and the right side (y > 0). */
  tip: Pt;
  top: Ctrl[];
  bot: Ctrl[];
  blunt?: number;
  /** A hammer: its front and rear margins from one end to the other (y from - to +), as [x, y]. */
  head?: { front: Ctrl[]; rear: Ctrl[] };
  /** Pectoral fins standing out from the sides (left out where they're part of the body outline). */
  pec?: MedianFinSpec;
  pelvic?: MedianFinSpec;
  /** Dorsal fins standing up from the back, foreshortened by the roll (heights as seen). */
  d1: MedianFinSpec;
  d2?: MedianFinSpec;
  /** The anal fin, showing past the far side. */
  anal?: MedianFinSpec;
  caudal: CaudalSpec;
  eyes: Pt[];
  eyeR: number;
  extra?: (c: TopSharkCtx) => { marks?: Fill[]; tint?: Fill[]; lines?: Line[]; near?: Part[]; far?: Part[] };
  /** Engraving lines across the body (fractions from the left edge), if not the default. */
  rings?: { top: number[]; bot: number[] };
  seed?: number;
}

export function topShark(spec: TopSharkSpec): PlateGeom {
  const g = emptyGeom();
  const s = trunk({ tip: spec.tip, top: spec.top, bot: spec.bot, blunt: spec.blunt ?? 0.9 });
  const trunkPoly = outlineOf(s);
  const pecs = spec.pec ? [medianFin(s.top, spec.pec, -1), medianFin(s.bot, spec.pec, 1)] : [];
  const pelvics = spec.pelvic ? [medianFin(s.top, spec.pelvic, -1), medianFin(s.bot, spec.pelvic, 1)] : [];
  const cd = caudal(s, spec.caudal);
  const top = spliceFins(s.top, [pecs[0], pelvics[0]].filter(Boolean) as FinShape[]);
  const bot = spliceFins(s.bot, [pecs[1], pelvics[1]].filter(Boolean) as FinShape[]);
  g.body = [...top, ...cd.outline.slice(1, -1), ...bot.reverse()];
  g.trunk = trunkPoly;
  const fin = (f: FinShape, n: number): Part => ({ poly: f.poly, paint: 'back', lines: outsideTrunk(finLines(f, n, 0.88, 0.75), trunkPoly) });
  g.median = [...pecs.map((f) => fin(f, 6)), ...pelvics.map((f) => fin(f, 4))];
  g.median.push({ poly: cd.poly, paint: 'back', lines: outsideTrunk([...finLines(cd, 6, 0.9, 0.75), ...finLines(cd.lower, 4, 0.85, 0.7)], trunkPoly) });

  // Lit along the spine, shaded towards both flanks (more on the far, lower side).
  g.tint.push({ poly: trunkPoly, paint: 'dark', o: 0.06 });
  g.engraving = contours(s, spec.rings ?? { top: [0.03, 0.07, 0.115, 0.17, 0.23], bot: [0.66, 0.72, 0.78, 0.83, 0.875, 0.915, 0.95, 0.975] });

  // The midline the dorsal fins stand on, nudged towards the near side by the roll.
  const mid: Pt[] = s.top.map((p, i) => [p[0], p[1] + (s.bot[i][1] - p[1]) * 0.42] as Pt);
  const d1 = medianFin(mid, spec.d1, -1);
  const standing = [d1, ...(spec.d2 ? [medianFin(mid, spec.d2, -1)] : [])];
  for (const f of standing) {
    // Its shadow falls on the back beside it.
    g.tint.push({ poly: f.outline.map(([x, y]) => [x + 1.2, y + (mid[0][1] - y) * -0.25 + 1.4] as Pt), paint: 'dark', o: 0.25, clip: 'trunk' });
    // Closed along its base (it stands on the back, nothing to tuck under).
    g.near.push({ poly: f.outline, paint: 'back', lines: finLines(f, 6, 0.88, 0.7) });
  }
  if (spec.anal) {
    const a = medianFin(mid, spec.anal, 1);
    g.far.push({ poly: a.poly, paint: 'back', lines: finLines(a, 3, 0.85, 0.7) });
  }

  let headStrip: Strip | undefined;
  if (spec.head) {
    // The hammer: its own strip from one end to the other, engraved along its length.
    const front = spline(spec.head.front, false);
    const rear = spline(spec.head.rear, false);
    const n = 90;
    const at = (line: Pt[], k: number) => line[Math.round((k / (n - 1)) * (line.length - 1))];
    // Re-sample both margins by y so they pair up across the blade.
    const byY = (line: Pt[], y: number) => {
      for (let i = 1; i < line.length; i++) {
        const a = line[i - 1];
        const b = line[i];
        if ((a[1] - y) * (b[1] - y) <= 0) return a[0] + ((y - a[1]) / (b[1] - a[1] || 1)) * (b[0] - a[0]);
      }
      return y < line[0][1] ? line[0][0] : line[line.length - 1][0];
    };
    const y0 = Math.max(front[0][1], rear[0][1]);
    const y1 = Math.min(front[front.length - 1][1], rear[rear.length - 1][1]);
    const ys = Array.from({ length: n }, (_, k) => y0 + ((y1 - y0) * k) / (n - 1));
    headStrip = { top: ys.map((y) => [byY(front, y), y] as Pt), bot: ys.map((y) => [byY(rear, y), y] as Pt) };
    void at;
    const headPoly = [...front, ...rear.slice().reverse()];
    const lines = contours(headStrip, { top: [0.08, 0.2, 0.34], bot: [0.62, 0.74, 0.84, 0.92], t0: 0.02, t1: 0.98 });
    g.near.unshift({ poly: headPoly, paint: 'back', lines, edge: 1 });
  }
  for (const e of spec.eyes) g.eyes.push({ c: e, r: spec.eyeR });
  g.heavy.push(s.bot);

  const ctx: TopSharkCtx = { s, trunk: trunkPoly, pecs, pelvics, d1, caudal: cd, head: headStrip, rand: rng(spec.seed ?? 11) };
  const extra = spec.extra?.(ctx);
  if (extra) {
    g.marks.push(...(extra.marks ?? []));
    g.tint.push(...(extra.tint ?? []));
    g.lines.push(...(extra.lines ?? []));
    g.near.push(...(extra.near ?? []));
    g.far.push(...(extra.far ?? []));
  }
  return g;
}

/** Mirror [x, y] control points across the body's axis (y = 0). */
export const mirrorY = (pts: Ctrl[]): Ctrl[] => pts.map((p) => (p.length === 3 ? [p[0], -p[1], 1] : [p[0], -p[1]]) as Ctrl);
export { add, mul };
