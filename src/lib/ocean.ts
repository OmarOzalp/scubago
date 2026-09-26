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
};

export const OCEAN = {
  /** Height of the calm water surface. */
  surfaceLevel: -.18,

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

/**
 * Seabed against distance from the nearest shoreline (negative = inland).
 * `floor` is where the seabed mesh sits; `depth` is the water depth that drives
 * color. Depth keeps growing smoothly past the reef edge, so the turquoise halo
 * fades gradually into open water instead of stopping at a ring.
 */
export function seabedProfile(distance: number, config: OceanConfig = OCEAN) {
  const { shelfWidth, shelfFloor, reefEdge, openDistance, openDepth, floorDrop } = config.seabed;
  // The beach rises gently inland and slopes down to the shelf offshore.
  const beach = distance < 0 ? -.125 - distance * .1 : lerp(-.125, shelfFloor, smoothstep(0, shelfWidth, distance));
  const floor = beach - floorDrop * smoothstep(reefEdge + .06, reefEdge + 1.2, distance);
  // Signed water depth over the beach: negative where the sand rises above the surface.
  const shore = config.surfaceLevel - beach;
  const depth = distance <= 0 ? 0 : Math.max(0, shore) + (openDepth - (config.surfaceLevel - shelfFloor)) * smoothstep(reefEdge, openDistance, distance) ** .8;
  return { floor, depth, wet: shore < 0 ? shore : depth };
}
