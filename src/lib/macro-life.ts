import { islandScale, SEABED_PROPS, shoreDistance, shorePolygons } from './island-outline';
import { locate, REEF, REEF_ANEMONE, REEF_SIZE, reefRocks } from './reef-life';
import { smoothstep } from './steering';
import type { DexEntry } from './types';

/**
 * The reef's small life (docs/island-explorer.md, "Macro life"): the macro species a diver has logged,
 * each at home in its own spot on the shelf near the beach, where the water is shallow enough to see
 * them. Too small to make out from the Home card, they are drawn only in the island explorer, and
 * come into view as it zooms in close (macroPresence). Their homes (a sea fan, a blue starfish, a
 * coral head, a ledge…) show from farther out, as a hint of where to look.
 */
export const MACRO_SPECIES = {
  'anna-chromodoris': 'chromodoris',
  'pikachu-nudibranch': 'pikachu',
  'spanish-dancer': 'dancer',
  'pygmy-seahorse': 'seahorse',
  'ornate-ghost-pipefish': 'pipefish',
  'harlequin-shrimp': 'harlequin',
  'peacock-mantis-shrimp': 'mantis',
  'caribbean-spiny-lobster': 'lobster',
  'christmas-tree-worm': 'tree-worms',
  'giant-clam': 'clam',
} as const;
export type MacroSpecies = keyof typeof MACRO_SPECIES;
export type MacroKind = (typeof MACRO_SPECIES)[MacroSpecies];
export const isMacroSpecies = (id: string): id is MacroSpecies => Object.hasOwn(MACRO_SPECIES, id);

export const MACRO = {
  /**
   * The explorer's zoom (screen points per world unit) at which the creatures start to come into
   * view, and are fully in view. The Home card is 31; a phone's explorer starts at about 57.
   */
  appear: 100, clear: 150,
  /** How far each creature's home reaches from its middle (units): perches keep this clear of the reef's props. */
  radius: { chromodoris: .16, pikachu: .14, dancer: .2, seahorse: .2, pipefish: .18, harlequin: .2, mantis: .2, lobster: .3, 'tree-worms': .2, clam: .22 } satisfies Record<MacroKind, number>,
};

/**
 * Each creature's home: degrees around the island (0 to the right of the view, 90 toward the
 * camera) and how far out on the shelf (reach: the beach meets the shelf at .62). Clear of the
 * corals, the reef rock, every moray's dens (and the moray resting half out of one), octopus's
 * rock and anemone (all at once), the islets and one another, at every level; the camera side is
 * the most crowded, so homes there sit nearer the beach.
 */
const HOMES: Record<MacroKind, { angle: number; reach: number }> = {
  lobster: { angle: 0, reach: .5 },
  pikachu: { angle: 30, reach: .5 },
  'tree-worms': { angle: 84, reach: .3 },
  seahorse: { angle: 111, reach: .32 },
  harlequin: { angle: 138, reach: .32 },
  dancer: { angle: 185, reach: .28 },
  mantis: { angle: 240, reach: .5 },
  clam: { angle: 264, reach: .44 },
  pipefish: { angle: 298, reach: .45 },
  chromodoris: { angle: 332, reach: .38 },
};

/** A creature's home on the reef. */
export type MacroHome = {
  species: MacroSpecies; kind: MacroKind;
  /** Where it is (world x, z) and the bottom's height there (world y). */
  x: number; z: number; floor: number;
  /** The way out to sea from there (a unit vector); along the coast is (-outZ, outX). */
  outX: number; outZ: number;
};

/** The reef's props a home keeps clear of at this level (x, z and how far each reaches, units). */
export function reefProps(level: number) {
  const scale = islandScale(level), { dens, rocks, anemones } = reefRocks(level, 2, 3, 2);
  return [
    ...Object.entries(SEABED_PROPS).map(([name, [x, z]]) => ({ x: x * scale, z: z * scale, radius: name === 'reefRock' ? .25 : .3 })),
    // A den's boulder with a smaller one either side; an octopus's rock with its stone.
    ...dens.flat().map((d) => ({ x: d.x, z: d.z, radius: .36 })),
    // A moray resting half out of its den: its body along the seabed from the den's mouth to its head.
    ...dens.flat().flatMap((d) => [0, .25, .5, .75, 1].map((t) => {
      const out = t * (1 - REEF.moray.inside) * REEF_SIZE['giant-moray'];
      return { x: d.spotX + d.dirX * out, z: d.spotZ + d.dirZ * out, radius: .1 };
    })),
    ...rocks.map((r) => ({ x: r.x, z: r.z, radius: .3 })),
    ...anemones.map((a) => ({ x: a.x, z: a.z, radius: REEF_ANEMONE.radius })),
  ];
}

const homeCache = new Map<number, Map<MacroKind, Omit<MacroHome, 'species'>>>();
/** The homes of these species at this level (found once per level; they move out as the island grows). */
export function macroHomes(level: number, species: readonly MacroSpecies[]): MacroHome[] {
  let homes = homeCache.get(level);
  if (!homes) {
    const polygons = shorePolygons(level);
    homes = new Map((Object.keys(HOMES) as MacroKind[]).map((kind) => {
      const place = locate(polygons, HOMES[kind].angle, HOMES[kind].reach);
      return [kind, { kind, x: place.x, z: place.z, floor: place.floor, outX: place.nx, outZ: place.nz }];
    }));
    homeCache.set(level, homes);
  }
  const found = homes;
  return species.map((id) => ({ species: id, ...found.get(MACRO_SPECIES[id])! }));
}

/** How far the island's water is from a home (units): its distance to the nearest dry land, islets included. */
export const shoreGap = (level: number, home: Pick<MacroHome, 'x' | 'z'>) => shoreDistance(shorePolygons(level), home.x, home.z);

/** How much in view the creatures are at the explorer's zoom (0 to 1). */
export const macroPresence = (zoom: number) => smoothstep(MACRO.appear, MACRO.clear, zoom);

/** The diver's logged macro species, in the order they were logged. */
export function macroResidents(residents: readonly DexEntry[]): MacroSpecies[] {
  return residents.map((r) => r.species.id).filter(isMacroSpecies);
}
