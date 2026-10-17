/**
 * Just enough path handling for the species drawings: animals seen from above are drawn as their
 * left half, and `symmetric` adds the mirrored right half. Paths use absolute M and C only.
 */

type Point = [number, number];
interface Curve {
  c1: Point;
  c2: Point;
  to: Point;
}

function parse(d: string): { start: Point; curves: Curve[] } {
  const nums = d.match(/-?\d*\.?\d+/g)?.map(Number) ?? [];
  const cmds = d.match(/[MC]/g) ?? [];
  if (cmds[0] !== 'M' || cmds.slice(1).some((c) => c !== 'C') || (nums.length - 2) % 6 !== 0) {
    throw new Error(`symmetric(): only "M x,y C …" paths are supported: ${d.slice(0, 40)}`);
  }
  const start: Point = [nums[0], nums[1]];
  const curves: Curve[] = [];
  for (let i = 2; i < nums.length; i += 6) {
    curves.push({ c1: [nums[i], nums[i + 1]], c2: [nums[i + 2], nums[i + 3]], to: [nums[i + 4], nums[i + 5]] });
  }
  return { start, curves };
}

const fmt = (n: number) => String(Math.round(n * 100) / 100);
const pt = ([x, y]: Point) => `${fmt(x)},${fmt(y)}`;

/**
 * A closed outline from its left half: `half` runs from a point on the centre line, round the left
 * side, to another point on the centre line; the right side is its mirror image about `cx`.
 */
export function symmetric(half: string, cx = 100): string {
  const { start, curves } = parse(half);
  const flip = ([x, y]: Point): Point => [2 * cx - x, y];
  let d = `M${pt(start)}`;
  for (const c of curves) d += ` C${pt(c.c1)} ${pt(c.c2)} ${pt(c.to)}`;
  // Back up the mirrored side: each curve reversed (its control points swap) and flipped.
  const points = [start, ...curves.map((c) => c.to)];
  for (let i = curves.length - 1; i >= 0; i--) {
    const c = curves[i];
    d += ` C${pt(flip(c.c2))} ${pt(flip(c.c1))} ${pt(flip(points[i]))}`;
  }
  return `${d} Z`;
}

/** The mirror image of any path made of absolute M, L, C and Z (for paired fins, patches, eyes). */
export function mirror(d: string, cx = 100): string {
  return d.replace(/(-?\d*\.?\d+),(-?\d*\.?\d+)/g, (_, x, y) => `${fmt(2 * cx - Number(x))},${y}`);
}
