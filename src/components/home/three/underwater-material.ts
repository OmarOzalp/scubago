import { BufferGeometry, Float32BufferAttribute, Material, Object3D, Vector2, Vector3, Vector4, type Mesh } from 'three';
import { createOceanUniforms, OCEAN_SHADER_CHUNKS, type OceanUniforms } from './ocean-mesh';

/**
 * Vertex GLSL, after `#include <project_vertex>` with the vertex's world position in
 * `oceanWorld`: its depth below the moving surface, a slight refraction shift for deeper
 * vertices (full quality only; lite measures from the calm surface level), and the top and
 * bottom haze. Shared with the tuna school (school-material.ts).
 */
export const underwaterVertexGLSL = (lite: boolean) => `${lite ? `
              vOceanDepth = max(0.0, uOceanSurface - oceanWorld.y);` : `
              // Depth below the moving surface; the waves bend the view of deeper animals a little more.
              vOceanDepth = max(0.0, uOceanSurface + oceanWave(oceanWorld.xz).y - oceanWorld.y);
              vec2 oceanShift = oceanSlope(oceanWorld.xz) * (uOceanDistortion * vOceanDepth);
              mvPosition.xyz += (viewMatrix * vec4(oceanShift.x, 0.0, oceanShift.y, 0.0)).xyz;
              gl_Position = projectionMatrix * mvPosition;`}
              // The same haze as the water at the top and bottom of the view.
              vOceanHaze = smoothstep(uOceanEdge.x, uOceanEdge.y, abs(gl_Position.y / gl_Position.w));`;

/**
 * Fragment GLSL, before `#include <opaque_fragment>`: deeper water softens the color (less
 * saturation, more of the water's own tone), plus the surface's tint in lite quality, where the
 * ocean has no separate surface layer drawn on top. Shared with the tuna school.
 */
export const underwaterTintGLSL = (lite: boolean) => `
              // Deeper water softens the animal: less saturation and more of the water's own color.
              vec3 oceanTone = oceanWaterColor(vOceanDepth);
              float oceanMurk = 1.0 - exp(-max(0.0, vOceanDepth - uOceanUnderwater.x) / uOceanUnderwater.y);
              outgoingLight = mix(outgoingLight, vec3(dot(outgoingLight, vec3(.2126, .7152, .0722))), uOceanUnderwater.w * oceanMurk);
              outgoingLight = mix(outgoingLight, oceanTone, uOceanUnderwater.z * oceanMurk);${lite ? `
              // The surface layer's own tint (the full ocean draws it over the animals as a separate pass),
              // below the surface only: a dolphin's fin breaking it stays clear, as in full quality.
              outgoingLight = mix(outgoingLight, oceanWaterColor(1.8), uOceanOpacity.y * .85 * smoothstep(0.0, .03, vOceanDepth));` : ''}`;

/**
 * The reef's animals and rocks (reef-life.ts) draw a little differently. `bias` (world units) puts
 * them that much farther back in depth than they are, so an open-water animal passing over the reef
 * is never hidden by an animal or rock on the bottom (as it never is by the seabed itself), while the
 * reef's own animals and rocks still hide one another as they should. An animal can be partly out
 * of sight in a den (setHide: shares of its length from the tail and from the head) and take on a
 * color state (setTone: brightness, saturation and contrast about its own average). `seabed` (0 to 1)
 * tints a rock toward the water above it as the seabed's props are, rather than like an animal.
 */
export type ReefLook = { bias: number; seabed?: number };
/**
 * How far back (world units) the reef's animals and rocks on the bottom are drawn: enough to pass
 * behind any open-water animal over them, even one on its way down into a dive.
 */
export const FLOOR_BIAS = 1;

/**
 * Animals share the island's water: below the moving surface they take on its
 * color and lose a little saturation with depth, waves refract them slightly,
 * and they fade head-first when they dive out of sight. Bind-pose length
 * coordinates travel with the skin, keeping the fade attached to the animal.
 *
 * `lite` (software-rendered GPUs) measures depth from the calm surface level with
 * no wave math per vertex, and lays the surface's tint over the animal here,
 * because the lite ocean has no separate surface layer drawn on top.
 */
export function prepareUnderwater(instance: Object3D, ocean: OceanUniforms = createOceanUniforms(), lite = false, reef?: ReefLook) {
  const depth = { value: 0 };
  const surfacing = { value: 0 };
  // Reef animals only: in-den cut (from the tail, from the head), color state (brightness, saturation, contrast, its average), depth bias, seabed tint.
  const hide = { value: new Vector2(0, 0) }, tone = { value: new Vector4(1, 1, 1, .2) };
  const bias = { value: reef?.bias ?? 0 }, seabed = { value: reef?.seabed ?? 0 };
  let luma = 0, colors = 0;
  const materials = new Map<Material, Material>();
  const geometries: BufferGeometry[] = [];
  const meshes: Mesh[] = [];
  const point = new Vector3();
  let tail = Infinity, head = -Infinity;
  instance.updateMatrixWorld(true);
  instance.traverse((object) => {
    // Checked by flag, not instanceof, so meshes built by another copy of three.js qualify too
    // (the Node verification scripts load one for the asset loader and one for this module).
    if (!(object as Mesh).isMesh) return;
    const mesh = object as Mesh;
    meshes.push(mesh);
    const positions = mesh.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);
      tail = Math.min(tail, point.z); head = Math.max(head, point.z);
    }
    // A color state's contrast works about the model's average shade.
    const color = mesh.geometry.attributes.color;
    if (reef && color) for (let i = 0; i < color.count; i++) { luma += .2126 * color.getX(i) + .7152 * color.getY(i) + .0722 * color.getZ(i); colors++; }
  });
  if (colors) tone.value.w = luma / colors;
  for (const object of meshes) {
    const geometry = object.geometry.clone();
    geometries.push(geometry);
    const positions = geometry.attributes.position;
    const along = new Float32Array(positions.count);
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i).applyMatrix4(object.matrixWorld);
      along[i] = (point.z - tail) / Math.max(head - tail, .0001);
    }
    geometry.setAttribute('diveAlong', new Float32BufferAttribute(along, 1));
    object.geometry = geometry;
    const own = (source: Material) => {
      if (!materials.has(source)) {
        const material = source.clone();
        material.transparent = true;
        material.forceSinglePass = true;
        material.onBeforeCompile = (shader) => {
          // The water's uniforms are shared objects, so every animal follows the same waves and palette.
          Object.assign(shader.uniforms, ocean, { diveDepth: depth, surfacing }, reef ? { diveHide: hide, diveTone: tone, diveBias: bias, diveSeabed: seabed } : {});
          shader.vertexShader = `attribute float diveAlong;\nuniform float diveDepth;\nuniform float surfacing;\nuniform float uOceanSurface;\nuniform float uOceanDistortion;\nuniform vec2 uOceanEdge;
varying float submersion;\nvarying float vOceanDepth;\nvarying float vOceanHaze;\n${OCEAN_SHADER_CHUNKS.waves}\n${shader.vertexShader}`
            .replace('#include <begin_vertex>', `#include <begin_vertex>
              // The fade waits until the dive is under way, so the animal first sinks into the blue.
              float diveFade = clamp((diveDepth - .2) / .8, 0.0, 1.0);
              submersion = smoothstep(0.0, .45, diveFade * 1.45 - (1.0 - diveAlong));
              float emergence = smoothstep(0.0, .45, (1.0 - diveFade) * 1.45 - (1.0 - diveAlong));
              submersion = mix(submersion, 1.0 - emergence, surfacing);`)
            .replace('#include <project_vertex>', `#include <project_vertex>
              vec4 oceanWorld = modelMatrix * vec4(transformed, 1.0);${underwaterVertexGLSL(lite)}${reef ? `
              // Reef: drawn farther back than it is (see ReefLook), and where along its body each fragment is.
              gl_Position.z -= projectionMatrix[2][2] * diveBias * gl_Position.w;
              vDiveAlong = diveAlong;` : ''}`);
          if (reef) {
            shader.vertexShader = `uniform float diveBias;\nvarying float vDiveAlong;\n${shader.vertexShader}`;
            shader.fragmentShader = `uniform vec2 diveHide;\nuniform vec4 diveTone;\nuniform float diveSeabed;\nuniform vec3 uOceanSeabed;\nvarying float vDiveAlong;\n${shader.fragmentShader}`
              .replace('#include <color_fragment>', `#include <color_fragment>
              // The part of it inside a den is out of sight.
              if (vDiveAlong < diveHide.x || vDiveAlong > 1.0 - diveHide.y) discard;
              // Its color state: saturation, then contrast about its average shade, then brightness.
              float toneLuma = dot(diffuseColor.rgb, vec3(.2126, .7152, .0722));
              diffuseColor.rgb = max(vec3(0.0), (mix(vec3(toneLuma), diffuseColor.rgb, diveTone.y) - diveTone.w) * diveTone.z + diveTone.w) * diveTone.x;`);
          }
          shader.fragmentShader = `uniform vec4 uOceanUnderwater;\nuniform vec3 uOceanCard;\nuniform vec2 uOceanOpacity;\nvarying float submersion;\nvarying float vOceanDepth;\nvarying float vOceanHaze;\n${OCEAN_SHADER_CHUNKS.color}\n${shader.fragmentShader}`
            .replace('#include <opaque_fragment>', `${underwaterTintGLSL(lite)}${reef ? `
              // A rock takes on the water above it like the seabed's props.
              outgoingLight = mix(outgoingLight, oceanWaterColor(vOceanDepth), diveSeabed * (1.0 - exp(-max(0.0, vOceanDepth - .15) / uOceanSeabed.x)));` : ''}
              outgoingLight = mix(outgoingLight, oceanTone, submersion * .8);
              outgoingLight = mix(outgoingLight, uOceanCard, vOceanHaze);
              diffuseColor.a *= 1.0 - submersion;
              if (diffuseColor.a < .005) discard;
              #include <opaque_fragment>`);
        };
        material.customProgramCacheKey = () => `marine-ocean-water-v2${lite ? '-lite' : ''}${reef ? '-reef' : ''}`;
        materials.set(source, material);
      }
      return materials.get(source)!;
    };
    object.material = Array.isArray(object.material) ? object.material.map(own) : own(object.material);
    object.renderOrder = 1;
  }
  return {
    depth, surfacing, setDepth: (value: number, rising = false) => { depth.value = value; surfacing.value = rising ? 1 : 0; },
    /** Reef animals: how much of it is inside a den, from the tail and from the head (shares of its length). */
    setHide: (rear: number, front: number) => { hide.value.set(rear, front); },
    /** Reef animals: its color state (1, 1, 1 is its own coloring). */
    setTone: (brightness: number, saturation: number, contrast: number) => { tone.value.x = brightness; tone.value.y = saturation; tone.value.z = contrast; },
    dispose: () => {
    materials.forEach((material) => material.dispose());
    geometries.forEach((geometry) => geometry.dispose());
  } };
}
