import { Color, DoubleSide, MeshPhongMaterial } from 'three';
import { OCEAN_SHADER_CHUNKS, type OceanUniforms } from './ocean-mesh';
import { underwaterTintGLSL, underwaterVertexGLSL } from './underwater-material';

/**
 * The tuna school's material: one opaque, vertex-colored material for every fish in the instanced
 * mesh. Each fish swims in the vertex shader from its `swim` instance attribute (x tail phase in
 * radians, y tail amplitude and z body bend, both in body lengths): a wave that grows toward the
 * tail and travels back along the body, a slight counter-sway of the head, and a curve into turns.
 * A faint specular glint slides over the backs and flanks as the fish turn, for a metallic sheen.
 *
 * The fish share the island's water with the other animals (the same depth tint, refraction, lite
 * surface tint and top and bottom haze; see underwater-material.ts). They never dive, so unlike the
 * other animals they need no fade and can stay opaque: one draw call for the whole school.
 */
export function createSchoolMaterial(ocean: OceanUniforms, lite = false) {
  const material = new MeshPhongMaterial({ vertexColors: true, side: DoubleSide, specular: new Color('#141b22'), shininess: 30 });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, ocean);
    shader.vertexShader = `attribute vec4 swim;\nuniform float uOceanSurface;\nuniform float uOceanDistortion;\nuniform vec2 uOceanEdge;
varying float vOceanDepth;\nvarying float vOceanHaze;\n${OCEAN_SHADER_CHUNKS.waves}\n${shader.vertexShader}`
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        // Model space: snout at z = +0.5, tail tips at z = -0.5, +x on the fish's left.
        float swimAlong = clamp((0.06 - position.z) / 0.56, 0.0, 1.0);
        float headward = smoothstep(0.2, 0.5, position.z);
        transformed.x += swim.y * swimAlong * swimAlong * sin(swim.x - swimAlong * 2.6)
          - swim.y * 0.1 * headward * sin(swim.x)
          + swim.z * (position.z - 0.05) * (position.z - 0.05);`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        #ifdef USE_INSTANCING
          vec4 oceanWorld = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
        #else
          vec4 oceanWorld = modelMatrix * vec4(transformed, 1.0);
        #endif${underwaterVertexGLSL(lite)}`);
    shader.fragmentShader = `uniform vec4 uOceanUnderwater;\nuniform vec3 uOceanCard;\nuniform vec2 uOceanOpacity;\nvarying float vOceanDepth;\nvarying float vOceanHaze;\n${OCEAN_SHADER_CHUNKS.color}\n${shader.fragmentShader}`
      .replace('#include <opaque_fragment>', `${underwaterTintGLSL(lite)}
        outgoingLight = mix(outgoingLight, uOceanCard, vOceanHaze);
        #include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => (lite ? 'marine-school-v1-lite' : 'marine-school-v1');
  return material;
}
