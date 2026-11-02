import type { Habitat } from '@/lib/home';

/**
 * Every kind of heavy program (the big Lambert and Phong shaders: the ocean's own are small) a scene can come to need, named by what uses it.
 * Each is linked by drawing nothing: a stand-in object made with the very same material code the scene's own uses.
 */
export type WarmKind =
  /** The seabed and the water's surface (lite: its one layer). */
  | 'ocean'
  /** The shores' flat-shaded, vertex-colored solids, one-sided (kelp, volcanic, mangrove coasts, the bank's cays) and two-sided (the reef's and the wreck's). */
  | 'coast'
  /** Every animal: one program for all of them, reef and open water alike (marine-colors.ts, underwater-material.ts). */
  | 'animals'
  /** What the reef and the wreck have on the bottom, tinted by the water: coral heads and the sunken wreck, rocks and anemones, the small life. */
  | 'reef'
  | 'kelp'
  | 'seagrass'
  /** The volcano's steam. */
  | 'steam'
  /** The tuna school. */
  | 'school'
  /** An islet rising out of the water at a level-up (islet-material.ts). */
  | 'islet';

/**
 * Which kinds the shores of these islands (and the tuna school) bring. Every scene has an ocean and animals; the rest depends on the island: the
 * reef's corals, rocks and small life, the wreck's sunken hull, the kelp forest, the mangroves' seagrass, the volcano's steam, and the coasts' own
 * solids and rising islets.
 */
export function kindsFor(habitats: readonly Habitat[], school = false): WarmKind[] {
  const kinds = new Set<WarmKind>(['ocean', 'animals', 'coast']);
  for (const habitat of habitats) {
    kinds.add('islet');
    if (habitat === 'kelp') kinds.add('kelp');
    else if (habitat === 'volcanic') kinds.add('steam');
    else if (habitat === 'mangrove') kinds.add('seagrass');
    else kinds.add('reef');
  }
  if (school) kinds.add('school');
  return [...kinds];
}
