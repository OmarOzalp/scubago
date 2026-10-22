/**
 * Sea turtles from above, head up, in units of 1% of carapace length (front of the shell at y = 0,
 * back at y = 100, midline x = 0). The shell is laid out the way a real carapace is: a ring of
 * marginal scutes, a column of vertebrals down the middle, costals either side, each scute engraved
 * with its growth rings. Species differ in outline, scute counts, head, flippers and colouring.
 */
import { add, along, blob, centroidOf, clamp, type Ctrl, dist, inside, lerp, mul, norm, perp, polyLength, type Pt, resample, rng, slice, spline, sub } from './kit';
import { bilateral, mirror } from './ray';
import { swell } from './render';
import { emptyGeom, type Fill, type Line, type Paint, type Part, type PlateGeom } from './types';

export interface FlipperSpec {
  /** Where it leaves the body (right side). */
  root: Pt;
  /** Tip of the flipper. */
  tip: Pt;
  /** Width across its widest part. */
  width: number;
  /** How much it curves back (a sweep of the leading edge). */
  bow?: number;
  claws?: number;
  /** Scales: rows along the leading edge (0 for smooth skin). */
  scales?: boolean;
}

export interface HeadSpec {
  /** Outline of the head's right half, from the snout tip back to the neck. */
  outline: Ctrl[];
  eye: Pt;
  eyeR: number;
  /** Seams between the head scales (right half; mirrored, plus any midline seams given with x = 0). */
  seams?: Ctrl[][];
}

export interface TurtleSpec {
  /** Right half of the shell, from the front midline round to the back. */
  shell: Ctrl[];
  /** Width of the ring of marginal scutes. */
  rim?: number;
  marginals?: number;
  vertebrals?: number;
  /** Costal pairs on the right and left (they can differ: olive ridleys). */
  costals?: [number, number];
  /** The first costal reaches forward to the nuchal scute. */
  firstCostalTouchesNuchal?: boolean;
  /** Overlapping scutes like roof tiles (hawksbill). */
  overlap?: boolean;
  /** Saw-toothed rear margin. */
  serrate?: boolean;
  /** Leatherback: no scutes, ridges instead (count including the midline). */
  ridges?: number;
  /** Half-width of the vertebral column (at the scute joints, and at the widest). */
  column?: [number, number];
  head: HeadSpec;
  front: FlipperSpec;
  hind: FlipperSpec;
  /** Sunburst streaks radiating across each scute. */
  streaks?: Paint[];
  /** Weight of the scute outlines (default 1.5). */
  seamW?: number;
  /** Pale edges round the head and flipper scales (a tiled look). */
  paleSeams?: boolean;
  extra?: (c: TurtleCtx) => { marks?: Fill[]; lines?: Line[]; near?: Part[]; far?: Part[] };
  seed?: number;
}

export interface TurtleCtx {
  shell: Pt[];
  scutes: Pt[][];
  head: Pt[];
  flippers: Pt[][];
  rand: () => number;
}

/** A closed polygon moved inwards by d (approximately: along each point's normal). */
function inset(poly: Pt[], d: number): Pt[] {
  const n = poly.length;
  const c = centroidOf(poly);
  return poly.map((p, i) => {
    const a = poly[(i - 1 + n) % n];
    const b = poly[(i + 1) % n];
    let nr = perp(norm(sub(b, a)));
    // Point it inwards.
    if ((c[0] - p[0]) * nr[0] + (c[1] - p[1]) * nr[1] < 0) nr = mul(nr, -1);
    return add(p, mul(nr, d));
  });
}

/** Growth rings inside a scute: copies shrinking towards a focus near its back edge. */
function growthRings(poly: Pt[], n: number, focusBias = 0.25): Line[] {
  const c = centroidOf(poly);
  const ys = poly.map((p) => p[1]);
  const focus: Pt = [c[0], c[1] + (Math.max(...ys) - c[1]) * focusBias];
  const out: Line[] = [];
  for (let k = 1; k <= n; k++) {
    const s = 1 - k / (n + 1);
    const ring = poly.map(([x, y]) => [focus[0] + (x - focus[0]) * s, focus[1] + (y - focus[1]) * s] as Pt);
    out.push({ pts: [...ring, ring[0]], w: 0.5 + 0.3 * (1 - k / n), o: 0.42, taper: 'both' });
  }
  return out;
}

function flipper(f: FlipperSpec, rand: () => number): { poly: Pt[]; lines: Line[]; claws: Pt[][]; lead: Pt[] } {
  const { root, tip, width, bow = 0.18, claws = 0, scales = true } = f;
  const axis = sub(tip, root);
  const L = Math.hypot(axis[0], axis[1]);
  const u = norm(axis);
  const v = perp(u); // to the leading edge side when the flipper points out to the right and back
  const sideSign = root[1] > 50 ? -1 : 1;
  const P = (s: number, w: number): Pt => add(add(root, mul(u, s * L)), mul(v, w * sideSign));
  const lead: Ctrl[] = [P(0, width * 0.5), P(0.18, width * (0.62 + bow)), P(0.45, width * (0.6 + bow * 1.2)), P(0.75, width * (0.4 + bow)), P(0.94, width * 0.12), [tip[0], tip[1], 1]];
  const trail: Ctrl[] = [P(0.88, -width * 0.1), P(0.66, -width * 0.32), P(0.42, -width * 0.42), P(0.2, -width * 0.42), P(0.04, -width * 0.42)];
  const poly = spline([...lead, ...trail], true);
  const leadLine = spline(lead, false);
  const lines: Line[] = [];
  if (scales) {
    // Rows of scales along the leading edge: a few lines parallel to it, cut across into plates.
    for (const k of [0.16, 0.34]) {
      const row = leadLine.map((p, i) => {
        const t = i / (leadLine.length - 1);
        return add(p, mul(v, -width * k * (1 - t * 0.7) * sideSign));
      });
      lines.push({ pts: row.slice(2, -3), w: 0.6, o: 0.7 });
    }
    for (let i = 1; i < 10; i++) {
      const p = along(leadLine, i / 11);
      const q = add(p, mul(v, -width * 0.34 * (1 - (i / 11) * 0.7) * sideSign));
      lines.push({ pts: [p, q], w: 0.55, o: 0.7, detail: true });
    }
  }
  // Fine lines down the length, for the trailing part.
  for (const k of [-0.12, -0.26]) lines.push({ pts: [P(0.1, width * k), P(0.6, width * k * 0.8), P(0.86, width * k * 0.2)], w: 0.6, taper: 'both' });
  const clawPolys: Pt[][] = [];
  for (let i = 0; i < claws; i++) {
    const p = along(leadLine, 0.3 + i * 0.08);
    const out = add(p, mul(v, 1.6 * sideSign));
    clawPolys.push([add(p, mul(u, -0.7)), add(out, mul(u, 0.6)), add(p, mul(u, 0.6))]);
  }
  void rand;
  return { poly, lines, claws: clawPolys, lead: leadLine };
}

export function turtle(spec: TurtleSpec): PlateGeom {
  const g = emptyGeom();
  const rand = rng(spec.seed ?? 21);
  let shell = bilateral(spec.shell);
  const rimW = spec.rim ?? 6.5;

  if (spec.serrate) {
    // Saw teeth on the back half: each marginal ends in a point.
    const pts = resample([...shell, shell[0]], 360);
    shell = pts.map((p, i) => {
      if (p[1] < 62) return p;
      const k = Math.sin((i / pts.length) * Math.PI * 2 * 26) ;
      const c = centroidOf(pts);
      const out = norm(sub(p, c));
      return add(p, mul(out, Math.max(0, k) * 1.6 * clamp((p[1] - 62) / 20, 0, 1)));
    });
  }
  g.body = shell;
  g.trunk = shell;

  // Flippers and head go under the shell.
  const fr = flipper(spec.front, rand);
  const hr = flipper(spec.hind, rand);
  const flipperPolys: Pt[][] = [];
  for (const f of [fr, hr]) {
    for (const flip of [false, true]) {
      const m = (pts: Pt[]) => (flip ? mirror(pts) : pts);
      const poly = m(f.poly);
      flipperPolys.push(poly);
      g.far.push({ poly, paint: 'fin', lines: f.lines.map((l) => ({ ...l, pts: m(l.pts) })), edge: 0.85 });
      for (const c of f.claws) g.far.push({ poly: m(c), paint: '#D8CDB4', lines: [], edge: 0.6 });
    }
  }
  const headPoly = bilateral(spec.head.outline);
  const headLines: Line[] = [];
  for (const seam of spec.head.seams ?? []) {
    const pts = spline(seam, false);
    headLines.push({ pts, w: 1.1 });
    if (pts.some((p) => Math.abs(p[0]) > 0.05)) headLines.push({ pts: mirror(pts), w: 1.1 });
  }
  // Neck: a wrinkled band where the head meets the shell.
  const neckY = spec.head.outline[spec.head.outline.length - 1][1];
  const neckW = Math.abs(spec.head.outline[spec.head.outline.length - 1][0]);
  for (let i = 1; i <= 3; i++) {
    const y = neckY - i * 1.4;
    headLines.push({ pts: spline([[-neckW * 0.8, y + 0.5], [0, y - 0.4], [neckW * 0.8, y + 0.5]], false), w: 0.6, o: 0.7, taper: 'both' });
  }
  g.far.push({ poly: headPoly, paint: 'fin', lines: headLines, edge: 0.9 });
  g.eyes.push({ c: spec.head.eye, r: spec.head.eyeR, iris: '#6B5A2E' }, { c: [-spec.head.eye[0], spec.head.eye[1]], r: spec.head.eyeR, iris: '#6B5A2E' });

  const scutes: Pt[][] = [];
  if (spec.ridges) {
    // Leatherback: ridges running the length of the shell to its pointed tail.
    const n = spec.ridges;
    const tail = shell.reduce((b, p) => (p[1] > b[1] ? p : b), shell[0]);
    for (let i = 0; i < n; i++) {
      const k = (i - (n - 1) / 2) / ((n - 1) / 2);
      const front: Pt = [k * 30, 4 + Math.abs(k) * 6];
      const mid: Pt = [k * 34, 45];
      const ridge = spline([front, mid, lerp(mid, tail, 0.6), tail], false).filter((p) => inside(p, shell));
      // Each ridge is a pale raised line with a fine shadow beside it.
      g.marks.push({ poly: swell(ridge, 1.5, 'both'), paint: 'light', o: 0.6, clip: 'trunk' });
      g.lines.push({ pts: ridge.map(([x, y]) => [x + 1, y] as Pt), w: 0.8, o: 0.8, taper: 'both' });
    }
    g.engraving.push(...ringsFor(shell, [0, 46], [0.95, 0.88, 0.8, 0.7]));
  } else {
    const inner = inset(shell, rimW);
    // Marginal seams: from the shell edge in to the inner rim, evenly round the shell.
    const nm = spec.marginals ?? 12;
    const outerPts = resample([...shell, shell[0]], 600);
    const innerPts = resample([...inner, inner[0]], 600);
    for (let i = 0; i < nm * 2 + 1; i++) {
      const t = (i + 0.5) / (nm * 2 + 1);
      const k = Math.round(t * 599);
      g.lines.push({ pts: [outerPts[k], innerPts[k]], w: 1.2 });
    }
    // Engraving in the marginal ring: a line or two following the edge.
    g.engraving.push({ pts: inset(shell, rimW * 0.45).concat([inset(shell, rimW * 0.45)[0]]), w: 0.6, o: 0.5, taper: 'both' });
    g.lines.push({ pts: [...inner, inner[0]], w: 1.5 });
    g.tint.push({ poly: [...shell, shell[0], ...inner.slice().reverse(), inner[inner.length - 1]], paint: 'dark', o: 0.1, clip: 'trunk' });

    // Vertebral column.
    const yTop = innerPts.reduce((m, p) => (Math.abs(p[0]) < 3 ? Math.min(m, p[1]) : m), 50);
    const yBot = innerPts.reduce((m, p) => (Math.abs(p[0]) < 3 ? Math.max(m, p[1]) : m), 50);
    const nv = spec.vertebrals ?? 5;
    const [wb, wm] = spec.column ?? [8.5, 11.5];
    const nuchalH = 4.5;
    const y0 = yTop + nuchalH;
    const ys = Array.from({ length: nv + 1 }, (_, k) => y0 + ((yBot - y0) * k) / nv);
    const colRight: Pt[] = [];
    for (let k = 0; k < nv; k++) {
      const yA = ys[k];
      const yB = ys[k + 1];
      const wA = k === 0 ? wb * 0.75 : wb;
      const wB = k === nv - 1 ? wb * 0.7 : wb;
      const poly: Pt[] = [
        [-wA, yA],
        [-wm, (yA + yB) / 2],
        [-wB, yB],
        [wB, yB],
        [wm, (yA + yB) / 2],
        [wA, yA],
      ];
      scutes.push(poly);
      colRight.push([wA, yA], [wm, (yA + yB) / 2]);
      if (k === nv - 1) colRight.push([wB, yB]);
    }
    // Nuchal.
    const nuchal: Pt[] = [
      [-wb * 0.75, y0],
      [-wb * 0.55, yTop],
      [wb * 0.55, yTop],
      [wb * 0.75, y0],
    ];
    scutes.push(nuchal);

    // Costals on each side: seams from the column out to the inner rim.
    const [cr, cl] = spec.costals ?? [4, 4];
    const rimRight = slice([...innerPts.filter((p) => p[0] >= 0)].sort((a, b) => a[1] - b[1]), 0, 1);
    const rimSide = (side: 1 | -1) => innerPts.filter((p) => p[0] * side >= 0).sort((a, b) => a[1] - b[1]);
    for (const [side, count] of [
      [1, cr],
      [-1, cl],
    ] as const) {
      const col = colRight.map(([x, y]) => [x * side, y] as Pt);
      const rim = rimSide(side);
      // Where each seam meets the column and the rim.
      const firstY = spec.firstCostalTouchesNuchal ? y0 : y0 + (yBot - y0) * 0.06;
      const lastY = yBot - (yBot - y0) * 0.02;
      const cuts = Array.from({ length: count + 1 }, (_, j) => firstY + ((lastY - firstY) * j) / count);
      const colAt = (y: number): Pt => {
        for (let i = 1; i < col.length; i++) if (col[i][1] >= y) return lerp(col[i - 1], col[i], (y - col[i - 1][1]) / (col[i][1] - col[i - 1][1] || 1));
        return col[col.length - 1];
      };
      const rimAt = (y: number): Pt => {
        // The rim point a seam reaches: slanting back a little as it goes out.
        const yy = y + 4;
        let best = rim[0];
        for (const p of rim) if (Math.abs(p[1] - yy) < Math.abs(best[1] - yy)) best = p;
        return best;
      };
      for (let j = 0; j < count; j++) {
        const a0 = colAt(cuts[j]);
        const a1 = colAt(cuts[j + 1]);
        const b0 = j === 0 && !spec.firstCostalTouchesNuchal ? rimAt(cuts[j] - 6) : rimAt(cuts[j]);
        const b1 = rimAt(cuts[j + 1]);
        const colSeg = col.filter((p) => p[1] > a0[1] && p[1] < a1[1]);
        const rimSeg = rim.filter((p) => p[1] > b0[1] && p[1] < b1[1]);
        const poly: Pt[] = [a0, ...colSeg, a1, b1, ...rimSeg.reverse(), b0];
        scutes.push(poly);
      }
    }
    for (const sc of scutes) {
      g.lines.push({ pts: [...sc, sc[0]], w: spec.seamW ?? 1.5 });
      g.engraving.push(...growthRings(sc, 3));
      if (spec.overlap) {
        // Each scute's back edge laps over the next: a shadow just behind it.
        const back = sc.filter((p) => p[1] >= centroidOf(sc)[1]);
        if (back.length > 1) {
          const sorted = back.sort((a, b) => a[0] - b[0]);
          g.marks.push({ poly: [...sorted, ...sorted.slice().reverse().map(([x, y]) => [x, y + 1.3] as Pt)], paint: 'dark', o: 0.55, clip: 'trunk' });
        }
      }
    }
    void rimRight;
  }
  // Shading over the whole shell: the dome rounds away to the lower right.
  g.tint.push({ poly: shell.map(([x, y]) => [x + 3, y + 3] as Pt), paint: 'dark', o: 0.12, clip: 'trunk' });
  if (spec.streaks) {
    // Flame-like streaks flowing out from near the back of each scute, uneven in length and width.
    for (const sc of scutes) {
      const c = centroidOf(sc);
      const ys2 = sc.map((p) => p[1]);
      const focus: Pt = [c[0], c[1] + (Math.max(...ys2) - c[1]) * 0.86];
      const n = 24;
      for (let k = 0; k < n; k++) {
        const target = along([...sc, sc[0]], (k + rand() * 0.7) / n);
        const reach = 0.7 + rand() * 0.3;
        const a = lerp(focus, target, 0.03 + rand() * 0.06);
        const b = lerp(focus, target, Math.min(0.96, reach));
        const len = dist(a, b);
        const paint = spec.streaks[Math.floor(rand() * spec.streaks.length)];
        // A tapered sliver, thick near the middle, pointing out from the focus; it stays inside its scute.
        if (len > 1.2) g.marks.push({ poly: swell([a, b], Math.min(1.5, 0.45 + len * 0.06), 'both'), paint, o: 0.5, clip: 'trunk' });
      }
    }
  }
  g.heavy.push(slice(shell, 0.2, 0.8));

  const extra = spec.extra?.({ shell, scutes, head: headPoly, flippers: flipperPolys, rand });
  if (extra) {
    g.marks.push(...(extra.marks ?? []));
    g.lines.push(...(extra.lines ?? []));
    g.near.push(...(extra.near ?? []));
    g.far.push(...(extra.far ?? []));
  }
  void dist;
  void polyLength;
  return g;
}

/** Rings for a dome seen from above. */
function ringsFor(poly: Pt[], hub: Pt, ks: number[]): Line[] {
  return ks.map((k, i) => {
    const r = poly.map(([x, y]) => [hub[0] + (x - hub[0]) * k, hub[1] + (y - hub[1]) * k] as Pt);
    return { pts: [...r, r[0]], w: 0.7 + i * 0.1, o: 0.5, taper: 'both' as const };
  });
}
