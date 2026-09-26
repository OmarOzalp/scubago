import {
  BufferGeometry, Color, DataTexture, DoubleSide, Float32BufferAttribute, LinearFilter, Mesh, RGBAFormat, ShaderMaterial,
  Uint16BufferAttribute, UnsignedByteType, Vector2, Vector3, Vector4,
} from 'three';
import type { Habitat } from '@/lib/home';
import { OCEAN, seabedProfile, shelfStretch, waveTerms, type OceanConfig } from '@/lib/ocean';
import { islandScale, shoreDistance, shorePolygons, shoreline } from './island-shape';

/**
 * The ocean around the island: a low-poly water surface displaced by several
 * wave layers, a seabed that rises into a turquoise shelf, and the uniforms the
 * swimming animals share so they tint and wobble with the same water.
 *
 * Cost: waves are evaluated per vertex (about 2k vertices); each surface pixel
 * does one depth lookup and a few lighting terms. No render targets, depth
 * textures or post-processing.
 */

const DEPTH_AREA = { x0: -9, z0: -9, size: 18, resolution: 128, maxDepth: 4 };
const WAVES = Object.keys(OCEAN.waves).length;

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
    uOceanDepthArea: { value: new Vector4(DEPTH_AREA.x0, DEPTH_AREA.z0, DEPTH_AREA.size, DEPTH_AREA.maxDepth) },
  };
  applyOceanPalette(uniforms, habitat, card, config);
  return uniforms;
}
export type OceanUniforms = ReturnType<typeof createOceanUniforms>;

export function applyOceanPalette(uniforms: OceanUniforms, habitat: Habitat, card?: string, config: OceanConfig = OCEAN) {
  const p = config.palettes[habitat];
  uniforms.uOceanShallow.value.copy(linear(p.shallow));
  uniforms.uOceanMid.value.copy(linear(p.mid));
  uniforms.uOceanDeep.value.copy(linear(p.deep));
  uniforms.uOceanSandShallow.value.copy(linear(p.sandShallow));
  uniforms.uOceanSandWet.value.copy(linear(p.sandWet));
  uniforms.uOceanPatch.value.copy(linear(p.patch));
  uniforms.uOceanSky.value.copy(linear(p.sky));
  // The sun highlight is added after blending-space conversion, so it is stored as display values.
  uniforms.uOceanSun.value.copy(linear(p.sun).convertLinearToSRGB());
  uniforms.uOceanFoam.value.copy(linear(p.foam));
  uniforms.uOceanCard.value.copy(linear(card ?? p.sky));
}

/** Advance the shared water clock (the waves, foam and animal wobble all follow it). */
export function setOceanTime(uniforms: OceanUniforms, time: number) {
  uniforms.uOceanTime.value = time;
}

/** Point the shaders at the current level's depth map. */
export function setOceanDepthMap(uniforms: OceanUniforms, texture: DataTexture | null) {
  uniforms.uOceanDepthMap.value = texture;
}

/** Water body color at a depth, matching the shaders (for tinting static props). */
export function waterColorAt(habitat: Habitat, depth: number, config: OceanConfig = OCEAN) {
  const s = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const { mid, deep } = config.shoreDepthRange, p = config.palettes[habitat];
  return linear(p.shallow).lerp(linear(p.mid), s(0, mid, depth)).lerp(linear(p.deep), s(mid * .5, deep, depth));
}

/** Smooth value noise in 0..1 with features about one unit across. */
function valueNoise(x: number, z: number) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

/** Seagrass and rubble on the shelf: soft-edged patches that thin out over deep water. */
function seabedPatch(x: number, z: number, distance: number) {
  const n = valueNoise(x * 1.7 + 11, z * 1.7 - 5) * .65 + valueNoise(x * 4.1 - 3, z * 4.1 + 7) * .35;
  const s = (a: number, b: number, v: number) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  return s(.52, .72, n) * s(.06, .3, distance) * (1 - s(1.4, 2.4, distance));
}

/**
 * Water depth around the island at this level, baked into a small texture the
 * surface and seabed sample per pixel. R: depth below the surface (sqrt-encoded
 * for precision near the shore); G: how far above the surface the beach rises;
 * B: seagrass patches on the shelf.
 */
export function buildDepthField(level: number, config: OceanConfig = OCEAN) {
  const polygons = shorePolygons(level);
  const { x0, z0, size, resolution, maxDepth } = DEPTH_AREA;
  // The shelf widens and narrows around the coast; the land itself is unchanged.
  const reach = (x: number, z: number) => {
    const distance = shoreDistance(polygons, x, z);
    return distance > 0 ? distance / shelfStretch(x, z, config) : distance;
  };
  const data = new Uint8Array(resolution * resolution * 4);
  for (let j = 0; j < resolution; j++) {
    for (let i = 0; i < resolution; i++) {
      const x = x0 + (i + .5) / resolution * size, z = z0 + (j + .5) / resolution * size;
      const distance = reach(x, z);
      const { depth, wet } = seabedProfile(distance, config);
      const k = (j * resolution + i) * 4;
      data[k] = Math.round(255 * Math.sqrt(Math.min(1, depth / maxDepth)));
      data[k + 1] = Math.round(255 * Math.min(1, Math.max(0, -wet) / .2));
      data[k + 2] = Math.round(255 * seabedPatch(x, z, distance));
      data[k + 3] = 255;
    }
  }
  const texture = new DataTexture(data, resolution, resolution, RGBAFormat, UnsignedByteType);
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  return { texture, polygons, profile: (x: number, z: number) => seabedProfile(reach(x, z), config) };
}
export type DepthField = ReturnType<typeof buildDepthField>;

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
  vec4 t = texture2D(uOceanDepthMap, (xz - uOceanDepthArea.xy) / uOceanDepthArea.z);
  float depth = t.r * t.r * uOceanDepthArea.w;
  return vec3(depth, depth - t.g * .2, t.b);
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
${COLOR_GLSL}
${DEPTH_GLSL}
uniform vec3 uOceanSky; uniform vec3 uOceanSun; uniform vec3 uOceanFoam;
uniform vec2 uOceanOpacity; uniform float uOceanShoreClear; uniform float uOceanFacet;
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
  float wet = depthAt.y + vWave;
  // No water above the exposed beach; fully clear right at the waterline.
  float shore = smoothstep(0.0, uOceanShoreClear, wet);
  // Facets tilted toward the sun read a little brighter, away a little darker.
  float facet = clamp((dot(n, uOceanSunDir) - uOceanSunDir.y) * 14.0, -1.0, 1.0);
  vec3 color = mix(oceanWaterColor(depthAt.x) * (1.0 + uOceanFacet * facet), uOceanSky, vReflection);
  // Soft daylight on the few facets tipped furthest toward the sun; the smooth wave normal
  // rounds off each highlight so facets catch the light without sparkling.
  vec3 glintNormal = normalize(mix(n, normalize(vSmoothNormal), uOceanSpecular.z));
  float glint = uOceanSpecular.x * pow(max(dot(glintNormal, uOceanSpecularDir), 0.0), uOceanSpecular.y);
  // Clear in the shallows, richer farther out, so the life below stays visible.
  float alpha = (mix(uOceanOpacity.x, uOceanOpacity.y, smoothstep(0.0, uOceanStops.y, depthAt.x)) + vReflection * .45) * shore;
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
${COLOR_GLSL}
${DEPTH_GLSL}
uniform vec3 uOceanSandShallow; uniform vec3 uOceanSandWet; uniform vec3 uOceanPatch; uniform vec3 uOceanCard;
uniform vec3 uOceanSeabed; uniform vec3 uOceanSunDir; uniform vec2 uOceanEdge;
varying vec3 vWorld;
varying float vClipY;
void main() {
  vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  if (n.y < 0.0) n = -n;
  vec3 depthAt = oceanDepthAt(vWorld.xz);
  // Wet sand at the waterline brightens to clean sand under the shallows, broken by seagrass.
  vec3 sand = mix(uOceanSandWet, uOceanSandShallow, smoothstep(-.02, .18, depthAt.y));
  sand = mix(sand, uOceanPatch, depthAt.z * uOceanSeabed.z);
  sand *= 1.0 + uOceanSeabed.y * clamp((dot(n, uOceanSunDir) - uOceanSunDir.y) * 6.0, -1.0, 1.0);
  // The deeper the seabed, the more it disappears into the water color.
  float fade = 1.0 - exp(-depthAt.x / uOceanSeabed.x);
  vec3 color = mix(sand, oceanWaterColor(depthAt.x), fade);
  color = mix(color, uOceanCard, smoothstep(uOceanEdge.x, uOceanEdge.y, abs(vClipY)));
  gl_FragColor = linearToOutputTexel(vec4(color, 1.0));
}`;

/** A jittered triangle lattice: irregular low-poly facets instead of a visible grid. */
export function createWaterMesh(uniforms: OceanUniforms, field: DepthField, config: OceanConfig = OCEAN) {
  const s = config.facetSize, h = s * Math.sqrt(3) / 2, extent = 8.6;
  const cols = Math.ceil(extent * 2 / s) + 1, rows = Math.ceil(extent * 2 / h) + 1;
  const positions: number[] = [], shoaling: number[] = [], indices: number[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const edge = r === 0 || c === 0 || r === rows - 1 || c === cols - 1;
      const jx = edge ? 0 : (hash(c, r) - .5) * .36 * s, jz = edge ? 0 : (hash(r, c + 17) - .5) * .36 * s;
      const x = -extent + c * s + (r % 2) * s / 2 + jx, z = -extent + r * h + jz;
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
 * The seabed: a radial terrain around the island (beach slope, sandy shelf,
 * reef drop-off, deep floor) with a little relief. It is a backdrop drawn first
 * without depth testing, so swimmers are never hidden behind it.
 */
export function createSeabedMesh(uniforms: OceanUniforms, field: DepthField, level: number) {
  const rays = 96;
  const offsets = [-.12, -.04, 0, .04, .08, .12, .17, .23, .3, .38, .47, .57, .68, .8, .95, 1.15, 1.4, 1.75, 2.2, 2.8, 3.6, 4.6, 6, 8, 10.5];
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
  for (let r = 0; r < rays; r++) {
    const angle = Math.PI * 2 * r / rays, radius = shoreRadius(angle);
    for (const [k, offset] of offsets.entries()) {
      const jitter = k > 1 && k < offsets.length - 2 ? (hash(r, k) - .5) * .08 * Math.min(1, offset) : 0;
      const x = Math.cos(angle) * (radius + offset + jitter), z = Math.sin(angle) * (radius + offset + jitter);
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
      const a = r * n + k, b = ((r + 1) % rays) * n + k;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
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
