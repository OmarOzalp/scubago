import {
  BufferGeometry, Color, DataTexture, DoubleSide, Float32BufferAttribute, LinearFilter, Mesh, RGBAFormat, ShaderMaterial,
  Uint16BufferAttribute, UnsignedByteType, Vector2, Vector3, Vector4,
} from 'three';
import type { Habitat } from '@/lib/home';
import { OCEAN, reefCrestAt, seabedPatch, waveTerms, type OceanConfig } from '@/lib/ocean';
import { coralHeads } from '@/lib/reef-coast';
import { createSeabedField, type OceanIsland } from '@/lib/seabed';
import { hash, oceanBox, type WaterExtent } from '@/lib/seabed-lattice';

/**
 * The ocean around the islands: a low-poly water surface displaced by several
 * wave layers, a seabed that rises into a turquoise shelf around each island, and
 * the uniforms the swimming animals share so they tint and wobble with the same water.
 *
 * One ocean holds every island in view (one on Home's card, the whole archipelago in
 * the explorer: `OceanIsland`). Each island's water has its own palette, blending into
 * its neighbours' across the open water between them (the region map).
 *
 * Cost: waves are evaluated per vertex (about 2k vertices around one island); each
 * surface pixel does a depth and a region lookup and a few lighting terms. No render
 * targets, depth textures or post-processing.
 */

/**
 * The depth map reaches `margin` units past every island's middle (past it the water is
 * open ocean, which the map's edge texels carry on), at `perUnit` texels a unit (128 across
 * one island's 18 units). `maxDepth` is the deepest depth it encodes.
 */
const DEPTH = { margin: 9, perUnit: 128 / 18, maxDepth: 4 };
/** How many different waters (palettes) one ocean blends: one channel each of the region maps (four to a map). */
export const OCEAN_REGIONS = 8;
/** How gradually one island's water gives way to the next across the open water between them (units). */
const REGION_BLEND = 2.4;
/** The palette colors each region carries (see regionGlsl), in order, and their names there (`patch` is reserved in GLSL ES 3). */
const REGION_COLORS = ['shallow', 'mid', 'deep', 'sandShallow', 'sandWet', 'patch', 'sky'] as const;
const REGION_NAMES = ['shallow', 'mid', 'deep', 'sandShallow', 'sandWet', 'seagrass', 'sky'] as const;
const WAVES = Object.keys(OCEAN.waves).length;

export type { OceanIsland, WaterExtent };

const linear = (hex: string) => new Color(hex);
/** A color as a GLSL constant (linear). */
const glslColor = (hex: string) => { const c = linear(hex); return `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`; };

/** `card` is the page color the view blends into at its edges (defaults to the sky tone). */
export function createOceanUniforms(habitat: Habitat = 'island', card?: string, config: OceanConfig = OCEAN) {
  const waves = waveTerms(config);
  const u = config.underwater;
  // From the fixed orthographic view, a highlight is simply a facet normal close to this axis:
  // tipped a few degrees from vertical toward the sun.
  const sun = new Vector3(...config.sun).normalize();
  const azimuth = Math.atan2(sun.z, sun.x), tilt = config.specular.tilt * Math.PI / 180;
  const glintAxis = new Vector3(Math.sin(tilt) * Math.cos(azimuth), Math.cos(tilt), Math.sin(tilt) * Math.sin(azimuth));
  const shininess = 1 / (config.specular.spread * Math.PI / 180) ** 2;
  const uniforms = {
    uOceanTime: { value: 0 },
    uOceanSurface: { value: config.surfaceLevel },
    uOceanWaveA: { value: waves.map((w) => new Vector4(w.dx, w.dz, w.k, w.amplitude)) },
    uOceanWaveB: { value: waves.map((w) => new Vector4(w.omega, w.roll, w.phase, 0)) },
    uOceanShoaling: { value: config.waveShoaling },
    uOceanShallow: { value: new Color() }, uOceanMid: { value: new Color() }, uOceanDeep: { value: new Color() },
    uOceanSandShallow: { value: new Color() }, uOceanSandWet: { value: new Color() }, uOceanPatch: { value: new Color() },
    uOceanSky: { value: new Color() }, uOceanSun: { value: new Color() }, uOceanFoam: { value: new Color() }, uOceanCard: { value: new Color() },
    uOceanStops: { value: new Vector2(config.shoreDepthRange.mid, config.shoreDepthRange.deep) },
    uOceanOpacity: { value: new Vector2(config.opacity.shallow, config.opacity.deep) },
    uOceanShoreClear: { value: config.shoreClearDepth },
    uOceanFacet: { value: config.facetShading },
    uOceanReflection: { value: new Vector3(config.reflection.strength, config.reflection.power, config.reflection.base) },
    uOceanSpecular: { value: new Vector3(config.specular.strength, shininess, config.specular.softness) },
    uOceanSpecularDir: { value: glintAxis },
    uOceanSunDir: { value: sun },
    uOceanFoamParams: { value: new Vector2(config.foam.strength, config.foam.depth) },
    uOceanSeabed: { value: new Vector3(config.seabedVisibility, config.seabedFacetShading, config.seabedPatches) },
    uOceanUnderwater: { value: new Vector4(u.clearDepth, u.visibility, u.tintStrength, u.desaturation) },
    uOceanDistortion: { value: u.distortion },
    uOceanEdge: { value: new Vector2(config.edgeFade.start, config.edgeFade.end) },
    // How far the view has pulled back over the archipelago (0 close up, 1 all the way out): the waves'
    // glints gather into drifting wind patches, the facets soften, and whitecaps fleck the deep water.
    uOceanCalm: { value: 0 },
    uOceanDepthMap: { value: null as DataTexture | null },
    // Lite tier: the static seabed-and-water colors baked per level (display values), plus display-space sky and card.
    uOceanLiteMap: { value: null as DataTexture | null },
    uOceanSkyDisplay: { value: new Color() }, uOceanCardDisplay: { value: new Color() },
    // Where the depth map lies (x0, z0, then its width and depth, world units).
    uOceanDepthArea: { value: new Vector4(-DEPTH.margin, -DEPTH.margin, 2 * DEPTH.margin, 2 * DEPTH.margin) },
    // The waters the surface and seabed blend (OCEAN_REGIONS palettes, REGION_COLORS each), how much of
    // each is where (the region map, one channel a palette), and each one's clarity: seabed
    // visibility and the surface's opacity in the shallows and out deep.
    uOceanRegionMap: { value: null as DataTexture | null }, uOceanRegionMore: { value: null as DataTexture | null },
    uOceanRegion: { value: Array.from({ length: OCEAN_REGIONS * REGION_COLORS.length }, () => new Color()) },
    uOceanRegionClarity: { value: Array.from({ length: OCEAN_REGIONS }, () => new Vector4()) },
  };
  applyOceanPalette(uniforms, habitat, card, config);
  applyRegionPalettes(uniforms, [habitat], config);
  return uniforms;
}
export type OceanUniforms = ReturnType<typeof createOceanUniforms>;

/** The habitat's own water colors and clarity: what an animal, the kelp or an islet in it takes on. */
function applyWaterPalette(uniforms: OceanUniforms, habitat: Habitat, config: OceanConfig) {
  const p = config.palettes[habitat];
  uniforms.uOceanShallow.value.copy(linear(p.shallow));
  uniforms.uOceanMid.value.copy(linear(p.mid));
  uniforms.uOceanDeep.value.copy(linear(p.deep));
  uniforms.uOceanSandShallow.value.copy(linear(p.sandShallow));
  uniforms.uOceanSandWet.value.copy(linear(p.sandWet));
  uniforms.uOceanPatch.value.copy(linear(p.patch));
  uniforms.uOceanFoam.value.copy(linear(p.foam));
  // How clear the water is: the habitat's own, else the defaults.
  const clarity = clarityOf(p, config);
  uniforms.uOceanUnderwater.value.y = clarity.visibility;
  uniforms.uOceanSeabed.value.x = clarity.seabed;
  uniforms.uOceanOpacity.value.set(clarity.opacity[0], clarity.opacity[1]);
}

export function applyOceanPalette(uniforms: OceanUniforms, habitat: Habitat, card?: string, config: OceanConfig = OCEAN) {
  const p = config.palettes[habitat];
  applyWaterPalette(uniforms, habitat, config);
  uniforms.uOceanSky.value.copy(linear(p.sky));
  // The sun highlight is added after blending-space conversion, so it is stored as display values.
  uniforms.uOceanSun.value.copy(linear(p.sun).convertLinearToSRGB());
  uniforms.uOceanCard.value.copy(linear(card ?? p.sky));
  uniforms.uOceanSkyDisplay.value.copy(linear(p.sky).convertLinearToSRGB());
  uniforms.uOceanCardDisplay.value.copy(linear(card ?? p.sky).convertLinearToSRGB());
}

/** The waters the surface and seabed blend between, in the region map's channel order (OceanDepthField.habitats). */
export function applyRegionPalettes(uniforms: OceanUniforms, habitats: readonly Habitat[], config: OceanConfig = OCEAN) {
  for (let slot = 0; slot < OCEAN_REGIONS; slot++) {
    const p = config.palettes[habitats[Math.min(slot, habitats.length - 1)]], clarity = clarityOf(p, config);
    REGION_COLORS.forEach((key, k) => uniforms.uOceanRegion.value[slot * REGION_COLORS.length + k].copy(linear(p[key])));
    uniforms.uOceanRegionClarity.value[slot].set(clarity.seabed, clarity.opacity[0], clarity.opacity[1], 0);
  }
}

/**
 * The uniforms for everything at one island (its animals, kelp, rocks and rising islets): the
 * ocean's own (the same waves, clock, depth map and haze, shared objects that follow every change),
 * but the island's own water to take on, so an animal at the Kelp Forest fades into its cold green.
 */
export function islandOceanUniforms(ocean: OceanUniforms, habitat: Habitat, config: OceanConfig = OCEAN): OceanUniforms {
  const own: OceanUniforms = {
    ...ocean,
    uOceanShallow: { value: new Color() }, uOceanMid: { value: new Color() }, uOceanDeep: { value: new Color() },
    uOceanSandShallow: { value: new Color() }, uOceanSandWet: { value: new Color() }, uOceanPatch: { value: new Color() }, uOceanFoam: { value: new Color() },
    uOceanUnderwater: { value: ocean.uOceanUnderwater.value.clone() }, uOceanSeabed: { value: ocean.uOceanSeabed.value.clone() },
    uOceanOpacity: { value: ocean.uOceanOpacity.value.clone() },
  };
  applyWaterPalette(own, habitat, config);
  return own;
}
const clarityOf = (p: OceanConfig['palettes'][Habitat], config: OceanConfig) =>
  ('clarity' in p ? p.clarity : undefined) ?? { visibility: config.underwater.visibility, seabed: config.seabedVisibility, opacity: [config.opacity.shallow, config.opacity.deep] as const };

/** Advance the shared water clock (the waves, foam and animal wobble all follow it). */
export function setOceanTime(uniforms: OceanUniforms, time: number) {
  uniforms.uOceanTime.value = time;
}

/** Point the shaders at the current level's depth and region maps, and where they lie. */
export function setOceanDepthMap(uniforms: OceanUniforms, field: DepthField | null) {
  uniforms.uOceanDepthMap.value = field?.texture ?? null;
  uniforms.uOceanRegionMap.value = field?.region ?? null;
  uniforms.uOceanRegionMore.value = field?.regionMore ?? null;
  if (field) uniforms.uOceanDepthArea.value.set(field.area.x0, field.area.z0, field.area.width, field.area.depth);
}

/** Point the lite ocean at the current level's baked colors. */
export function setOceanLiteMap(uniforms: OceanUniforms, texture: DataTexture | null) {
  uniforms.uOceanLiteMap.value = texture;
}

/** Water body color at a depth, matching the shaders (for tinting static props). */
export function waterColorAt(habitat: Habitat, depth: number, config: OceanConfig = OCEAN) {
  const s = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const { mid, deep } = config.shoreDepthRange, p = config.palettes[habitat];
  return linear(p.shallow).lerp(linear(p.mid), s(0, mid, depth)).lerp(linear(p.deep), s(mid * .5, deep, depth));
}

/** Home's island alone, in the middle of its own ocean. */
const HOME_OCEAN: readonly OceanIsland[] = [{ x: 0, z: 0, habitat: 'island' }];

/** An RGBA texture of `width` by `depth` texels, linearly filtered. */
function dataTexture(data: Uint8Array, width: number, depth: number) {
  const texture = new DataTexture(data, width, depth, RGBAFormat, UnsignedByteType);
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Water depth around the islands at this level, baked into a small texture the
 * surface and seabed sample per pixel. R: depth below the surface (sqrt-encoded
 * for precision near the shore); G: how far above the surface the beach rises;
 * B: seagrass patches on the shelf; A: the Coral Reef's coral, its crest and the
 * bommies' rubble (0 to .5), and where the swell breaks on the crest (to 1). Each island shapes the seabed around it in its
 * own frame (the same shelf its kelp and reef animals stand on), the nearest one
 * wherever two reach. The region map beside it says whose water each texel is: one
 * channel per habitat (`habitats`, in order), blending across the open water between
 * islands of different waters.
 */
export function buildDepthField(level: number, islands: readonly OceanIsland[] = HOME_OCEAN, config: OceanConfig = OCEAN) {
  // The seabed under the islands (seabed.ts: one function for this map and for the animals above it): each island's own
  // shores in its own frame (its outline and size: island-outline.ts), the nearest one wherever two reach, the Coral
  // Reef's lagoon and crest, and the bank between the islands.
  const { shores, reefs, nearest, profileAt, bank, lattice } = createSeabedField(level, islands, config);
  const xs = islands.map((i) => i.x), zs = islands.map((i) => i.z);
  const x0 = Math.min(...xs) - DEPTH.margin, z0 = Math.min(...zs) - DEPTH.margin;
  const width = Math.max(...xs) - Math.min(...xs) + 2 * DEPTH.margin, depth = Math.max(...zs) - Math.min(...zs) + 2 * DEPTH.margin;
  const columns = Math.round(width * DEPTH.perUnit), rows = Math.round(depth * DEPTH.perUnit);
  const habitats = [...new Set(islands.map((i) => i.habitat))].slice(0, OCEAN_REGIONS);
  // The Coral Reef's bommies' rubble on the lagoon floor.
  const bommies = islands.map((_, n) => (reefs[n] ? coralHeads(level).filter((head) => !head.crest) : []));
  // Every island's shores in the world, for anything measuring from them.
  const polygons = islands.flatMap((island, n) => shores[n].map((poly) => poly.map((v, k) => v + (k % 2 ? island.z : island.x))));
  // The coral channel: the crest's coral and the bommies' rubble up to .5, the crest's surf on to 1.
  const reefAt = (x: number, z: number, reach: number, heads: ReturnType<typeof coralHeads>) => {
    if (reach <= 0) return 0;
    const crest = reefCrestAt(x, z, reach, config);
    let coral = crest.coral;
    if (reach > .85 && reach < 1.5) {
      for (const head of heads) {
        if (Math.abs(x - head.x) > .45 || Math.abs(z - head.z) > .45) continue;
        const d = Math.hypot(x - head.x, z - head.z);
        if (d < head.radius * 1.8) coral = Math.max(coral, .6 * (1 - smooth(head.radius * .7, head.radius * 1.8, d)));
      }
    }
    return .5 * Math.min(1, coral) + .5 * Math.min(crest.surf, coral);
  };
  const data = new Uint8Array(columns * rows * 4), region = new Uint8Array(columns * rows * 4), regionMore = new Uint8Array(columns * rows * 4);
  const weights = new Float32Array(OCEAN_REGIONS);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < columns; i++) {
      const x = x0 + (i + .5) / columns * width, z = z0 + (j + .5) / rows * depth;
      const near = nearest(x, z);
      const { depth: water, wet } = profileAt(x, z, near);
      const k = (j * columns + i) * 4;
      data[k] = Math.round(255 * Math.sqrt(Math.min(1, water / DEPTH.maxDepth)));
      data[k + 1] = Math.round(255 * Math.min(1, Math.max(0, -wet) / .2));
      data[k + 2] = Math.round(255 * seabedPatch(near.x, near.z, near.reach));
      data[k + 3] = near.reef ? Math.round(255 * reefAt(near.x, near.z, near.reach, bommies[near.island])) : 0;
      // Each island's water, fading out past the nearer island's across the open sea between them.
      weights.fill(0);
      const closest = Math.min(...islands.map((island) => Math.hypot(x - island.x, z - island.z)));
      for (const island of islands) {
        const slot = habitats.indexOf(island.habitat);
        if (slot >= 0) weights[slot] += Math.exp(-(Math.hypot(x - island.x, z - island.z) - closest) / REGION_BLEND);
      }
      const total = weights.reduce((sum, w) => sum + w, 0);
      for (let c = 0; c < 4; c++) { region[k + c] = Math.round(255 * weights[c] / total); regionMore[k + c] = Math.round(255 * weights[c + 4] / total); }
    }
  }
  return {
    texture: dataTexture(data, columns, rows), region: dataTexture(region, columns, rows), regionMore: dataTexture(regionMore, columns, rows), habitats, polygons, islands, bank,
    area: { x0, z0, width, depth }, columns, rows,
    profile: (x: number, z: number) => profileAt(x, z), lattice,
  };
}
export type DepthField = ReturnType<typeof buildDepthField>;

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * Lite tier: everything static about the ocean, baked once per level and set of
 * islands into one small texture: the seabed seen through the water, with the average
 * surface layer already blended over it the way the full shaders do (display values),
 * in each island's own water (the region map). Alpha holds the surface's opacity, so
 * the moving facets and highlights added per frame fade out over the exposed beach.
 */
export function buildLiteOceanMap(field: DepthField, config: OceanConfig = OCEAN) {
  const { columns, rows } = field;
  const source = field.texture.image.data as Uint8Array, shares = [field.region.image.data as Uint8Array, field.regionMore.image.data as Uint8Array];
  const data = new Uint8Array(columns * rows * 4);
  const palettes = field.habitats.map((habitat) => {
    const p = config.palettes[habitat];
    return { colors: [p.shallow, p.mid, p.deep, p.sandWet, p.sandShallow, p.patch].map(linear), clarity: clarityOf(p, config) };
  });
  const { mid: midStop, deep: deepStop } = config.shoreDepthRange;
  const [shallow, mid, deep, wetSand, shallowSand, patch] = Array.from({ length: 6 }, () => new Color());
  const bed = new Color(), water = new Color(), foam = linear(config.palettes.island.foam);
  const corals = config.reefCrest.coral.map(linear), coral = new Color();
  for (let k = 0; k < columns * rows; k++) {
    const r = source[k * 4] / 255, g = source[k * 4 + 1] / 255, b = source[k * 4 + 2] / 255, a = source[k * 4 + 3] / 255 * 2;
    // This texel's water: its islands' palettes, by their shares.
    [shallow, mid, deep, wetSand, shallowSand, patch].forEach((color) => color.setRGB(0, 0, 0));
    let seabed = 0, clearShallow = 0, clearDeep = 0, total = 0;
    palettes.forEach(({ colors, clarity }, slot) => {
      const w = shares[slot >> 2][k * 4 + (slot & 3)] / 255;
      [shallow, mid, deep, wetSand, shallowSand, patch].forEach((color, c) => { color.r += colors[c].r * w; color.g += colors[c].g * w; color.b += colors[c].b * w; });
      seabed += clarity.seabed * w; clearShallow += clarity.opacity[0] * w; clearDeep += clarity.opacity[1] * w; total += w;
    });
    [shallow, mid, deep, wetSand, shallowSand, patch].forEach((color) => color.multiplyScalar(1 / total));
    seabed /= total; clearShallow /= total; clearDeep /= total;
    // Same decoding and color math as DEPTH_GLSL, seabedFragment and waterFragment.
    const depth = r * r * DEPTH.maxDepth, wet = depth - g * .2;
    water.copy(shallow).lerp(mid, smooth(0, midStop, depth)).lerp(deep, smooth(midStop * .5, deepStop, depth));
    // The Coral Reef's coral, mottled texel by texel, and its surf, held still.
    coral.copy(corals[Math.floor(hash(k % columns, Math.floor(k / columns)) * corals.length)]);
    bed.copy(wetSand).lerp(shallowSand, smooth(-.02, .18, wet)).lerp(patch, b * config.seabedPatches).lerp(coral, Math.min(1, a) * .92)
      .lerp(water, 1 - Math.exp(-depth / seabed));
    const surf = Math.max(0, a - 1) * .7 * smooth(.22, .06, depth);
    water.lerp(foam, surf);
    const alpha = Math.max(surf, (clearShallow + (clearDeep - clearShallow) * smooth(0, deepStop, depth)) * smooth(0, config.shoreClearDepth, wet));
    // The surface is blended over the seabed on display values.
    bed.convertLinearToSRGB(); water.convertLinearToSRGB();
    data[k * 4] = Math.round(255 * (water.r * alpha + bed.r * (1 - alpha)));
    data[k * 4 + 1] = Math.round(255 * (water.g * alpha + bed.g * (1 - alpha)));
    data[k * 4 + 2] = Math.round(255 * (water.b * alpha + bed.b * (1 - alpha)));
    data[k * 4 + 3] = Math.round(255 * alpha);
  }
  return dataTexture(data, columns, rows);
}

const WAVE_GLSL = /* glsl */ `
#define OCEAN_WAVES ${WAVES}
uniform float uOceanTime;
uniform vec4 uOceanWaveA[OCEAN_WAVES];
uniform vec4 uOceanWaveB[OCEAN_WAVES];
vec3 oceanWave(vec2 p) {
  vec3 o = vec3(0.0);
  for (int i = 0; i < OCEAN_WAVES; i++) {
    vec4 a = uOceanWaveA[i]; vec4 b = uOceanWaveB[i];
    float phase = a.z * dot(a.xy, p) - b.x * uOceanTime + b.z;
    o.y += a.w * sin(phase);
    o.xz += a.xy * (b.y * a.w * cos(phase));
  }
  return o;
}
vec2 oceanSlope(vec2 p) {
  vec2 s = vec2(0.0);
  for (int i = 0; i < OCEAN_WAVES; i++) {
    vec4 a = uOceanWaveA[i]; vec4 b = uOceanWaveB[i];
    s += a.xy * (a.w * a.z * cos(a.z * dot(a.xy, p) - b.x * uOceanTime + b.z));
  }
  return s;
}`;

/** Smooth value noise for the sea seen from far off (wind patches, whitecaps). */
const NOISE_GLSL = /* glsl */ `
float oceanHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float oceanNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p), s = f * f * (3.0 - 2.0 * f);
  return mix(mix(oceanHash(i), oceanHash(i + vec2(1.0, 0.0)), s.x), mix(oceanHash(i + vec2(0.0, 1.0)), oceanHash(i + vec2(1.0)), s.x), s.y);
}`;

const COLOR_GLSL = /* glsl */ `
uniform vec3 uOceanShallow; uniform vec3 uOceanMid; uniform vec3 uOceanDeep; uniform vec2 uOceanStops;
vec3 oceanWaterColor(float d) {
  vec3 c = mix(uOceanShallow, uOceanMid, smoothstep(0.0, uOceanStops.x, d));
  return mix(c, uOceanDeep, smoothstep(uOceanStops.x * .5, uOceanStops.y, d));
}`;

const DEPTH_GLSL = /* glsl */ `
uniform sampler2D uOceanDepthMap; uniform vec4 uOceanDepthArea;
// x: water depth for color; y: signed depth at the shore (negative where the beach is above water); z: seagrass.
vec3 oceanDepthAt(vec2 xz) {
  vec4 t = texture2D(uOceanDepthMap, (xz - uOceanDepthArea.xy) / uOceanDepthArea.zw);
  float depth = t.r * t.r * ${DEPTH.maxDepth.toFixed(1)};
  return vec3(depth, depth - t.g * .2, t.b);
}
// The Coral Reef's coral (x, 0 to 1) and where the swell breaks on its crest (y, 0 to 1).
vec2 oceanReefAt(vec2 xz) {
  float a = texture2D(uOceanDepthMap, (xz - uOceanDepthArea.xy) / uOceanDepthArea.zw).a * 2.0;
  return vec2(min(1.0, a), max(0.0, a - 1.0));
}`;

// Whose water this is: each island's palette (REGION_COLORS) and clarity, by its share of the region maps
// here (only as many waters as the ocean has, `regions`; the second map only past four).
const regionGlsl = (regions: number) => {
  const n = Math.max(1, Math.min(OCEAN_REGIONS, regions)), weight = (slot: number) => (slot < 4 ? `w[${slot}]` : `v[${slot - 4}]`);
  return /* glsl */ `
uniform sampler2D uOceanRegionMap; uniform sampler2D uOceanRegionMore; uniform vec3 uOceanRegion[${n * REGION_COLORS.length}]; uniform vec4 uOceanRegionClarity[${n}];
struct OceanWater { ${REGION_NAMES.map((name) => `vec3 ${name};`).join(' ')} vec3 clarity; };
OceanWater oceanWaterAt(vec2 xz) {
  vec2 uv = (xz - uOceanDepthArea.xy) / uOceanDepthArea.zw;
  vec4 w = texture2D(uOceanRegionMap, uv), v = ${n > 4 ? 'texture2D(uOceanRegionMore, uv)' : 'vec4(0.0)'};
  float total = max(dot(w, vec4(1.0)) + dot(v, vec4(1.0)), 1e-4);
  w /= total; v /= total;
  OceanWater o;
${REGION_NAMES.map((name, k) => `  o.${name} = ${Array.from({ length: n }, (_, slot) => `${weight(slot)} * uOceanRegion[${slot * REGION_COLORS.length + k}]`).join(' + ')};`).join('\n')}
  o.clarity = ${Array.from({ length: n }, (_, slot) => `${weight(slot)} * uOceanRegionClarity[${slot}].xyz`).join(' + ')};
  return o;
}
vec3 oceanWaterColorIn(OceanWater o, float d) {
  vec3 c = mix(o.shallow, o.mid, smoothstep(0.0, uOceanStops.x, d));
  return mix(c, o.deep, smoothstep(uOceanStops.x * .5, uOceanStops.y, d));
}`;
};

export const OCEAN_SHADER_CHUNKS = { waves: WAVE_GLSL, color: COLOR_GLSL };

const WATER_VERTEX = /* glsl */ `
${WAVE_GLSL}
uniform float uOceanSurface;
uniform vec3 uOceanReflection;
attribute float aShoaling;
varying vec3 vWorld;
varying vec3 vSmoothNormal;
varying float vWave;
varying float vClipY;
varying float vReflection;
varying float vFoamBreak;
void main() {
  vec3 p = position;
  vec3 w = oceanWave(p.xz) * aShoaling;
  vec2 slope = oceanSlope(p.xz) * aShoaling;
  p += w;
  p.y += uOceanSurface;
  vec4 world = modelMatrix * vec4(p, 1.0);
  vWorld = world.xyz;
  vSmoothNormal = vec3(-slope.x, 1.0, -slope.y);
  vWave = w.y;
  gl_Position = projectionMatrix * viewMatrix * world;
  vClipY = gl_Position.y / gl_Position.w;
  // Restrained Fresnel sky reflection, a touch stronger toward the far water. From this steep,
  // fixed view it hardly changes across a facet, so it is evaluated per vertex.
  vec3 toCamera = normalize(vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]));
  float facing = clamp(dot(normalize(vSmoothNormal), toCamera), 0.0, 1.0);
  float fresnel = uOceanReflection.z + (1.0 - uOceanReflection.z) * pow(1.0 - facing, uOceanReflection.y);
  vReflection = uOceanReflection.x * clamp(fresnel + .22 * smoothstep(-.4, 1.0, vClipY), 0.0, 1.0);
  // Slowly drifting gaps in the shore foam.
  vFoamBreak = .55 + .45 * sin(world.x * 5.0 + uOceanTime * .6) * sin(world.z * 6.0 - uOceanTime * .45);
}`;

const waterFragment = (regions: number) => /* glsl */ `
uniform vec2 uOceanStops;
${DEPTH_GLSL}
${regionGlsl(regions)}
uniform vec3 uOceanSun; uniform vec3 uOceanFoam;
uniform float uOceanShoreClear; uniform float uOceanFacet;
uniform vec3 uOceanSpecular; uniform vec3 uOceanSpecularDir; uniform vec3 uOceanSunDir;
uniform vec2 uOceanFoamParams; uniform vec2 uOceanEdge; uniform float uOceanCalm; uniform float uOceanTime;
varying vec3 vWorld;
varying vec3 vSmoothNormal;
varying float vWave;
varying float vClipY;
varying float vReflection;
varying float vFoamBreak;
${NOISE_GLSL}
// Seen from far off: the wind ruffles the sea in drifting patches (where the sun catches the waves),
// and here and there a whitecap breaks, flickers and is gone, never in a repeating pattern.
float oceanWind(vec2 p) {
  vec2 drift = vec2(.11, .05) * uOceanTime;
  return smoothstep(.42, .78, oceanNoise(p * .085 + drift) * .7 + oceanNoise(p * .23 - drift * 1.7) * .3);
}
float oceanWhitecap(vec2 p) {
  vec2 cell = floor(p * .9), local = fract(p * .9) - .5;
  float seed = oceanHash(cell), life = fract(uOceanTime * (.07 + .05 * seed) + seed * 7.0);
  vec2 at = vec2(oceanHash(cell + 3.1), oceanHash(cell + 7.7)) - .5;
  // A short dash along the wind, swelling and fading over a third of its cycle.
  vec2 d = (local - at * .6) * mat2(.94, .34, -.34, .94);
  float dash = 1.0 - smoothstep(.0, 1.0, length(d * vec2(5.5, 15.0)));
  return step(.62, seed) * dash * smoothstep(0.0, .08, life) * (1.0 - smoothstep(.2, .33, life));
}
// The swell breaking on the Coral Reef's crest: each set of waves rolls along the reef as a pulse of
// white water, torn into streaks that drift with it.
float oceanSurf(vec2 p, float strength) {
  if (strength <= 0.0) return 0.0;
  float set = .5 + .5 * sin(uOceanTime * 1.25 - dot(p, vec2(.9, .6)) * 1.4 + oceanNoise(p * .7) * 5.0);
  float torn = oceanNoise(p * 5.0 + vec2(uOceanTime * .35, -uOceanTime * .2)) * .6 + oceanNoise(p * 13.0 - uOceanTime * .6) * .4;
  // Between sets the white water never quite clears: a broken line always marks the crest.
  return strength * max(smoothstep(.55, .85, torn) * .55, smoothstep(.25, .7, torn * .7 + set * .5));
}
void main() {
  // One normal per facet keeps the low-poly character as the waves move.
  vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  if (n.y < 0.0) n = -n;
  vec3 depthAt = oceanDepthAt(vWorld.xz);
  OceanWater water = oceanWaterAt(vWorld.xz);
  float wet = depthAt.y + vWave;
  // No water above the exposed beach; fully clear right at the waterline.
  float shore = smoothstep(0.0, uOceanShoreClear, wet);
  // Facets tilted toward the sun read a little brighter, away a little darker.
  float facet = clamp((dot(n, uOceanSunDir) - uOceanSunDir.y) * 14.0, -1.0, 1.0) * (1.0 - .45 * uOceanCalm);
  vec3 color = mix(oceanWaterColorIn(water, depthAt.x) * (1.0 + uOceanFacet * facet), water.sky, vReflection);
  // Soft daylight on the few facets tipped furthest toward the sun; the smooth wave normal
  // rounds off each highlight so facets catch the light without sparkling.
  vec3 glintNormal = normalize(mix(n, normalize(vSmoothNormal), uOceanSpecular.z));
  float glint = uOceanSpecular.x * pow(max(dot(glintNormal, uOceanSpecularDir), 0.0), uOceanSpecular.y);
  float wind = uOceanCalm > 0.0 ? oceanWind(vWorld.xz) : 1.0;
  glint *= mix(1.0, wind * .75, uOceanCalm);
  // Clear in the shallows, richer farther out, so the life below stays visible.
  float alpha = (mix(water.clarity.y, water.clarity.z, smoothstep(0.0, uOceanStops.y, depthAt.x)) + vReflection * .45) * shore;
  // A thin, broken line of foam that rides up and down the sand with the waves.
  float foam = uOceanFoamParams.x * vFoamBreak * smoothstep(-.004, .004, wet) * (1.0 - smoothstep(0.0, uOceanFoamParams.y, wet));
  // Whitecaps out over deep water, as the view pulls back.
  float cap = uOceanCalm > 0.0 ? oceanWhitecap(vWorld.xz) * uOceanCalm * smoothstep(1.4, 2.4, depthAt.x) * (.55 + .45 * wind) : 0.0;
  foam = max(foam, cap * .85);
  foam = max(foam, oceanSurf(vWorld.xz, oceanReefAt(vWorld.xz).y) * smoothstep(.22, .06, depthAt.x));
  color = mix(color, uOceanFoam, foam);
  alpha = max(alpha, foam);
  float edge = 1.0 - smoothstep(uOceanEdge.x, uOceanEdge.y, abs(vClipY));
  alpha *= edge;
  // Premultiplied: the surface transmits what is below and adds its own light on top. Blending
  // happens on display values, so the highlight (uOceanSun is display-space) is added as is.
  gl_FragColor = vec4(linearToOutputTexel(vec4(color, 1.0)).rgb * alpha + uOceanSun * (glint * edge * shore), alpha);
}`;

// Lite tier: one opaque backdrop instead of seabed + surface. Waves still move the facets: lighting is
// evaluated per vertex (the facet shade held flat across each triangle, highlights blended smoothly
// between vertices), and each pixel only reads the baked colors. No derivatives, color-space
// conversion or blending per pixel.
const LITE_VERTEX = /* glsl */ `
${WAVE_GLSL}
${NOISE_GLSL}
uniform float uOceanCalm;
uniform float uOceanSurface; uniform vec3 uOceanReflection; uniform vec3 uOceanSunDir;
uniform vec3 uOceanSpecular; uniform vec3 uOceanSpecularDir; uniform float uOceanFacet; uniform vec4 uOceanDepthArea;
attribute float aShoaling;
varying vec2 vMapUv;
varying float vClipY;
varying vec2 vReflectionGlint;
flat varying float vFacet;
void main() {
  vec3 p = position;
  vec3 w = oceanWave(p.xz) * aShoaling;
  vec2 slope = oceanSlope(p.xz) * aShoaling;
  p += w;
  p.y += uOceanSurface;
  vec4 world = modelMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * viewMatrix * world;
  vClipY = gl_Position.y / gl_Position.w;
  vMapUv = (world.xz - uOceanDepthArea.xy) / uOceanDepthArea.zw;
  vec3 n = normalize(vec3(-slope.x, 1.0, -slope.y));
  vec3 toCamera = normalize(vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]));
  float fresnel = uOceanReflection.z + (1.0 - uOceanReflection.z) * pow(1.0 - clamp(dot(n, toCamera), 0.0, 1.0), uOceanReflection.y);
  // Pulled back over the archipelago, the glints gather into drifting wind patches (as on the full surface).
  vec2 drift = vec2(.11, .05) * uOceanTime;
  float wind = smoothstep(.42, .78, oceanNoise(world.xz * .085 + drift) * .7 + oceanNoise(world.xz * .23 - drift * 1.7) * .3);
  vReflectionGlint = vec2(uOceanReflection.x * clamp(fresnel + .22 * smoothstep(-.4, 1.0, vClipY), 0.0, 1.0),
    uOceanSpecular.x * pow(max(dot(n, uOceanSpecularDir), 0.0), uOceanSpecular.y) * mix(1.0, wind * .75, uOceanCalm));
  vFacet = uOceanFacet * clamp((dot(n, uOceanSunDir) - uOceanSunDir.y) * 14.0, -1.0, 1.0) * (1.0 - .45 * uOceanCalm);
}`;

const LITE_FRAGMENT = /* glsl */ `
uniform sampler2D uOceanLiteMap; uniform vec3 uOceanSun; uniform vec3 uOceanSkyDisplay; uniform vec3 uOceanCardDisplay; uniform vec2 uOceanEdge;
varying vec2 vMapUv;
varying float vClipY;
varying vec2 vReflectionGlint;
flat varying float vFacet;
void main() {
  vec4 baked = texture2D(uOceanLiteMap, vMapUv);
  float water = smoothstep(0.0, .12, baked.a);
  vec3 color = baked.rgb * (1.0 + vFacet * baked.a);
  color = mix(color, uOceanSkyDisplay, vReflectionGlint.x * .7 * water) + uOceanSun * (vReflectionGlint.y * water);
  gl_FragColor = vec4(mix(color, uOceanCardDisplay, smoothstep(uOceanEdge.x, uOceanEdge.y, abs(vClipY))), 1.0);
}`;

const SEABED_VERTEX = /* glsl */ `
varying vec3 vWorld;
varying float vClipY;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
  vClipY = gl_Position.y / gl_Position.w;
}`;

const seabedFragment = (regions: number) => /* glsl */ `
uniform vec2 uOceanStops;
${DEPTH_GLSL}
${regionGlsl(regions)}
${NOISE_GLSL}
// The Coral Reef's coral seen from above: a mottle of browns, olive and rose, with pale rubble between.
vec3 oceanCoral(vec2 p) {
  vec3 c = mix(${glslColor(OCEAN.reefCrest.coral[0])}, ${glslColor(OCEAN.reefCrest.coral[1])}, smoothstep(.3, .7, oceanNoise(p * 6.0)));
  c = mix(c, ${glslColor(OCEAN.reefCrest.coral[2])}, smoothstep(.55, .8, oceanNoise(p * 15.0 + 3.7)));
  c = mix(c, ${glslColor(OCEAN.reefCrest.coral[4])}, smoothstep(.72, .9, oceanNoise(p * 9.0 - 5.1)) * .8);
  return mix(c, ${glslColor(OCEAN.reefCrest.coral[3])}, smoothstep(.62, .88, oceanNoise(p * 4.0 + 8.2)) * .7);
}
uniform vec3 uOceanCard;
uniform vec3 uOceanSeabed; uniform vec3 uOceanSunDir; uniform vec2 uOceanEdge;
uniform float uOceanSurface;
varying vec3 vWorld;
varying float vClipY;
void main() {
  vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  if (n.y < 0.0) n = -n;
  vec3 depthAt = oceanDepthAt(vWorld.xz);
  // The depth map is read from above, so a wall (the Coral Reef's outer slope) would keep the depth of its top all the way down it: the
  // deeper it really is here than the map says (by more than the seabed's own relief and a facet's sag from the profile, .3), the deeper the water over it reads (and the sooner it is all water color).
  depthAt.x += 8.0 * max(0.0, uOceanSurface - vWorld.y - depthAt.x - .3);
  OceanWater water = oceanWaterAt(vWorld.xz);
  // Wet sand at the waterline brightens to clean sand under the shallows, broken by seagrass.
  vec3 sand = mix(water.sandWet, water.sandShallow, smoothstep(-.02, .18, depthAt.y));
  sand = mix(sand, water.seagrass, depthAt.z * uOceanSeabed.z);
  sand = mix(sand, oceanCoral(vWorld.xz), oceanReefAt(vWorld.xz).x * .92);
  // (a wall steeper than the reef's inner slope gets no light and shade of its facets: tall thin ones would read as stripes)
  sand *= 1.0 + uOceanSeabed.y * smoothstep(.05, .3, n.y) * clamp((dot(n, uOceanSunDir) - uOceanSunDir.y) * 6.0, -1.0, 1.0);
  // The deeper the seabed, the more it disappears into the water color.
  float fade = 1.0 - exp(-depthAt.x / water.clarity.x);
  vec3 color = mix(sand, oceanWaterColorIn(water, depthAt.x), fade);
  color = mix(color, uOceanCard, smoothstep(uOceanEdge.x, uOceanEdge.y, abs(vClipY)));
  gl_FragColor = linearToOutputTexel(vec4(color, 1.0));
}`;

/** How far the water reaches from every island's middle (units): the same each way, or farther across than in depth (the explorer's, on a wide screen). */
/** A jittered triangle lattice: irregular low-poly facets instead of a visible grid, `extent` units each way from every island's middle. */
function waterLattice(field: DepthField, config: OceanConfig, extent: WaterExtent) {
  const s = config.facetSize, h = s * Math.sqrt(3) / 2, box = oceanBox(field.islands, extent);
  const cols = Math.ceil(box.width / s) + 1, rows = Math.ceil(box.depth / h) + 1;
  const positions: number[] = [], shoaling: number[] = [], indices: number[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const edge = r === 0 || c === 0 || r === rows - 1 || c === cols - 1;
      const jx = edge ? 0 : (hash(c, r) - .5) * .36 * s, jz = edge ? 0 : (hash(r, c + 17) - .5) * .36 * s;
      const x = box.x0 + c * s + (r % 2) * s / 2 + jx, z = box.z0 + r * h + jz;
      positions.push(x, 0, z);
      shoaling.push(Math.min(1, Math.max(0, field.profile(x, z).wet / config.waveShoaling)));
    }
  }
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1;
      if (r % 2 === 0) indices.push(a, d, b, b, d, e);
      else indices.push(a, e, b, a, d, e);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aShoaling', new Float32BufferAttribute(shoaling, 1));
  geometry.setIndex(new Uint16BufferAttribute(indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

/** The water's surface, reaching `extent` units each way from every island (the Home card's view never sees past OCEAN.waterExtent; the explorer's water reaches farther). */
export function createWaterMesh(uniforms: OceanUniforms, field: DepthField, config: OceanConfig = OCEAN, extent: WaterExtent = OCEAN.waterExtent) {
  const geometry = waterLattice(field, config, extent);
  const material = new ShaderMaterial({
    uniforms, vertexShader: WATER_VERTEX, fragmentShader: waterFragment(field.habitats.length),
    transparent: true, depthWrite: false, premultipliedAlpha: true, side: DoubleSide,
  });
  const mesh = new Mesh(geometry, material);
  mesh.name = 'ocean-surface';
  mesh.renderOrder = 2;
  mesh.frustumCulled = false;
  mesh.raycast = () => {};
  return mesh;
}

/**
 * Lite tier: the same wave lattice drawn once as an opaque backdrop, colored from
 * the baked map (see buildLiteOceanMap). Replaces the seabed and surface meshes.
 */
export function createLiteOceanMesh(uniforms: OceanUniforms, field: DepthField, config: OceanConfig = OCEAN, extent: WaterExtent = OCEAN.waterExtent) {
  const material = new ShaderMaterial({
    uniforms, vertexShader: LITE_VERTEX, fragmentShader: LITE_FRAGMENT, depthWrite: false, depthTest: false, side: DoubleSide,
  });
  const mesh = new Mesh(waterLattice(field, config, extent), material);
  mesh.name = 'ocean-lite';
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  mesh.raycast = () => {};
  return mesh;
}

/**
 * The camera looks down and away at `SLANT` (the scene camera's offset from what it looks at: 12.15 up and 6 toward the viewer): a point
 * is that much farther the lower and the farther from the viewer it is.
 */
const SLANT = { y: 12.15, z: 6 };
/**
 * The seabed's triangles from the terrain on, the farthest from the camera first (the coarse floor before it, which the terrain lies
 * over, as it is). The seabed is drawn without depth testing, so what is nearer must be drawn later: a wall as steep as the Coral
 * Reef's outer one hides the floor beyond the crest, and drawn in the order the lattice has them (inner ring to outer) that floor
 * would be drawn over the crest. Judged by each triangle's middle, which is near enough for a terrain of small triangles.
 */
function farthestFirst(positions: readonly number[], indices: readonly number[], from: number) {
  const count = (indices.length - from) / 3, far = new Float64Array(count), order = Array.from({ length: count }, (_, t) => t), length = Math.hypot(SLANT.y, SLANT.z);
  for (let t = 0; t < count; t++) {
    let y = 0, z = 0;
    for (let k = 0; k < 3; k++) { const p = indices[from + t * 3 + k] * 3; y += positions[p + 1]; z += positions[p + 2]; }
    far[t] = -(y * SLANT.y + z * SLANT.z) / (3 * length);
  }
  order.sort((a, b) => far[b] - far[a] || a - b);
  const sorted = indices.slice(0, from);
  for (const t of order) sorted.push(indices[from + t * 3], indices[from + t * 3 + 1], indices[from + t * 3 + 2]);
  return sorted;
}

/**
 * The seabed: a radial terrain around each island (beach slope, sandy shelf, reef
 * drop-off, deep floor) with a little relief. It is a backdrop drawn first without
 * depth testing, so swimmers are never hidden behind it. Under water that reaches
 * past OCEAN.waterExtent (`reach`, the explorer's), the deep floor goes on under all
 * of it, past the water's corners. With several islands, each one's terrain stops
 * short of its neighbours' and a coarse deep floor lies under the open sea between
 * them (drawn first, so the islands' terrain lies over it).
 */
export function createSeabedMesh(uniforms: OceanUniforms, field: DepthField, reach: WaterExtent = OCEAN.waterExtent) {
  // (its triangles are made in seabed-lattice.ts: the animals swim over the same ones)
  const { positions, indices, terrain } = field.lattice(reach);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(new Uint16BufferAttribute(farthestFirst(positions, indices, terrain), 1));
  geometry.computeBoundingSphere();
  const material = new ShaderMaterial({
    uniforms, vertexShader: SEABED_VERTEX, fragmentShader: seabedFragment(field.habitats.length), depthWrite: false, depthTest: false, side: DoubleSide,
  });
  const mesh = new Mesh(geometry, material);
  mesh.name = 'ocean-seabed';
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  mesh.raycast = () => {};
  return mesh;
}
