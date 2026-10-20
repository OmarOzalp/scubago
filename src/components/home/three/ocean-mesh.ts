import {
  BufferGeometry, Color, DataTexture, DoubleSide, Float32BufferAttribute, LinearFilter, Mesh, RGBAFormat, ShaderMaterial,
  Uint16BufferAttribute, UnsignedByteType, Vector2, Vector3, Vector4,
} from 'three';
import type { Habitat } from '@/lib/home';
import { OCEAN, seabedPatch, seabedProfile, shelfStretch, waveTerms, type OceanConfig } from '@/lib/ocean';
import { islandScale, shoreDistance, shorePolygons, shoreline } from './island-shape';

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
/** Past this far from an island's middle (units), its shore is too far to shape the seabed (beyond its islets, the open-ocean depth is reached). */
const ISLAND_REACH = 10;
/** How many different waters (palettes) one ocean blends: one channel each of the region map. */
export const OCEAN_REGIONS = 4;
/** How gradually one island's water gives way to the next across the open water between them (units). */
const REGION_BLEND = 1.2;
/** The palette colors each region carries (see REGION_GLSL), in order, and their names there (`patch` is reserved in GLSL ES 3). */
const REGION_COLORS = ['shallow', 'mid', 'deep', 'sandShallow', 'sandWet', 'patch', 'sky'] as const;
const REGION_NAMES = ['shallow', 'mid', 'deep', 'sandShallow', 'sandWet', 'seagrass', 'sky'] as const;
const WAVES = Object.keys(OCEAN.waves).length;

/** An island in the ocean: its middle (world units) and the habitat whose water surrounds it. */
export type OceanIsland = { x: number; z: number; habitat: Habitat };

const linear = (hex: string) => new Color(hex);
const hash = (x: number, y: number) => {
  const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return v - Math.floor(v);
};

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
    uOceanDepthMap: { value: null as DataTexture | null },
    // Lite tier: the static seabed-and-water colors baked per level (display values), plus display-space sky and card.
    uOceanLiteMap: { value: null as DataTexture | null },
    uOceanSkyDisplay: { value: new Color() }, uOceanCardDisplay: { value: new Color() },
    // Where the depth map lies (x0, z0, then its width and depth, world units).
    uOceanDepthArea: { value: new Vector4(-DEPTH.margin, -DEPTH.margin, 2 * DEPTH.margin, 2 * DEPTH.margin) },
    // The waters the surface and seabed blend (OCEAN_REGIONS palettes, REGION_COLORS each), how much of
    // each is where (the region map, one channel a palette), and each one's clarity: seabed
    // visibility and the surface's opacity in the shallows and out deep.
    uOceanRegionMap: { value: null as DataTexture | null },
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
 * B: seagrass patches on the shelf. Each island shapes the seabed around it in its
 * own frame (the same shelf its kelp and reef animals stand on), the nearest one
 * wherever two reach. The region map beside it says whose water each texel is: one
 * channel per habitat (`habitats`, in order), blending across the open water between
 * islands of different waters.
 */
export function buildDepthField(level: number, islands: readonly OceanIsland[] = HOME_OCEAN, config: OceanConfig = OCEAN) {
  const local = shorePolygons(level);
  const xs = islands.map((i) => i.x), zs = islands.map((i) => i.z);
  const x0 = Math.min(...xs) - DEPTH.margin, z0 = Math.min(...zs) - DEPTH.margin;
  const width = Math.max(...xs) - Math.min(...xs) + 2 * DEPTH.margin, depth = Math.max(...zs) - Math.min(...zs) + 2 * DEPTH.margin;
  const columns = Math.round(width * DEPTH.perUnit), rows = Math.round(depth * DEPTH.perUnit);
  const habitats = [...new Set(islands.map((i) => i.habitat))].slice(0, OCEAN_REGIONS);
  // Every island's shores in the world, for anything measuring from them.
  const polygons = islands.flatMap((island) => local.map((poly) => poly.map((v, k) => v + (k % 2 ? island.z : island.x))));
  // The shelf widens and narrows around each island's coast (in its own frame); the land itself is unchanged.
  // Far from an island's middle, only the open ocean's depth is left of its shelf.
  const nearest = (x: number, z: number) => {
    let best = Infinity, nx = x, nz = z;
    for (const island of islands) {
      const lx = x - island.x, lz = z - island.z;
      if (Math.hypot(lx, lz) > ISLAND_REACH && best < Infinity) continue;
      const distance = shoreDistance(local, lx, lz);
      const reach = distance > 0 ? distance / shelfStretch(lx, lz, config) : distance;
      if (reach < best) { best = reach; nx = lx; nz = lz; }
    }
    return { reach: best, x: nx, z: nz };
  };
  const reach = (x: number, z: number) => nearest(x, z).reach;
  const data = new Uint8Array(columns * rows * 4), region = new Uint8Array(columns * rows * 4);
  const weights = new Float32Array(OCEAN_REGIONS);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < columns; i++) {
      const x = x0 + (i + .5) / columns * width, z = z0 + (j + .5) / rows * depth;
      const near = nearest(x, z);
      const { depth: water, wet } = seabedProfile(near.reach, config);
      const k = (j * columns + i) * 4;
      data[k] = Math.round(255 * Math.sqrt(Math.min(1, water / DEPTH.maxDepth)));
      data[k + 1] = Math.round(255 * Math.min(1, Math.max(0, -wet) / .2));
      data[k + 2] = Math.round(255 * seabedPatch(near.x, near.z, near.reach));
      data[k + 3] = 255;
      // Each island's water, fading out past the nearer island's across the open sea between them.
      weights.fill(0);
      const closest = Math.min(...islands.map((island) => Math.hypot(x - island.x, z - island.z)));
      for (const island of islands) {
        const slot = habitats.indexOf(island.habitat);
        if (slot >= 0) weights[slot] += Math.exp(-(Math.hypot(x - island.x, z - island.z) - closest) / REGION_BLEND);
      }
      const total = weights.reduce((sum, w) => sum + w, 0);
      for (let c = 0; c < 4; c++) region[k + c] = Math.round(255 * weights[c] / total);
    }
  }
  return {
    texture: dataTexture(data, columns, rows), region: dataTexture(region, columns, rows), habitats, polygons, islands,
    area: { x0, z0, width, depth }, columns, rows,
    profile: (x: number, z: number) => seabedProfile(reach(x, z), config),
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
  const source = field.texture.image.data as Uint8Array, share = field.region.image.data as Uint8Array;
  const data = new Uint8Array(columns * rows * 4);
  const palettes = field.habitats.map((habitat) => {
    const p = config.palettes[habitat];
    return { colors: [p.shallow, p.mid, p.deep, p.sandWet, p.sandShallow, p.patch].map(linear), clarity: clarityOf(p, config) };
  });
  const { mid: midStop, deep: deepStop } = config.shoreDepthRange;
  const [shallow, mid, deep, wetSand, shallowSand, patch] = Array.from({ length: 6 }, () => new Color());
  const bed = new Color(), water = new Color();
  for (let k = 0; k < columns * rows; k++) {
    const r = source[k * 4] / 255, g = source[k * 4 + 1] / 255, b = source[k * 4 + 2] / 255;
    // This texel's water: its islands' palettes, by their shares.
    [shallow, mid, deep, wetSand, shallowSand, patch].forEach((color) => color.setRGB(0, 0, 0));
    let seabed = 0, clearShallow = 0, clearDeep = 0, total = 0;
    palettes.forEach(({ colors, clarity }, slot) => {
      const w = share[k * 4 + slot] / 255;
      [shallow, mid, deep, wetSand, shallowSand, patch].forEach((color, c) => { color.r += colors[c].r * w; color.g += colors[c].g * w; color.b += colors[c].b * w; });
      seabed += clarity.seabed * w; clearShallow += clarity.opacity[0] * w; clearDeep += clarity.opacity[1] * w; total += w;
    });
    [shallow, mid, deep, wetSand, shallowSand, patch].forEach((color) => color.multiplyScalar(1 / total));
    seabed /= total; clearShallow /= total; clearDeep /= total;
    // Same decoding and color math as DEPTH_GLSL, SEABED_FRAGMENT and WATER_FRAGMENT.
    const depth = r * r * DEPTH.maxDepth, wet = depth - g * .2;
    water.copy(shallow).lerp(mid, smooth(0, midStop, depth)).lerp(deep, smooth(midStop * .5, deepStop, depth));
    bed.copy(wetSand).lerp(shallowSand, smooth(-.02, .18, wet)).lerp(patch, b * config.seabedPatches)
      .lerp(water, 1 - Math.exp(-depth / seabed));
    const alpha = (clearShallow + (clearDeep - clearShallow) * smooth(0, deepStop, depth)) * smooth(0, config.shoreClearDepth, wet);
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
}`;

// Whose water this is: each island's palette (REGION_COLORS) and clarity, by its share of the region map here.
const REGION_GLSL = /* glsl */ `
#define OCEAN_REGIONS ${OCEAN_REGIONS}
uniform sampler2D uOceanRegionMap; uniform vec3 uOceanRegion[${OCEAN_REGIONS * REGION_COLORS.length}]; uniform vec4 uOceanRegionClarity[OCEAN_REGIONS];
struct OceanWater { ${REGION_NAMES.map((name) => `vec3 ${name};`).join(' ')} vec3 clarity; };
OceanWater oceanWaterAt(vec2 xz) {
  vec4 w = texture2D(uOceanRegionMap, (xz - uOceanDepthArea.xy) / uOceanDepthArea.zw);
  w /= max(dot(w, vec4(1.0)), 1e-4);
  OceanWater o;
${REGION_NAMES.map((name, k) => `  o.${name} = ${Array.from({ length: OCEAN_REGIONS }, (_, slot) => `w[${slot}] * uOceanRegion[${slot * REGION_COLORS.length + k}]`).join(' + ')};`).join('\n')}
  o.clarity = ${Array.from({ length: OCEAN_REGIONS }, (_, slot) => `w[${slot}] * uOceanRegionClarity[${slot}].xyz`).join(' + ')};
  return o;
}
vec3 oceanWaterColorIn(OceanWater o, float d) {
  vec3 c = mix(o.shallow, o.mid, smoothstep(0.0, uOceanStops.x, d));
  return mix(c, o.deep, smoothstep(uOceanStops.x * .5, uOceanStops.y, d));
}`;

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

const WATER_FRAGMENT = /* glsl */ `
uniform vec2 uOceanStops;
${DEPTH_GLSL}
${REGION_GLSL}
uniform vec3 uOceanSun; uniform vec3 uOceanFoam;
uniform float uOceanShoreClear; uniform float uOceanFacet;
uniform vec3 uOceanSpecular; uniform vec3 uOceanSpecularDir; uniform vec3 uOceanSunDir;
uniform vec2 uOceanFoamParams; uniform vec2 uOceanEdge;
varying vec3 vWorld;
varying vec3 vSmoothNormal;
varying float vWave;
varying float vClipY;
varying float vReflection;
varying float vFoamBreak;
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
  float facet = clamp((dot(n, uOceanSunDir) - uOceanSunDir.y) * 14.0, -1.0, 1.0);
  vec3 color = mix(oceanWaterColorIn(water, depthAt.x) * (1.0 + uOceanFacet * facet), water.sky, vReflection);
  // Soft daylight on the few facets tipped furthest toward the sun; the smooth wave normal
  // rounds off each highlight so facets catch the light without sparkling.
  vec3 glintNormal = normalize(mix(n, normalize(vSmoothNormal), uOceanSpecular.z));
  float glint = uOceanSpecular.x * pow(max(dot(glintNormal, uOceanSpecularDir), 0.0), uOceanSpecular.y);
  // Clear in the shallows, richer farther out, so the life below stays visible.
  float alpha = (mix(water.clarity.y, water.clarity.z, smoothstep(0.0, uOceanStops.y, depthAt.x)) + vReflection * .45) * shore;
  // A thin, broken line of foam that rides up and down the sand with the waves.
  float foam = uOceanFoamParams.x * vFoamBreak * smoothstep(-.004, .004, wet) * (1.0 - smoothstep(0.0, uOceanFoamParams.y, wet));
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
  vReflectionGlint = vec2(uOceanReflection.x * clamp(fresnel + .22 * smoothstep(-.4, 1.0, vClipY), 0.0, 1.0),
    uOceanSpecular.x * pow(max(dot(n, uOceanSpecularDir), 0.0), uOceanSpecular.y));
  vFacet = uOceanFacet * clamp((dot(n, uOceanSunDir) - uOceanSunDir.y) * 14.0, -1.0, 1.0);
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

const SEABED_FRAGMENT = /* glsl */ `
uniform vec2 uOceanStops;
${DEPTH_GLSL}
${REGION_GLSL}
uniform vec3 uOceanCard;
uniform vec3 uOceanSeabed; uniform vec3 uOceanSunDir; uniform vec2 uOceanEdge;
varying vec3 vWorld;
varying float vClipY;
void main() {
  vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  if (n.y < 0.0) n = -n;
  vec3 depthAt = oceanDepthAt(vWorld.xz);
  OceanWater water = oceanWaterAt(vWorld.xz);
  // Wet sand at the waterline brightens to clean sand under the shallows, broken by seagrass.
  vec3 sand = mix(water.sandWet, water.sandShallow, smoothstep(-.02, .18, depthAt.y));
  sand = mix(sand, water.seagrass, depthAt.z * uOceanSeabed.z);
  sand *= 1.0 + uOceanSeabed.y * clamp((dot(n, uOceanSunDir) - uOceanSunDir.y) * 6.0, -1.0, 1.0);
  // The deeper the seabed, the more it disappears into the water color.
  float fade = 1.0 - exp(-depthAt.x / water.clarity.x);
  vec3 color = mix(sand, oceanWaterColorIn(water, depthAt.x), fade);
  color = mix(color, uOceanCard, smoothstep(uOceanEdge.x, uOceanEdge.y, abs(vClipY)));
  gl_FragColor = linearToOutputTexel(vec4(color, 1.0));
}`;

/** The box reaching `extent` units each way from every island's middle (x0, z0, width, depth). */
function oceanBox(field: DepthField, extent: number) {
  const xs = field.islands.map((i) => i.x), zs = field.islands.map((i) => i.z);
  const x0 = Math.min(...xs) - extent, z0 = Math.min(...zs) - extent;
  return { x0, z0, width: Math.max(...xs) + extent - x0, depth: Math.max(...zs) + extent - z0 };
}

/** A jittered triangle lattice: irregular low-poly facets instead of a visible grid, `extent` units each way from every island's middle. */
function waterLattice(field: DepthField, config: OceanConfig, extent: number) {
  const s = config.facetSize, h = s * Math.sqrt(3) / 2, box = oceanBox(field, extent);
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
export function createWaterMesh(uniforms: OceanUniforms, field: DepthField, config: OceanConfig = OCEAN, extent = OCEAN.waterExtent) {
  const geometry = waterLattice(field, config, extent);
  const material = new ShaderMaterial({
    uniforms, vertexShader: WATER_VERTEX, fragmentShader: WATER_FRAGMENT,
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
export function createLiteOceanMesh(uniforms: OceanUniforms, field: DepthField, config: OceanConfig = OCEAN, extent = OCEAN.waterExtent) {
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
 * The seabed: a radial terrain around each island (beach slope, sandy shelf, reef
 * drop-off, deep floor) with a little relief. It is a backdrop drawn first without
 * depth testing, so swimmers are never hidden behind it. Under water that reaches
 * past OCEAN.waterExtent (`reach`, the explorer's), the deep floor goes on under all
 * of it, past the water's corners. With several islands, each one's terrain stops
 * short of its neighbours' and a coarse deep floor lies under the open sea between
 * them (drawn first, so the islands' terrain lies over it).
 */
export function createSeabedMesh(uniforms: OceanUniforms, field: DepthField, level: number, reach = OCEAN.waterExtent) {
  const rays = 96;
  const near = [-.12, -.04, 0, .04, .08, .12, .17, .23, .3, .38, .47, .57, .68, .8, .95, 1.15, 1.4, 1.75, 2.2, 2.8, 3.6, 4.6, 6, 8, 10.5];
  const corner = reach * Math.SQRT2 + 1;
  const alone = field.islands.length === 1;
  // Alone, out past the water's corners; among others, no farther than halfway to the nearest (less its own size).
  const spacing = (island: OceanIsland) => Math.min(...field.islands.filter((other) => other !== island).map((other) => Math.hypot(other.x - island.x, other.z - island.z)));
  const offsetsFor = (island: OceanIsland) => {
    if (alone) return corner > 12 ? [...near, ...[14, 18, 23, 28].filter((o, i, all) => o < corner || all[i - 1] < corner)] : near;
    const limit = spacing(island) / 2 - 2.6;
    return near.filter((o, i) => o <= limit || i < 4);
  };
  const outline = shoreline().getPoints(24).map((p) => [p.x * islandScale(level), -p.y * islandScale(level)] as const);
  // Distance from the island center to its shore along each ray.
  const shoreRadius = (angle: number) => {
    const dx = Math.cos(angle), dz = Math.sin(angle);
    let best = 0;
    for (let i = 0; i < outline.length; i++) {
      const [ax, az] = outline[i], [bx, bz] = outline[(i + 1) % outline.length];
      const ex = bx - ax, ez = bz - az, det = dx * -ez + dz * ex;
      if (Math.abs(det) < 1e-9) continue;
      const t = (ax * -ez + az * ex) / det, u = (dx * az - dz * ax) / det;
      if (t > 0 && u >= 0 && u <= 1) best = Math.max(best, t);
    }
    return best;
  };
  const positions: number[] = [], indices: number[] = [];
  // The open sea's floor between the islands: a coarse grid under all the water.
  if (!alone) {
    const box = oceanBox(field, reach), step = 1.5;
    const cols = Math.ceil(box.width / step) + 1, rows = Math.ceil(box.depth / step) + 1;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = box.x0 + c * step, z = box.z0 + r * step;
        positions.push(x, field.profile(x, z).floor, z);
      }
    }
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const a = r * cols + c;
        indices.push(a, a + cols, a + 1, a + 1, a + cols, a + cols + 1);
      }
    }
  }
  for (const island of field.islands) {
    const offsets = offsetsFor(island), first = positions.length / 3;
    for (let r = 0; r < rays; r++) {
      const angle = Math.PI * 2 * r / rays, radius = shoreRadius(angle);
      for (const [k, offset] of offsets.entries()) {
        const jitter = k > 1 && k < offsets.length - 2 ? (hash(r, k) - .5) * .08 * Math.min(1, offset) : 0;
        const x = island.x + Math.cos(angle) * (radius + offset + jitter), z = island.z + Math.sin(angle) * (radius + offset + jitter);
        const { floor } = field.profile(x, z);
        // Gentle ripples on the sandy shelf, growing into rougher reef past its edge.
        const roughness = .018 + .07 * Math.min(1, Math.max(0, (offset - .6) / 1.2)) ** 2;
        const relief = (hash(r * 3.1, k * 7.7) - .5) * roughness * Math.min(1, Math.max(0, offset * 4));
        positions.push(x, floor + relief, z);
      }
    }
    const n = offsets.length;
    for (let r = 0; r < rays; r++) {
      for (let k = 0; k < n - 1; k++) {
        const a = first + r * n + k, b = first + ((r + 1) % rays) * n + k;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(new Uint16BufferAttribute(indices, 1));
  geometry.computeBoundingSphere();
  const material = new ShaderMaterial({
    uniforms, vertexShader: SEABED_VERTEX, fragmentShader: SEABED_FRAGMENT, depthWrite: false, depthTest: false, side: DoubleSide,
  });
  const mesh = new Mesh(geometry, material);
  mesh.name = 'ocean-seabed';
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  mesh.raycast = () => {};
  return mesh;
}
