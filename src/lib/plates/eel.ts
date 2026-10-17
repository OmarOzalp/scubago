/**
 * Eels and eel-shaped fish: a body drawn along a curving spine (snout to tail tip), a continuous
 * fin frill along the back and belly, the head with its gaping mouth and teeth.
 */
import { add, clamp, type Ctrl, lerp, mul, norm, offsetLine, perp, type Pt, resample, rng, spline, sub } from './kit';
import { tube } from './ray';
import { emptyGeom, type Fill, type Line, type Paint, type Part, type PlateGeom } from './types';

export interface EelCtx {
  spine: Pt[];
  /** A point a fraction t along the body, f across it (-1 the back edge, 1 the belly edge). */
  at: (t: number, f?: number) => Pt;
  /** The direction of travel and the normal towards the back at t. */
  dir: (t: number) => Pt;
  up: (t: number) => Pt;
  width: (t: number) => number;
  body: Pt[];
  rand: () => number;
}

export interface EelSpec {
  spine: Ctrl[];
  width: (t: number) => number;
  /** Fin frill along the back from `from` to the tail, height h(t). */
  dorsal?: { from: number; h: (t: number) => number; paint?: Paint };
  anal?: { from: number; h: (t: number) => number; paint?: Paint };
  /** Open mouth: how far back the gape runs (t) and how wide it opens. */
  mouth?: { to: number; open: number; teeth?: number };
  eye: { t: number; f: number; r: number; iris?: Paint };
  /** Round gill opening (morays), optionally inside a dark blotch. */
  gill?: { t: number; f: number; r: number; blotch?: number };
  /** Engraving lines along the body, as fractions across it. */
  engrave?: number[];
  extra?: (c: EelCtx) => { marks?: Fill[]; lines?: Line[]; near?: Part[]; far?: Part[]; tint?: Fill[] };
  seed?: number;
}

export function eel(spec: EelSpec): PlateGeom {
  const g = emptyGeom();
  const rand = rng(spec.seed ?? 9);
  const spine = resample(spline(spec.spine, false), 220);
  const n = spine.length;
  const idx = (t: number) => Math.round(clamp(t, 0, 1) * (n - 1));
  const dir = (t: number) => norm(sub(spine[Math.min(n - 1, idx(t) + 1)], spine[Math.max(0, idx(t) - 1)]));
  const up = (t: number) => perp(dir(t));
  const at = (t: number, f = 0): Pt => add(spine[idx(t)], mul(up(t), -f * spec.width(t)));
  const body = tube(spine, spec.width);
  g.body = body;
  g.trunk = body;

  // Fin frills: a band outside the back (and belly) edge, behind the body.
  const frill = (from: number, h: (t: number) => number, side: 1 | -1, paint: Paint = 'fin'): Part => {
    const ts = Array.from({ length: 80 }, (_, k) => from + ((1 - from) * k) / 79);
    const base = ts.map((t) => at(t, -side * 0.85));
    const edge = ts.map((t) => add(at(t, -side), mul(up(t), side * h(t))));
    // Round the end past the tail tip.
    const tip = add(spine[n - 1], mul(dir(1), h(1) * 1.4));
    const poly = [...base, ...edge.slice().reverse()];
    const rays: Line[] = ts.filter((_, k) => k % 3 === 1).map((t) => ({ pts: [at(t, -side * 0.9), add(at(t, -side), mul(up(t), side * h(t) * 0.92))], w: 0.5, o: 0.55, taper: 'end' as const }));
    void tip;
    return { poly, paint, lines: rays, edge: 0.75 };
  };
  if (spec.dorsal) g.far.push(frill(spec.dorsal.from, spec.dorsal.h, 1, spec.dorsal.paint));
  if (spec.anal) g.far.push(frill(spec.anal.from, spec.anal.h, -1, spec.anal.paint));
  if (spec.dorsal && spec.anal) {
    // The fins meet round the pointed tail.
    const tipFin = spline([at(0.985, -1.4), add(spine[n - 1], mul(dir(1), Math.max(spec.dorsal.h(1), 1.2) * 1.6)), at(0.985, 1.4)], false);
    g.far.push({ poly: [...tipFin, at(0.97, 0)], paint: spec.dorsal.paint ?? 'fin', lines: [], edge: 0.75 });
  }

  for (const f of spec.engrave ?? [-0.75, -0.5, 0.45, 0.68, 0.85]) {
    const line = offsetLine(spine, (t) => -f * spec.width(t));
    g.engraving.push({ pts: line.slice(Math.round(n * 0.02)), w: f > 0 ? 0.6 + f * 1.1 : 0.5 + Math.abs(f) * 0.7, taper: 'both' });
  }
  // Shadow along the belly side.
  g.tint.push({ poly: [...offsetLine(spine, (t) => -spec.width(t) * 0.35), ...offsetLine(spine, (t) => -spec.width(t) * 1.05).reverse()], paint: 'dark', o: 0.14, clip: 'trunk' });

  if (spec.mouth) {
    // The gape: a dark wedge from the snout tip back to the corner of the mouth, teeth along it.
    const { to, open, teeth = 0 } = spec.mouth;
    const corner = at(to, 0.15);
    const upperTip = at(0.004, -0.15);
    const lowerTip = add(at(0.004, 0.6), mul(up(0.004), -open));
    const upperJaw = Array.from({ length: 12 }, (_, k) => lerp(upperTip, corner, k / 11));
    const lowerJaw = Array.from({ length: 12 }, (_, k) => lerp(lowerTip, corner, k / 11));
    g.marks.push({ poly: [...upperJaw, ...lowerJaw.slice().reverse()], paint: '#3A2A26', edge: 1.1 });
    // The lower jaw dropped open below the head.
    g.far.push({ poly: [at(0.004, 0.2), lowerTip, add(corner, mul(up(to), -spec.width(to) * 0.6)), at(to * 1.2, 0.9)], paint: 'back', lines: [], edge: 0.9 });
    for (let k = 1; k <= teeth; k++) {
      const u = k / (teeth + 1);
      for (const [jaw, s] of [
        [upperJaw, -1],
        [lowerJaw, 1],
      ] as const) {
        const p = jaw[Math.round(u * 11)];
        const d = mul(up(to * u), s * open * 0.22 * (k % 2 ? 1.3 : 0.8));
        g.marks.push({ poly: [add(p, mul(dir(to * u), -0.35)), add(p, mul(d, -1)), add(p, mul(dir(to * u), 0.35))], paint: 'light', edge: 0.5 });
      }
    }
  }
  if (spec.gill) {
    const { t, f, r, blotch } = spec.gill;
    const c = at(t, f);
    if (blotch) g.marks.push({ poly: spline(Array.from({ length: 8 }, (_, k) => add(c, [Math.cos((k / 8) * 6.283) * blotch * (0.8 + rand() * 0.4), Math.sin((k / 8) * 6.283) * blotch * (0.8 + rand() * 0.4)])), true), paint: 'ink', o: 0.9, clip: 'trunk' });
    g.marks.push({ poly: Array.from({ length: 12 }, (_, k) => add(c, [Math.cos((k / 12) * 6.283) * r, Math.sin((k / 12) * 6.283) * r * 0.8])), paint: 'ink' });
  }
  g.eyes.push({ c: at(spec.eye.t, spec.eye.f), r: spec.eye.r, iris: spec.eye.iris ?? '#C9A54A' });
  g.heavy.push(offsetLine(spine, (t) => -spec.width(t)));

  const ctx: EelCtx = { spine, at, dir, up, width: spec.width, body, rand };
  const extra = spec.extra?.(ctx);
  if (extra) {
    g.marks.push(...(extra.marks ?? []));
    g.lines.push(...(extra.lines ?? []));
    g.near.push(...(extra.near ?? []));
    g.far.push(...(extra.far ?? []));
    g.tint.push(...(extra.tint ?? []));
  }
  return g;
}
