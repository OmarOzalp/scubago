import { oceanScale, WORLD } from './steering';

/**
 * The archipelago's bank, as plain data for the ocean (ocean-mesh.ts) and the scene: the islands in
 * the explorer stand in a chain on one broad, shallow bank of turquoise water, like the Bahamas from
 * the air, with the deep blue only off its edges. Between neighbouring islands, out of their animals'
 * water, pale sandbars streak the bank, small cays of bare sand break the surface out on its flanks,
 * and rocks stand seaward of them. With one island (Home's card) there is no bank.
 */
export const BANK = {
  /** The broad platform each island stands on: how far it reaches from the island's middle (units), and how much that varies around it. */
  platform: 5.2, platformVariation: .9,
  /** The saddle joining neighbouring islands: its half-width midway between them (units), widening into each platform. */
  saddle: 2.4,
  /** How ragged the bank's edge is (units the edge wanders), and how gradually it drops away to the open ocean (units each way). */
  ragged: .9, edge: 1.4,
  /** Its water depth (units), shallowest to deepest, in soft patches. */
  depth: [1, 1.6] as const,
  /** A sandbar's water depth over its crest, and how wide it is (units). */
  sandbar: { depth: .2, width: .5 },
  /** A cay: its sand rises this high above the water at its middle (units of depth, negative is dry), in sandy shallows this much wider than it. */
  cay: -.06, shallows: 2.6,
};

type Point = readonly [number, number];
export type Sandbar = { from: Point; to: Point; width: number };
export type Cay = { x: number; z: number; radius: number; palm: boolean };
export type Rock = { x: number; z: number; size: number };
export type Bank = { islands: Point[]; sandbars: Sandbar[]; cays: Cay[]; rocks: Rock[] };

/** Each island's swimming water at the last level (half its width and depth): nothing out here may stand in it. */
const SWIM = { x: WORLD.x * oceanScale(6), z: WORLD.z * oceanScale(6) };
const hash = (a: number, b: number) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };
const smoothstep = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** Smooth value noise in 0..1, features about one unit across. */
function noise(x: number, z: number) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}
/** Polynomial smooth minimum: joins the platforms and saddles without creases. */
const smoothMin = (a: number, b: number, k: number) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k / 4; };

/** Distance from (x, z) to the segment a–b, and how far along it the nearest point is (0 to 1). */
function toSegment(x: number, z: number, [ax, az]: Point, [bx, bz]: Point) {
  const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
  return { distance: Math.hypot(x - ax - dx * t, z - az - dz * t), t };
}

/**
 * The bank under these islands (their middles), or null for fewer than two: a chain through them from
 * north to south, its sandbars, cays and rocks in the water between each pair of neighbours.
 */
export function archipelagoBank(islands: readonly { x: number; z: number }[]): Bank | null {
  if (islands.length < 2) return null;
  const chain = [...islands].sort((a, b) => a.z - b.z).map((i) => [i.x, i.z] as const);
  const sandbars: Sandbar[] = [], cays: Cay[] = [], rocks: Rock[] = [];
  for (let i = 0; i < chain.length - 1; i++) {
    const [ax, az] = chain[i], [bx, bz] = chain[i + 1], mx = (ax + bx) / 2, mz = (az + bz) / 2;
    const dx = bx - ax, dz = bz - az, length = Math.hypot(dx, dz) || 1, ux = dx / length, uz = dz / length;
    const px = -uz, pz = ux;
    for (const side of [-1, 1]) {
      const seed = i * 7 + (side + 1) * 3;
      // A sandbar along the saddle, off its middle on this side, leaning a little across it.
      const off = side * (.5 + .9 * hash(seed, 1)), lean = (hash(seed, 2) - .5) * .6, half = 1.3 + .8 * hash(seed, 3), shift = (hash(seed, 4) - .5) * 1.4;
      const sx = ux * Math.cos(lean) - px * Math.sin(lean), sz = uz * Math.cos(lean) - pz * Math.sin(lean);
      const cx = mx + px * off + ux * shift, cz = mz + pz * off + uz * shift;
      sandbars.push({ from: [cx - sx * half, cz - sz * half], to: [cx + sx * half, cz + sz * half], width: BANK.sandbar.width * (.75 + .5 * hash(seed, 5)) });
      // Out on the flank, beyond every island's swimming water (at the last level, with room for the
      // rocks beside it): a cay on a sandy shoal of its own, or rocks.
      let out = 6.1 + .7 * hash(seed, 6), fx = 0, fz = 0;
      const along = (hash(seed, 7) - .5) * 2.4, clear = (x: number, z: number) => chain.every(([cx, cz]) => Math.abs(x - cx) >= SWIM.x + .6 || Math.abs(z - cz) >= SWIM.z + .6);
      do {
        fx = mx + px * side * out + ux * along; fz = mz + pz * side * out + uz * along;
        out += .25;
      } while (!clear(fx, fz) && out < 14);
      if (hash(seed, 8) > .25) cays.push({ x: fx, z: fz, radius: .4 + .18 * hash(seed, 9), palm: hash(seed, 10) > .35 });
      // The rocks beside it lie farther out still (on its seaward side), so they keep clear too.
      const rocky = hash(seed, 8) > .25 ? 1.1 : 0, seaward = Math.atan2(pz * side, px * side);
      for (let k = 0; k < 3; k++) {
        const a = seaward + (hash(seed, 11) - .5) * 1.4 + (k - 1) * .5;
        rocks.push({ x: fx + Math.cos(a) * (rocky + .25 * k), z: fz + Math.sin(a) * (rocky + .25 * k), size: (.18 + .1 * hash(seed, 12 + k)) * (k ? .65 : 1) });
      }
    }
  }
  return { islands: chain, sandbars, cays, rocks };
}

/**
 * The water depth the bank holds the seabed to at (x, z) (units; negative where a cay's sand is dry),
 * or Infinity off the bank, where the ocean's own depth goes on.
 */
export function bankDepth(bank: Bank, x: number, z: number): number {
  // How far outside the bank (negative inside): each island's platform, ragged around it, and the
  // saddles joining neighbours, narrowest midway.
  let outside = Infinity;
  for (const [cx, cz] of bank.islands) {
    const a = Math.atan2(z - cz, x - cx);
    const reach = BANK.platform + BANK.platformVariation * (Math.sin(a * 3 + cx) * .6 + Math.sin(a * 5 - cz) * .4);
    outside = smoothMin(outside, Math.hypot(x - cx, z - cz) - reach, 2);
  }
  for (let i = 0; i < bank.islands.length - 1; i++) {
    const { distance, t } = toSegment(x, z, bank.islands[i], bank.islands[i + 1]);
    outside = smoothMin(outside, distance - BANK.saddle * (1 + 1.4 * (1 - Math.sin(Math.PI * t)) ** 2), 2);
  }
  // Each cay and cluster of rocks stands on a sandy shoal of its own (out on the flanks, joining the
  // bank where it is near enough).
  for (const cay of bank.cays) outside = smoothMin(outside, Math.hypot(x - cay.x, z - cay.z) - cay.radius * BANK.shallows - .4, 1.5);
  for (const rock of bank.rocks) outside = smoothMin(outside, Math.hypot(x - rock.x, z - rock.z) - rock.size * 4 - .25, 1);
  outside += BANK.ragged * ((noise(x * .45 + 3.1, z * .45 - 1.7) - .5) * 1.4 + (noise(x * 1.1 - 5, z * 1.1 + 2) - .5) * .6);
  const off = smoothstep(-BANK.edge, BANK.edge, outside);
  if (off >= 1) return Infinity;
  const [shallow, deep] = BANK.depth;
  let depth = shallow + (deep - shallow) * (noise(x * .38 - 7, z * .38 + 4) * .75 + noise(x * .9, z * .9) * .25);
  for (const bar of bank.sandbars) {
    const { distance: d, t } = toSegment(x, z, bar.from, bar.to);
    // Tapering toward both ends, shallowest along its crest, and only on the bank itself.
    const half = bar.width * (.3 + .7 * Math.sin(Math.PI * t));
    depth = Math.min(depth, depth + (BANK.sandbar.depth - depth) * smoothstep(half * 1.9, half * .2, d) * (1 - off));
  }
  // Off the edge it drops away to the open ocean (a big depth there, so the ocean's own wins).
  if (off > 0) depth += (12 - depth) * off;
  for (const cay of bank.cays) {
    const d = Math.hypot(x - cay.x, z - cay.z);
    // Sandy shallows about it, the sand itself just dry in the middle (whatever the bank's edge does).
    depth = Math.min(depth, depth + (.18 - depth) * smoothstep(cay.radius * BANK.shallows, cay.radius * 1.1, d));
    depth = Math.min(depth, depth + (BANK.cay - depth) * smoothstep(cay.radius * 1.15, cay.radius * .55, d));
  }
  return depth;
}
