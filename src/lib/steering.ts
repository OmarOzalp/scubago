/**
 * Small pieces shared by the island's swimming simulations (src/lib/marine-motion.ts for the
 * large animals, src/lib/tuna-school.ts for the school): the frame the camera shows, the
 * camera's apparent shift, and a few smoothing helpers. Dependency-free.
 */

export const TAU = Math.PI * 2;

/**
 * The ocean area animals keep to, as the camera sees it: a rounded rectangle (half-sizes in
 * units) that keeps a whale shark's fins inside the frame and centers out of most of the top and
 * bottom haze.
 */
export const WORLD = { x: 4.9, z: 4.3 };

/**
 * The camera looks down at an angle, so an animal swimming below the beach appears shifted
 * toward the viewer (+z) by about half its depth below the sand: 0.4 units at the usual depth.
 * The island, islets and frame are judged at that apparent position, which keeps animals from
 * slipping visually under the island's far shore. `depth` is the swimmer's depth offset
 * (negative is deeper).
 */
export const apparentShift = (depth: number) => .4 - .5 * depth;

export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
export const smoothstep = (edge0: number, edge1: number, x: number) => { const t = clamp((x - edge0) / (edge1 - edge0), 0, 1); return t * t * (3 - 2 * t); };
export const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
/** Fraction of the way to close in one step of `dt` seconds when easing at `rate` (1/s). */
export const ease = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);
/** Deterministic 0..1 value per (lane, n): varied, repeatable choices without randomness. */
export const variation = (lane: number, n: number) => { const v = Math.sin(lane * 91.7 + n * 12.9898 + 4.1) * 43758.5453; return v - Math.floor(v); };

/** Where (x, z) sits in the ocean area (1 at its edge), and the inward direction there. */
export function frame(x: number, z: number) {
  const u = x / WORLD.x, v = z / WORLD.z;
  const gx = u ** 5 / WORLD.x, gz = v ** 5 / WORLD.z, g = Math.hypot(gx, gz) || 1;
  return { edge: (u ** 6 + v ** 6) ** (1 / 6), nx: -gx / g, nz: -gz / g };
}
