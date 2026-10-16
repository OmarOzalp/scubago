/**
 * Watercolour washes as plain SVG paths, so they look the same on iOS, Android and the web (SVG
 * filters aren't available everywhere). A wash is an irregular, softly rounded blob; the same seed
 * always gives the same shape, so nothing shifts between renders.
 */

/** Small, fast, seeded random numbers (mulberry32). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stable number for a string (FNV-1a), for seeding a species' or a site's wash. */
export function hashSeed(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

const round = (n: number) => Math.round(n * 10) / 10;

/**
 * A closed blob filling roughly a w×h box (inset by `inset` on every side). `wobble` is how far the
 * edge wanders inwards, as a share of the radius (0 = a plain ellipse).
 */
export function washPath(seed: number, w: number, h: number, { wobble = 0.14, points = 9, inset = 0 } = {}): string {
  const rand = seededRandom(seed);
  const cx = w / 2;
  const cy = h / 2;
  const rx = w / 2 - inset;
  const ry = h / 2 - inset;
  const start = rand() * Math.PI * 2;
  const pts: [number, number][] = [];
  for (let i = 0; i < points; i++) {
    const angle = start + (i / points) * Math.PI * 2;
    const r = 1 - wobble + rand() * wobble;
    pts.push([cx + Math.cos(angle) * rx * r, cy + Math.sin(angle) * ry * r]);
  }
  // A smooth closed curve through the points (Catmull-Rom, as cubic Béziers).
  const at = (i: number) => pts[(i + points) % points];
  let d = `M${round(pts[0][0])} ${round(pts[0][1])}`;
  for (let i = 0; i < points; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${round(c1[0])} ${round(c1[1])} ${round(c2[0])} ${round(c2[1])} ${round(p2[0])} ${round(p2[1])}`;
  }
  return `${d}Z`;
}
