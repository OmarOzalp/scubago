/**
 * Rays seen from above, head up, in units of 1% of disc width (wingtip to wingtip = 100, the
 * middle of the snout at the origin, y increasing towards the tail). The disc is drawn from its
 * right half and mirrored; the tail is a tapering tube along a curve, so long tails can be curled
 * round the plate the way old naturalists fitted them on the page.
 */
import { add, clamp, type Ctrl, dist, lerp, mul, norm, offsetLine, perp, polyLength, type Pt, resample, rng, slice, spline, sub } from './kit';
import { emptyGeom, type Fill, type Line, type Paint, type Part, type PlateGeom } from './types';

export interface TailSpec {
  /** Centre line, from the root (under the disc) to the tip. */
  path: Ctrl[];
  /** Half-widths at the root and the tip. */
  w0: number;
  w1: number;
  /** How the width falls off: 1 even, more keeps it thick for longer. */
  hold?: number;
  /** A small fin on top of the tail: from fraction `at`, `len` long, `w` wide. */
  dorsal?: { at: number; len: number; w: number; paint?: Paint };
  /** Serrated stinging spines lying back along the tail. */
  spines?: { at: number; n: number; len: number };
  /** A skin fold along both sides from `from` to the tip, `w` wide. */
  fold?: { from: number; to?: number; w: number; paint?: Paint };
  /** A knob over a vestigial spine (oceanic manta). */
  knob?: number;
}

export interface RayCtx {
  disc: Pt[];
  tail: Pt[];
  center: Pt[];
  rand: () => number;
  /** A point a fraction t along the tail centre line. */
  onTail: (t: number) => Pt;
}

export interface RaySpec {
  /** The disc's right half, from the front of the midline round to the back of it. */
  disc: Ctrl[];
  /** The centre of the body (the domed part the wings spread from). */
  hub: Pt;
  cephalic?: { root: Pt; tip: Pt; width: number; rolled?: boolean };
  /** Right pelvic lobe (closed outline). */
  pelvic?: Ctrl[];
  tail: TailSpec;
  eye: Pt;
  eyeR: number;
  /** Spiracle just behind each eye (stingrays and their kin). */
  spiracle?: { at: Pt; r: number };
  extra?: (c: RayCtx) => { marks?: Fill[]; tint?: Fill[]; lines?: Line[]; near?: Part[]; far?: Part[] };
  seed?: number;
}

const mirror = (pts: Pt[]): Pt[] => pts.map(([x, y]) => [-x, y] as Pt);

/** A closed outline from its right half (from the front midline round to the back midline). */
export function bilateral(right: Ctrl[], tension = 1): Pt[] {
  const half = spline(right, false, tension);
  return [...half, ...mirror(half.slice(1, -1)).reverse()];
}

/** A tube along a centre line: half-width w(t), t from 0 to 1. */
export function tube(center: Pt[], w: (t: number) => number): Pt[] {
  const left = offsetLine(center, (t) => w(t));
  const right = offsetLine(center, (t) => -w(t));
  return [...left, ...right.reverse()];
}

/**
 * Engraving on a disc seen from above: rings that follow its edge, closing in on the hub, broken
 * into short cuts that are heavier on the shadowed (lower right) side.
 */
export function discRings(poly: Pt[], hub: Pt, rings: number[], weight = 1): Line[] {
  const out: Line[] = [];
  const pts = resample([...poly, poly[0]], 240);
  for (const [ri, k] of rings.entries()) {
    const ring = pts.map(([x, y]) => [hub[0] + (x - hub[0]) * k, hub[1] + (y - hub[1]) * k] as Pt);
    // Cut it into arcs; each arc's weight follows how much it faces away from the light.
    const arcs = 14;
    for (let a = 0; a < arcs; a++) {
      const seg = ring.slice(Math.floor((a / arcs) * ring.length), Math.floor(((a + 1) / arcs) * ring.length) + 2);
      if (seg.length < 3) continue;
      const m = seg[Math.floor(seg.length / 2)];
      const dir = norm(sub(m, hub));
      const shade = clamp(0.5 + 0.5 * (dir[0] * 0.55 + dir[1] * 0.83), 0, 1);
      const edge = 1 - ri / rings.length;
      out.push({ pts: seg, w: weight * (0.45 + 1.3 * shade) * (0.55 + 0.6 * edge), taper: 'both' });
    }
  }
  return out;
}

export function ray(spec: RaySpec): PlateGeom {
  const g = emptyGeom();
  const rand = rng(spec.seed ?? 3);
  const disc = bilateral(spec.disc);
  g.body = disc;
  g.trunk = disc;

  // Tail first (it runs out from under the disc).
  const center = spline(spec.tail.path, false);
  const len = polyLength(center);
  const { w0, w1, hold = 1 } = spec.tail;
  const width = (t: number) => w1 + (w0 - w1) * (1 - t) ** hold;
  const tailPoly = tube(resample(center, Math.max(30, Math.round(len / 1.2))), width);
  const onTail = (t: number) => {
    const pts = resample(center, 200);
    return pts[Math.round(clamp(t, 0, 1) * 199)];
  };
  if (spec.tail.fold) {
    const { from, to = 1, w, paint = 'fin' } = spec.tail.fold;
    const seg = resample(slice(center, from, to), 80);
    const foldPoly = tube(seg, (t) => width(from + (to - from) * t) + w * Math.sin(Math.PI * Math.min(1, t * 1.4 + 0.15)) ** 0.6);
    g.far.push({ poly: foldPoly, paint, lines: [], edge: 0.6 });
  }
  const tailLines: Line[] = [0.25, 0.75].map((f) => ({
    pts: resample(center, 120).map((p, i, arr) => {
      const t = i / (arr.length - 1);
      const a = arr[Math.max(0, i - 1)];
      const b = arr[Math.min(arr.length - 1, i + 1)];
      return add(p, mul(perp(norm(sub(b, a))), width(t) * (1 - 2 * f) * 0.8));
    }),
    w: f > 0.5 ? 1.2 : 0.6,
    taper: 'both',
  }));
  g.far.push({ poly: tailPoly, paint: 'back', lines: tailLines, edge: 0.8 });

  if (spec.pelvic) {
    const right = spline(spec.pelvic, true);
    for (const p of [right, mirror(right)]) g.far.push({ poly: p, paint: 'back', lines: [], edge: 0.8 });
  }

  // Shading: rings round the hub, and a soft shadow on the far half.
  g.engraving = discRings(disc, spec.hub, [0.97, 0.93, 0.885, 0.835, 0.78, 0.72, 0.65]);
  g.tint.push({ poly: disc.map(([x, y]) => [x + 2, y + 3] as Pt), paint: 'dark', o: 0.1, clip: 'trunk' });

  if (spec.cephalic) {
    const { root, tip, width: w, rolled } = spec.cephalic;
    const mid = lerp(root, tip, 0.5);
    const inward: Pt = [-w * (rolled ? 0.5 : 0.9), 0];
    const outline: Ctrl[] = rolled
      ? [add(root, [-w * 0.5, 0.5]), add(mid, [-w * 0.45, 0]), add(tip, [-w * 0.2, 0.6]), [tip[0], tip[1], 1], add(mid, [w * 0.5, 0]), add(root, [w * 0.55, 0.5])]
      : [add(root, [-w * 0.55, 0.6]), add(mid, inward), add(tip, [-w * 0.45, 0.4]), add(tip, [0, -0.3]), add(tip, [w * 0.45, 0.5]), add(mid, [w * 0.4, 0]), add(root, [w * 0.5, 0.8])];
    const fin = spline(outline, true);
    const lines: Line[] = [0.33, 0.66].map((f) => ({ pts: [lerp(root, add(root, [w * (f - 0.5), 0]), 1), lerp(tip, add(tip, [w * (f - 0.5) * 0.6, 0]), 1)], w: 0.6, taper: 'both' }));
    for (const [p, ls] of [
      [fin, lines],
      [mirror(fin), lines.map((l) => ({ ...l, pts: mirror(l.pts) }))],
    ] as const)
      g.near.push({ poly: p, paint: 'back', lines: ls, edge: 0.85 });
  }

  // On the tail: dorsal fin, spines, knob.
  const tailDir = (t: number) => norm(sub(onTail(Math.min(1, t + 0.01)), onTail(Math.max(0, t - 0.01))));
  if (spec.tail.dorsal) {
    const { at, len: dl, w, paint = 'back' } = spec.tail.dorsal;
    const a = onTail(at);
    const b = onTail(at + dl / len);
    const n = perp(tailDir(at));
    const fin: Pt[] = spline([add(a, mul(n, w)), add(lerp(a, b, 0.55), mul(n, w * 0.8)), [b[0], b[1], 1], add(lerp(a, b, 0.55), mul(n, -w * 0.8)), add(a, mul(n, -w))], true);
    g.near.push({ poly: fin, paint, lines: [], edge: 0.7 });
  }
  if (spec.tail.spines) {
    const { at, n, len: sl } = spec.tail.spines;
    for (let i = 0; i < n; i++) {
      const t = at + (i * 2.4) / len;
      const a = onTail(t);
      const d = tailDir(t);
      const side = perp(d);
      const tip = add(a, mul(d, sl));
      // A slender blade with fine serrations along one edge.
      const blade: Pt[] = [add(a, mul(side, 0.45)), add(lerp(a, tip, 0.5), mul(side, 0.4)), tip, add(lerp(a, tip, 0.5), mul(side, -0.3)), add(a, mul(side, -0.4))];
      g.near.push({ poly: blade, paint: '#D8CDB4', lines: [], edge: 0.6 });
      for (let k = 1; k < 5; k++) {
        const p = lerp(a, tip, k / 5);
        g.lines.push({ pts: [add(p, mul(side, 0.35)), add(add(p, mul(side, 0.75)), mul(d, -0.3))], w: 0.5, detail: true });
      }
    }
  }
  if (spec.tail.knob != null) {
    const c = onTail(spec.tail.knob);
    g.near.push({ poly: spline([add(c, [-1.6, 0]), add(c, [0, -2.4]), add(c, [1.6, 0]), add(c, [0, 2.4])], true), paint: 'back', lines: [], edge: 0.7 });
  }

  g.eyes.push({ c: spec.eye, r: spec.eyeR }, { c: [-spec.eye[0], spec.eye[1]], r: spec.eyeR });
  if (spec.spiracle) {
    const { at, r } = spec.spiracle;
    for (const c of [at, [-at[0], at[1]] as Pt])
      g.marks.push({ poly: spline([add(c, [-r, 0]), add(c, [0, -r * 0.7]), add(c, [r, 0]), add(c, [0, r * 0.9])], true), paint: 'dark', o: 0.85, edge: 0.6 });
  }
  g.heavy.push(slice(disc, 0.25, 0.75));

  const extra = spec.extra?.({ disc, tail: tailPoly, center, rand, onTail });
  if (extra) {
    g.marks.push(...(extra.marks ?? []));
    g.tint.push(...(extra.tint ?? []));
    g.lines.push(...(extra.lines ?? []));
    g.near.push(...(extra.near ?? []));
    g.far.push(...(extra.far ?? []));
  }
  void dist;
  return g;
}

export { mirror };
