import type { Habitat } from '@/lib/home';

/**
 * Ocean look and motion around the island, in one place for tuning.
 *
 * Colors are sRGB hex. Distances are world units (the island is about 4.3
 * across). "Depth" means water depth: how far the seabed (or an animal) is
 * below the surface. The shaders that use these live in
 * src/components/home/three/ocean-mesh.ts and underwater-material.ts.
 */
export type WaveLayer = {
  /** Crest height above the mean surface. */
  amplitude: number;
  /** Distance between crests. Longer waves read as slow, broad swells. */
  wavelength: number;
  /** How fast crests travel across the water (units/s). */
  speed: number;
  /** Direction of travel in degrees (0 = +X, 90 = +Z). */
  direction: number;
  /** 0..1: how much crests roll forward (Gerstner). Keep low for calm water. */
  roll: number;
};

export type OceanPalette = {
  /** Water body color by depth: bright turquoise shallows, blue-teal mid-water, richer deep blue-teal. */
  shallow: string; mid: string; deep: string;
  /** Sand under very shallow water, the wet beach just above it, and seagrass patches on the shelf. */
  sandShallow: string; sandWet: string; patch: string;
  /** Sky color the surface reflects, sun highlight color and the thin shore foam. */
  sky: string; sun: string; foam: string;
  /**
   * Murkier water than the defaults (OCEAN.underwater.visibility, seabedVisibility, opacity): how far
   * animals and kelp can be seen into it, how quickly the seabed fades, and the surface's opacity.
   */
  clarity?: { visibility: number; seabed: number; opacity: readonly [number, number] };
};

export const OCEAN = {
  /** Height of the calm water surface. */
  surfaceLevel: -.18,
  /** The water surface reaches this far from the island's middle (units) each way: past it there is no water to see. */
  waterExtent: 8.6,

  // Waves: several layers traveling in different directions so the surface never repeats.
  waves: {
    large: { amplitude: .032, wavelength: 7.5, speed: .38, direction: 20, roll: .35 },
    cross: { amplitude: .013, wavelength: 4.7, speed: .3, direction: 112, roll: .3 },
    medium: { amplitude: .011, wavelength: 2.4, speed: .26, direction: -38, roll: .3 },
    small: { amplitude: .0045, wavelength: 1.1, speed: .2, direction: 64, roll: .2 },
  } satisfies Record<string, WaveLayer>,
  /** Waves flatten out over this water depth so the waterline laps gently. */
  waveShoaling: .35,
  /** Size of the surface facets (lattice spacing). Smaller = smoother, more triangles. */
  facetSize: .42,

  palettes: {
    island: { shallow: '#45D3CA', mid: '#2DA5C0', deep: '#1F84A2', sandShallow: '#EEE5C4', sandWet: '#D9CEAB', patch: '#8FB29B', sky: '#EAF6F4', sun: '#FFF8E4', foam: '#F7FCFA' },
    lagoon: { shallow: '#4DDAC9', mid: '#33AEC2', deep: '#2189A5', sandShallow: '#F1E9CB', sandWet: '#DBD1AE', patch: '#93B8A0', sky: '#EAF6F4', sun: '#FFF8E4', foam: '#F7FCFA' },
    cove: { shallow: '#52CDBB', mid: '#34A2AE', deep: '#217C90', sandShallow: '#E3E1C2', sandWet: '#CFCBA8', patch: '#86A896', sky: '#E8F3EF', sun: '#FFF8E4', foam: '#F4FAF6' },
    // Cold, plankton-rich water over a rocky reef: green-teal shallows over pale rock and coralline
    // pink, deepening to a dark blue-green; murkier than the tropics, so the kelp and the animals fade
    // into it with depth.
    kelp: {
      shallow: '#3D8475', mid: '#2A6F6B', deep: '#1A4F58', sandShallow: '#726D5C', sandWet: '#55514A', patch: '#866C66', sky: '#E2ECE8', sun: '#FFF6E2', foam: '#F2F7F4',
      clarity: { visibility: 1.5, seabed: .32, opacity: [.2, .38] },
    },
    // Clear, current-swept oceanic water over black volcanic sand and rock: bright blue-teal shallows
    // over the dark bottom, deepening fast to cobalt; clearer than the reef's, so the animals and the
    // seabed show a long way down.
    volcanic: {
      shallow: '#2E9DBA', mid: '#2272B0', deep: '#174B93', sandShallow: '#5A5856', sandWet: '#3A3938', patch: '#44524B', sky: '#E4EDF6', sun: '#FFF8E8', foam: '#F5F9FC',
      clarity: { visibility: 3.6, seabed: .55, opacity: [.13, .26] },
    },
    // A warm, shallow lagoon: bright green-turquoise shallows over pale sand and dark seagrass
    // meadows, deepening to a soft teal; a little cloudier than the reef's water, tannin-tinted
    // near the roots.
    mangrove: {
      shallow: '#4ACBB0', mid: '#2DA39F', deep: '#1E7F8C', sandShallow: '#E8DFBC', sandWet: '#D2C69F', patch: '#355E35', sky: '#EAF5EF', sun: '#FFF8E4', foam: '#F6FBF7',
      clarity: { visibility: 2.3, seabed: .46, opacity: [.17, .31] },
    },
    // Gin-clear water over white sand: bright aquamarine shallows deepening to sapphire, the clearest
    // of all, so the wreck and the animals round her show a long way down.
    wreck: {
      shallow: '#4FD0D6', mid: '#2A92C6', deep: '#1B5F9F', sandShallow: '#F1ECD9', sandWet: '#D9D0B6', patch: '#93ACA2', sky: '#E6F2F6', sun: '#FFF8E6', foam: '#F6FAFC',
      clarity: { visibility: 3.4, seabed: .6, opacity: [.12, .26] },
    },
  } satisfies Record<Habitat, OceanPalette>,

  // Water depth at which the body color reaches each stop (shallow -> mid -> deep).
  shoreDepthRange: { mid: 1.1, deep: 3.2 },

  // Surface layer: mostly clear, so the life below stays visible.
  opacity: { shallow: .16, deep: .3 },
  /** Surface fades to fully clear at the waterline over this depth. */
  shoreClearDepth: .09,
  /** Brightness variation between wave facets (0 = flat, 1 = strongly faceted). */
  facetShading: .4,
  /** Sky reflection: overall strength and the Fresnel curve (higher power = only grazing facets reflect). */
  reflection: { strength: .5, power: 3, base: .04 },
  /** Direction toward the sun, shared with the island's light: facets tilted toward it read brighter. */
  sun: [-3, 8, 4] as [number, number, number],
  /**
   * Soft sun highlights, only on the facets that tilt toward the sun: the tilt (degrees) that
   * catches the most light and how gradually it falls off (degrees). Flat water stays unlit.
   * `softness` blends each facet's flat normal with the smooth wave normal (0 = crisp facets).
   */
  specular: { strength: .14, tilt: 3.3, spread: 1.1, softness: .6 },
  /** Thin foam where the water meets the sand; 0 disables it. */
  foam: { strength: .6, depth: .05 },

  // Seabed shape, by distance from the shoreline: a beach slope down to a sandy shelf, then the reef
  // edge where the water keeps deepening smoothly into open ocean.
  seabed: { shelfWidth: .62, shelfFloor: -.62, reefEdge: .72, openDistance: 3.6, openDepth: 3.4, floorDrop: 1.25 },
  /**
   * The Coral Reef's seabed (Home's island) goes on past the shelf as a broad, sandy lagoon to a reef
   * crest: where it rises out of the lagoon, its top, its outer edge and the foot of its outer slope
   * (shelf reach), the height of its top (just under the surface, where the swell breaks), and its
   * coral's colors (a mottle of these, linear sRGB after conversion). Just past the coral the outer slope
   * falls away as a steep wall (`wall`: from and to, shelf reach) to a floor `drop` deeper than any other
   * island's, so that water deep enough for the biggest animals starts inside the picture, not past its edge.
   */
  reefCrest: { rise: 1.32, top: 1.48, edge: 1.8, foot: 2.75, wall: [1.96, 2.16] as readonly [number, number], drop: .6, height: -.212, coral: ['#9A7A55', '#7D6A5E', '#8A8C5C', '#BBA57E', '#B98272'] },
  /**
   * The crest is never a neat ring: it wanders in and out (shelf reach), its outer edge is cut into
   * spurs and grooves, and boat passes break it (the angles about the island's middle, radians, and
   * their half-width), where the lagoon opens to the sea.
   */
  reefShape: { wander: .32, grooves: .1, passes: [2.05, -.35] as readonly number[], pass: .16 },
  /** How much the shelf widens and narrows around the coast (0 = a uniform ring). */
  shelfVariation: .32,
  /** Darker seagrass and rubble patches on the shelf (0 = plain sand). */
  seabedPatches: .5,
  /** How quickly the seabed disappears into the water color with depth (units). */
  seabedVisibility: .42,
  /** Low-poly light and shade on the seabed relief. */
  seabedFacetShading: .2,

  // Animals seen through the water.
  underwater: {
    /** Depth before any tint begins; animals near the surface stay crisp. */
    clearDepth: .35,
    /** Distance over which animals take on most of the water color (bigger = clearer water). */
    visibility: 2.8,
    /** Most tint an animal can take on before it dives out of sight. */
    tintStrength: .8,
    /** How much color drains away with depth. */
    desaturation: .35,
    /** Apparent wobble of animals seen through moving waves (units per unit of depth). */
    distortion: 1,
  },

  /** Screen-space haze at the top and bottom of the view that blends everything into the card color (0 = center, 1 = edge). */
  edgeFade: { start: .58, end: 1 },
};

export type OceanConfig = typeof OCEAN;

/** Waves as the shaders use them: unit direction, wavenumber, amplitude, angular speed, roll, phase. */
export function waveTerms(config: OceanConfig = OCEAN) {
  return Object.values(config.waves).map((wave, i) => {
    const angle = wave.direction * Math.PI / 180;
    const k = Math.PI * 2 / wave.wavelength;
    return { dx: Math.cos(angle), dz: Math.sin(angle), k, amplitude: wave.amplitude, omega: k * wave.speed, roll: wave.roll, phase: i * 1.7 };
  });
}

/** CPU twin of the surface displacement in the water shader (before shoaling). */
export function waveOffset(x: number, z: number, time: number, config: OceanConfig = OCEAN) {
  let ox = 0, oy = 0, oz = 0;
  for (const w of waveTerms(config)) {
    const phase = w.k * (w.dx * x + w.dz * z) - w.omega * time + w.phase;
    oy += w.amplitude * Math.sin(phase);
    const r = w.roll * w.amplitude * Math.cos(phase);
    ox += w.dx * r; oz += w.dz * r;
  }
  return { x: ox, y: oy, z: oz };
}

/**
 * Slow, irregular variation of the shelf width around the coast, so the shallows read as
 * reef geology instead of a uniform ring (above 1 the shelf reaches farther out).
 */
export function shelfStretch(x: number, z: number, config: OceanConfig = OCEAN) {
  const n = Math.sin(x * .83 + 1.3) * Math.sin(z * 1.07 - .4) * .6 + Math.sin((x - z) * .61 + 2.1) * .4;
  return 1 + config.shelfVariation * n;
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const noiseHash = (x: number, y: number) => { const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return v - Math.floor(v); };
/** Smooth value noise in 0..1 with features about one unit across. */
function valueNoise(x: number, z: number) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = noiseHash(ix, iz), b = noiseHash(ix + 1, iz), c = noiseHash(ix, iz + 1), d = noiseHash(ix + 1, iz + 1);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

/**
 * Seagrass and rubble on the shelf at (x, z) in an island's own frame, `distance` (its shelf reach)
 * from the shore: soft-edged patches (0 to 1) that thin out over deep water. The seabed is painted
 * with them (ocean-mesh.ts), and the Mangroves & Seagrass island's meadows grow on them (seagrass.ts).
 */
export function seabedPatch(x: number, z: number, distance: number) {
  const n = valueNoise(x * 1.7 + 11, z * 1.7 - 5) * .65 + valueNoise(x * 4.1 - 3, z * 4.1 + 7) * .35;
  return smoothstep(.52, .72, n) * smoothstep(.06, .3, distance) * (1 - smoothstep(1.4, 2.4, distance));
}

/**
 * Seabed against distance from the nearest shoreline (negative = inland).
 * `floor` is where the seabed mesh sits; `depth` is the water depth that drives
 * color. Depth keeps growing smoothly past the reef edge, so the turquoise halo
 * fades gradually into open water instead of stopping at a ring.
 */
export function seabedProfile(distance: number, config: OceanConfig = OCEAN, reef?: { x: number; z: number; main?: number }) {
  if (reef && distance > 0) return reefProfile(distance, reef.x, reef.z, config, reef.main);
  const { shelfWidth, shelfFloor, reefEdge, openDistance, openDepth, floorDrop } = config.seabed;
  // The beach rises gently inland and slopes down to the shelf offshore.
  const beach = distance < 0 ? -.125 - distance * .1 : lerp(-.125, shelfFloor, smoothstep(0, shelfWidth, distance));
  const floor = beach - floorDrop * smoothstep(reefEdge + .06, reefEdge + 1.2, distance);
  // Signed water depth over the beach: negative where the sand rises above the surface.
  const shore = config.surfaceLevel - beach;
  const depth = distance <= 0 ? 0 : Math.max(0, shore) + (openDepth - (config.surfaceLevel - shelfFloor)) * smoothstep(reefEdge, openDistance, distance) ** .8;
  return { floor, depth, wet: shore < 0 ? shore : depth };
}

/**
 * The Coral Reef's seabed offshore (`reefCrest`): the same beach and shelf as any island's, but where
 * a shelf would drop away, a lagoon of pale sand runs on at the shelf's depth to the reef crest, which
 * rises almost to the surface, then the reef's outer slope falls to the deep floor and the water goes
 * on deepening into the open ocean as any island's does.
 */
function reefProfile(distance: number, x: number, z: number, config: OceanConfig, main?: number) {
  const { shelfWidth, shelfFloor, reefEdge, openDistance, openDepth, floorDrop } = config.seabed;
  const { rise, top, edge, foot, height, wall, drop } = config.reefCrest;
  const { shift, groove, open } = reefShape(x, z, config);
  const beach = lerp(-.125, shelfFloor, smoothstep(0, shelfWidth, distance));
  const d = distance - shift, outer = smoothstep(edge + groove, foot, d);
  // Where a pass breaks the crest, the lagoon's floor runs on out to the reef's outer slope; past the coral, it falls away as a wall to the deep floor.
  const slope = lerp(beach, height, smoothstep(rise, top, d) * (1 - outer) * (1 - open)) - floorDrop * outer;
  // (the wall belongs to the reef round the main island: where an islet's shelf is nearer than its, over a few tenths of a unit, the slope is the usual one)
  const floor = lerp(slope, shelfFloor - floorDrop - drop, smoothstep(wall[0], wall[1], d) * (main === undefined ? 1 : 1 - smoothstep(0, .3, main - distance)));
  // Past the crest the water deepens toward the open ocean's depth, never shallower than over the floor.
  const over = Math.max(0, config.surfaceLevel - floor), deep = config.surfaceLevel - (shelfFloor - floorDrop);
  const depth = over + Math.max(0, openDepth - deep) * smoothstep(edge, edge + openDistance - reefEdge, d) ** .8;
  return { floor, depth, wet: depth };
}

/** How far the crest wanders out here (reach), how far its outer edge is cut back by a groove, and how open a pass leaves it (0 to 1), at (x, z) in the island's frame. */
export function reefShape(x: number, z: number, config: OceanConfig = OCEAN) {
  const { wander, grooves, passes, pass } = config.reefShape;
  const a = Math.atan2(z, x);
  const shift = (valueNoise(x * .9 + 3, z * .9 - 7) - .5) * wander + (valueNoise(x * 2.4 - 1, z * 2.4 + 5) - .5) * wander * .35;
  // Spurs and grooves: narrow fingers of reef reaching out, the sand between them.
  const groove = -grooves * smoothstep(.55, .85, Math.abs(Math.sin(a * 23 + valueNoise(x * 2, z * 2) * 3)));
  const open = Math.max(0, ...passes.map((p) => 1 - smoothstep(pass * .45, pass, Math.abs(Math.atan2(Math.sin(a - p), Math.cos(a - p))))));
  return { shift, groove, open };
}

/**
 * How much of the seabed at shelf reach `distance` from the Coral Reef's shore is its crest's coral
 * (0 to 1), and how much of that is the crest's seaward edge, where the swell breaks into surf. (x, z),
 * in the island's own frame, breaks both up along the reef.
 */
export function reefCrestAt(x: number, z: number, distance: number, config: OceanConfig = OCEAN) {
  const { rise, top, edge } = config.reefCrest;
  const { shift, groove, open } = reefShape(x, z, config);
  const d = distance - shift + (valueNoise(x * 2.3 + 4, z * 2.3 - 9) - .5) * .12;
  const coral = smoothstep(rise - .08, rise + .1, d) * (1 - smoothstep(edge + groove + .02, edge + groove + .24, d)) * (1 - open * .85);
  const surf = coral * smoothstep(top - .02, edge + groove, d) * (1 - open) * (.55 + .45 * smoothstep(.25, .6, valueNoise(x * 1.3 - 2, z * 1.3 + 6)));
  return { coral, surf };
}
