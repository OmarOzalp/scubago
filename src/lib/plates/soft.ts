/**
 * Soft bodies: the outline of several ellipses melted together, as a single smooth polygon. Used
 * for animals with no hard edges (octopus mantles and heads, sea slugs, jellyfish arms), where
 * drawing each lobe as its own shape would leave seams.
 */
import { dist, polyLength, type Pt, resample } from './kit';

export interface Lobe {
  c: Pt;
  rx: number;
  ry: number;
  /** Rotation in degrees. */
  rot?: number;
}

/**
 * The outline of the lobes blended together. `k` is how much they melt into each other (0.1 is a
 * tight join, 0.35 a soft web between them); `step` is the sampling grid in drawing units.
 */
export function softUnion(lobes: Lobe[], k = 0.2, step = 0.4): Pt[] {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const l of lobes) {
    const r = Math.max(l.rx, l.ry) * 1.6 + 2;
    x0 = Math.min(x0, l.c[0] - r);
    y0 = Math.min(y0, l.c[1] - r);
    x1 = Math.max(x1, l.c[0] + r);
    y1 = Math.max(y1, l.c[1] + r);
  }
  const prepared = lobes.map((l) => {
    const a = ((l.rot ?? 0) * Math.PI) / 180;
    return { cx: l.c[0], cy: l.c[1], rx: l.rx, ry: l.ry, cos: Math.cos(a), sin: Math.sin(a) };
  });
  // The field: a smooth minimum of each lobe's scaled distance; the outline is where it equals 1.
  // Each lobe only reaches the cells near it (beyond about twice its size its share is negligible),
  // so the sums are gathered lobe by lobe over its own patch of the grid.
  const nx = Math.ceil((x1 - x0) / step) + 1;
  const ny = Math.ceil((y1 - y0) / step) + 1;
  const sum = new Float64Array(nx * ny);
  const reach = 1 + 6 * k;
  for (const l of prepared) {
    const r = Math.max(l.rx, l.ry) * reach;
    const i0 = Math.max(0, Math.floor((l.cx - r - x0) / step));
    const i1 = Math.min(nx - 1, Math.ceil((l.cx + r - x0) / step));
    const j0 = Math.max(0, Math.floor((l.cy - r - y0) / step));
    const j1 = Math.min(ny - 1, Math.ceil((l.cy + r - y0) / step));
    for (let j = j0; j <= j1; j++) {
      const dy = y0 + j * step - l.cy;
      for (let i = i0; i <= i1; i++) {
        const dx = x0 + i * step - l.cx;
        const u = (dx * l.cos + dy * l.sin) / l.rx;
        const w = (-dx * l.sin + dy * l.cos) / l.ry;
        sum[j * nx + i] += Math.exp(-Math.sqrt(u * u + w * w) / k);
      }
    }
  }
  const v = Array.from(sum, (s) => (s > 0 ? -k * Math.log(s) - 1 : 10));
  const val = (i: number, j: number) => v[j * nx + i];
  const point = new Map<string, Pt>();
  const link = new Map<string, string[]>();
  // Where the outline crosses a grid edge: horizontal edges are "h", vertical "v".
  const cross = (key: string, a: Pt, b: Pt, va: number, vb: number) => {
    if (!point.has(key)) {
      const t = va / (va - vb);
      point.set(key, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
    return key;
  };
  const join = (a: string, b: string) => {
    link.set(a, [...(link.get(a) ?? []), b]);
    link.set(b, [...(link.get(b) ?? []), a]);
  };
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = val(i, j);
      const b = val(i + 1, j);
      const c = val(i + 1, j + 1);
      const d = val(i, j + 1);
      const code = (a < 0 ? 8 : 0) | (b < 0 ? 4 : 0) | (c < 0 ? 2 : 0) | (d < 0 ? 1 : 0);
      if (code === 0 || code === 15) continue;
      const px = x0 + i * step;
      const py = y0 + j * step;
      const top = () => cross(`h${i},${j}`, [px, py], [px + step, py], a, b);
      const right = () => cross(`v${i + 1},${j}`, [px + step, py], [px + step, py + step], b, c);
      const bottom = () => cross(`h${i},${j + 1}`, [px, py + step], [px + step, py + step], d, c);
      const left = () => cross(`v${i},${j}`, [px, py], [px, py + step], a, d);
      const centre = (a + b + c + d) / 4 < 0;
      switch (code) {
        case 1:
        case 14:
          join(left(), bottom());
          break;
        case 2:
        case 13:
          join(bottom(), right());
          break;
        case 3:
        case 12:
          join(left(), right());
          break;
        case 4:
        case 11:
          join(top(), right());
          break;
        case 6:
        case 9:
          join(top(), bottom());
          break;
        case 7:
        case 8:
          join(left(), top());
          break;
        case 5:
          if (centre) {
            join(left(), top());
            join(bottom(), right());
          } else {
            join(left(), bottom());
            join(top(), right());
          }
          break;
        case 10:
          if (centre) {
            join(left(), bottom());
            join(top(), right());
          } else {
            join(left(), top());
            join(bottom(), right());
          }
          break;
      }
    }
  }
  // Walk the links into closed loops and keep the longest.
  const seen = new Set<string>();
  let best: Pt[] = [];
  for (const start of link.keys()) {
    if (seen.has(start)) continue;
    const loop: Pt[] = [];
    let prev = '';
    let cur = start;
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      loop.push(point.get(cur)!);
      const next = (link.get(cur) ?? []).find((n) => n !== prev && !seen.has(n));
      prev = cur;
      cur = next ?? '';
    }
    if (polyLength(loop) > polyLength(best)) best = loop;
  }
  if (best.length < 3) return best;
  // Even spacing, and a consistent winding (clockwise on screen, like the other outlines).
  let area = 0;
  for (let i = 0; i < best.length; i++) {
    const p = best[i];
    const q = best[(i + 1) % best.length];
    area += p[0] * q[1] - q[0] * p[1];
  }
  if (area < 0) best.reverse();
  const n = Math.max(24, Math.round(polyLength([...best, best[0]]) / (step * 0.8)));
  return resample([...best, best[0]], n).slice(0, -1).filter((p, i, arr) => i === 0 || dist(p, arr[i - 1]) > 1e-6);
}
