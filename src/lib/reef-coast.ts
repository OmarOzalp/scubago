import { islandScale, SEABED_PROPS, shoreDistance, shorePolygons } from './island-outline';
import { OCEAN, reefShape, seabedProfile, shelfStretch } from './ocean';
import { REEF_ANEMONE, reefRocks } from './reef-life';
import { smoothstep } from './steering';

/**
 * The Coral Reef's coral, as plain data for the scene (reef-coast.tsx) and the ocean's depth map
 * (ocean-mesh.ts): bommies scattered over the outer lagoon, more of them with every level, and
 * smaller corals crowding the crest's inner slope up to just under the surface (the crest itself is
 * OCEAN.reefCrest). Every one in world units from the island's middle, standing on the seabed as it
 * is drawn, and clear of the reef's dens, anemone and props, which lie nearer the shore (reef-life.ts).
 * The same every time.
 */
export const CORAL = {
  /** The outer lagoon's bommies: their shelf reach, and the share of the places there filled at level 1 and each level more. */
  lagoon: [1, 1.3] as const, cover: [.3, .08] as const,
  /** The crest's corals: their shelf reach (up its inner slope), the share of the places there filled, and the least water over them (units). */
  crest: [1.34, 1.47] as const, crestCover: .55, clearance: .05,
  /** Candidate places lie on a jittered grid this far apart (units), out to this far from the middle. */
  step: .19, extent: 5.4,
  /** Room each keeps from the seabed props (SEABED_PROPS), the jetty's boat and the reef's dens and rocks (units; its anemones' tentacles keep their own reach). */
  clear: .5,
};

/**
 * The jetty out from the beach on the island's north side, and the dive boat moored at its end: the
 * angle it runs out at (radians about the island's middle, x to the right and z toward the viewer; the
 * one stretch of shore with no den, rock, anemone or small life's home off it), how far past the
 * shore it reaches and the boat lies (island units, before the level's scale).
 */
export const JETTY = { angle: 280 * Math.PI / 180, out: .62, boat: .9 };

const hash = (a: number, b: number) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };

/** Where the jetty leaves the sand and ends, and the boat lies, along its line (island units from the middle). */
export const jettyLine = (() => {
  const main = shorePolygons(1, 24, 'reef').slice(0, 1), ux = Math.cos(JETTY.angle), uz = Math.sin(JETTY.angle);
  let lo = 0, hi = 6;
  for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (shoreDistance(main, ux * mid, uz * mid) < 0) lo = mid; else hi = mid; }
  return { from: lo - .14, to: lo + JETTY.out, boat: lo + JETTY.boat };
})();

/** Where the jetty's boat lies at this level (world units from the island's middle). */
export function jettyBoat(level: number) {
  const r = jettyLine.boat * islandScale(level);
  return { x: Math.cos(JETTY.angle) * r, z: Math.sin(JETTY.angle) * r };
}

export type CoralKind = 'boulder' | 'brain' | 'table' | 'branching' | 'soft';
/** A coral head: its middle on the seabed (x, floor, z), its radius and height (units), what it is, and a seed for its shape. */
export type CoralHead = { x: number; z: number; floor: number; radius: number; height: number; kind: CoralKind; seed: number; crest: boolean };

/** The Coral Reef's coral heads at this level. */
export function coralHeads(level: number): CoralHead[] {
  const polygons = shorePolygons(level, 24, 'reef'), scale = islandScale(level);
  // Every den, rock and anemone the reef could have (the most morays, octopuses and clownfish it gives homes to).
  const { dens, rocks, anemones } = reefRocks(level, 2, 3, 2);
  const keepClear = [...Object.values(SEABED_PROPS).map(([x, z]) => ({ x: x * scale, z: z * scale })), jettyBoat(level), ...dens.flat(), ...rocks];
  const cover = CORAL.cover[0] + CORAL.cover[1] * (level - 1);
  const heads: CoralHead[] = [];
  const { step, extent } = CORAL;
  for (let row = 0, z = -extent; z <= extent; row++, z += step * .87) {
    for (let col = 0, x = -extent; x <= extent; col++, x += step) {
      const px = x + (row % 2) * step / 2 + (hash(col, row) - .5) * step * .7, pz = z + (hash(row + 31, col) - .5) * step * .7;
      const distance = shoreDistance(polygons, px, pz);
      if (distance <= 0) continue;
      // Measured along with the crest as it wanders in and out (OCEAN.reefShape), so neither strays onto the other.
      const reach = distance / shelfStretch(px, pz), along = reach - reefShape(px, pz).shift;
      const inLagoon = reach >= CORAL.lagoon[0] && along <= CORAL.lagoon[1], onCrest = along >= CORAL.crest[0] && along <= CORAL.crest[1];
      if (!inLagoon && !onCrest) continue;
      // Clustered: patch reefs here and there across the lagoon with bare sand between, the crest crowded.
      const patch = smoothstep(.35, .75, hash(Math.floor(px * 1.2 + 7), Math.floor(pz * 1.2 - 3)));
      if (hash(px * 13.7, pz * 7.3) > (onCrest ? CORAL.crestCover : cover * 2.2 * patch)) continue;
      if (keepClear.some((p) => Math.hypot(p.x - px, p.z - pz) < CORAL.clear)) continue;
      if (anemones.some((p) => Math.hypot(p.x - px, p.z - pz) < REEF_ANEMONE.radius + .15)) continue;
      const floor = seabedProfile(reach, OCEAN, { x: px, z: pz }).floor, room = OCEAN.surfaceLevel - CORAL.clearance - floor;
      const seed = Math.round(hash(px, pz) * 1e4), roll = hash(seed, 3);
      const radius = onCrest ? .05 + .05 * hash(seed, 5) : .08 + .13 * hash(seed, 5) * smoothstep(0, 1, hash(seed, 7) + .3);
      const height = Math.min(room, radius * (onCrest ? .7 : .9));
      if (height < .02) continue;
      const kind: CoralKind = onCrest
        ? (roll < .45 ? 'branching' : roll < .75 ? 'table' : 'soft')
        : (roll < .18 ? 'boulder' : roll < .32 ? 'brain' : roll < .52 ? 'table' : roll < .85 ? 'branching' : 'soft');
      heads.push({ x: px, z: pz, floor, radius, height, kind, seed, crest: onCrest });
    }
  }
  return heads;
}
