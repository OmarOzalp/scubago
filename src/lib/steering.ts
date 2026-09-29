/**
 * Small pieces shared by the island's swimming simulations (src/lib/marine-motion.ts for the
 * large animals, src/lib/tuna-school.ts for the school): the frame the camera shows, the
 * camera's apparent shift, and a few smoothing helpers. Dependency-free.
 */

export const TAU = Math.PI * 2;

/**
 * The ocean area animals keep to, as the camera sees it: a rounded rectangle (half-sizes in
 * units) that keeps a whale shark's fins inside the frame and centers out of most of the top and
 * bottom haze. This is the first level's; the ocean grows with the island (OCEAN_GROWTH).
 */
export const WORLD = { x: 4.9, z: 4.3 };
export type World = { x: number; z: number };

/**
 * As the island levels up, the usable ocean around it widens and the camera pulls back to match,
 * so a growing collection gets more room while the island stays readable. Animals keep their
 * size: only the space and the view grow.
 */
export const OCEAN_GROWTH = {
  /** How much larger the ocean area (and the camera's view) is at each level, 1 to 6. */
  scale: [1, 1.03, 1.07, 1.11, 1.16, 1.2] as readonly number[],
  /** How much farther out animals and the tuna school may roam, per unit of extra scale (units). */
  roam: 2.5,
  /** How quickly the space and the view ease to a new level's (1/s): about 3 s to settle. */
  ease: 1.1,
};
/** The ocean's scale at a level (clamped to the levels there are). */
export const oceanScale = (level: number) => OCEAN_GROWTH.scale[Math.max(0, Math.min(OCEAN_GROWTH.scale.length - 1, Math.round(level) - 1))];
/** The ocean area at a level. */
export const worldFor = (level: number): World => ({ x: WORLD.x * oceanScale(level), z: WORLD.z * oceanScale(level) });
/** Extra roaming room at a level (units). */
export const roamFor = (level: number) => (oceanScale(level) - 1) * OCEAN_GROWTH.roam;

/**
 * The camera looks down at an angle, so an animal swimming below the beach appears shifted
 * toward the viewer (+z) by about half its depth below the sand: 0.4 units at the usual depth.
 * The island, islets and frame are judged at that apparent position, which keeps animals from
 * slipping visually under the island's far shore. `depth` is the swimmer's depth offset
 * (negative is deeper).
 */
export const apparentShift = (depth: number) => .4 - .5 * depth;

/**
 * How far up or down the view a point (height `y`, depth into the scene `z`) appears, as a share of
 * the half-height the camera shows at this ocean scale: 0 at the center, 1 at the top or bottom
 * edge. The camera looks down at (0, -.15, 0) from (0, 12, 6), so height lifts a point up the view
 * and +z brings it down; the edges fade into haze from about .58 (OCEAN.edgeFade).
 */
export const viewHeight = (y: number, z: number, scale = 1) => (.4428 * (y + .15) - .8966 * z) / (5.4 * scale);

/**
 * What the camera shows at world height `y`, as world (x, z): x within ±`x`, z from `top` (far, up the
 * view) to `bottom` (near). The camera fits the ocean's 10.8 × scale units across the canvas's
 * shorter side (scene-camera.tsx), so a wider canvas (`aspect` = width / height) shows more water at
 * the sides. Where an arriving animal starts, out of sight.
 */
export function viewBounds(y: number, scale = 1, aspect = 1) {
  const half = 5.4 * scale, halfHeight = half * Math.max(1, 1 / aspect);
  const lift = .4428 * (y + .15);
  return { x: half * Math.max(1, aspect), top: (lift - halfHeight) / .8966, bottom: (lift + halfHeight) / .8966 };
}

export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
export const smoothstep = (edge0: number, edge1: number, x: number) => { const t = clamp((x - edge0) / (edge1 - edge0), 0, 1); return t * t * (3 - 2 * t); };
export const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
/** Fraction of the way to close in one step of `dt` seconds when easing at `rate` (1/s). */
export const ease = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);
/** Deterministic 0..1 value per (lane, n): varied, repeatable choices without randomness. */
export const variation = (lane: number, n: number) => { const v = Math.sin(lane * 91.7 + n * 12.9898 + 4.1) * 43758.5453; return v - Math.floor(v); };

/** Where (x, z) sits in the ocean area (1 at its edge), and the inward direction there. Products stand in for powers: it is asked often. */
export function frame(x: number, z: number, world: World = WORLD) {
  const u = x / world.x, v = z / world.z, u2 = u * u, v2 = v * v, u4 = u2 * u2, v4 = v2 * v2;
  const gx = u4 * u / world.x, gz = v4 * v / world.z, g = Math.sqrt(gx * gx + gz * gz) || 1;
  return { edge: Math.pow(u4 * u2 + v4 * v2, 1 / 6), nx: -gx / g, nz: -gz / g };
}
