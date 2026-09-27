import { BufferGeometry, Float32BufferAttribute, Material, Object3D, Vector3, type Mesh } from 'three';
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
              // The surface layer's own tint (the full ocean draws it over the animals as a separate pass).
              outgoingLight = mix(outgoingLight, oceanWaterColor(1.8), uOceanOpacity.y * .85);` : ''}`;

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
export function prepareUnderwater(instance: Object3D, ocean: OceanUniforms = createOceanUniforms(), lite = false) {
  const depth = { value: 0 };
  const surfacing = { value: 0 };
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
  });
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
          Object.assign(shader.uniforms, ocean, { diveDepth: depth, surfacing });
          shader.vertexShader = `attribute float diveAlong;\nuniform float diveDepth;\nuniform float surfacing;\nuniform float uOceanSurface;\nuniform float uOceanDistortion;\nuniform vec2 uOceanEdge;
varying float submersion;\nvarying float vOceanDepth;\nvarying float vOceanHaze;\n${OCEAN_SHADER_CHUNKS.waves}\n${shader.vertexShader}`
            .replace('#include <begin_vertex>', `#include <begin_vertex>
              // The fade waits until the dive is under way, so the animal first sinks into the blue.
              float diveFade = clamp((diveDepth - .2) / .8, 0.0, 1.0);
              submersion = smoothstep(0.0, .45, diveFade * 1.45 - (1.0 - diveAlong));
              float emergence = smoothstep(0.0, .45, (1.0 - diveFade) * 1.45 - (1.0 - diveAlong));
              submersion = mix(submersion, 1.0 - emergence, surfacing);`)
            .replace('#include <project_vertex>', `#include <project_vertex>
              vec4 oceanWorld = modelMatrix * vec4(transformed, 1.0);${underwaterVertexGLSL(lite)}`);
          shader.fragmentShader = `uniform vec4 uOceanUnderwater;\nuniform vec3 uOceanCard;\nuniform vec2 uOceanOpacity;\nvarying float submersion;\nvarying float vOceanDepth;\nvarying float vOceanHaze;\n${OCEAN_SHADER_CHUNKS.color}\n${shader.fragmentShader}`
            .replace('#include <opaque_fragment>', `${underwaterTintGLSL(lite)}
              outgoingLight = mix(outgoingLight, oceanTone, submersion * .8);
              outgoingLight = mix(outgoingLight, uOceanCard, vOceanHaze);
              diffuseColor.a *= 1.0 - submersion;
              if (diffuseColor.a < .005) discard;
              #include <opaque_fragment>`);
        };
        material.customProgramCacheKey = () => (lite ? 'marine-ocean-water-v2-lite' : 'marine-ocean-water-v2');
        materials.set(source, material);
      }
      return materials.get(source)!;
    };
    object.material = Array.isArray(object.material) ? object.material.map(own) : own(object.material);
    object.renderOrder = 1;
  }
  return { depth, surfacing, setDepth: (value: number, rising = false) => { depth.value = value; surfacing.value = rising ? 1 : 0; }, dispose: () => {
    materials.forEach((material) => material.dispose());
    geometries.forEach((geometry) => geometry.dispose());
  } };
}
