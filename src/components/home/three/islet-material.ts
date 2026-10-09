import type { Material, Mesh, Object3D } from 'three';
import { OCEAN_SHADER_CHUNKS, type OceanUniforms } from './ocean-mesh';

/**
 * While an islet rises from the water (unlock.tsx), whatever is still below the surface looks it:
 * under the moving waterline it takes on the water's color, and deeper down it fades from sight, so
 * the waterline crosses it as it comes up. The same water the animals swim in (underwater-material.ts);
 * lite quality measures from the calm surface. Returns a function that puts the islet's own materials
 * back, after which it looks exactly as it always has.
 */
export function submerge(object: Object3D, ocean: OceanUniforms, lite: boolean): () => void {
  const swapped: [Mesh, Material | Material[]][] = [];
  const clones = new Map<Material, Material>();
  const own = (source: Material) => {
    let material = clones.get(source);
    if (!material) {
      material = source.clone();
      material.transparent = true;
      material.onBeforeCompile = (shader) => {
        // Shared uniforms: the islet follows the same waves and palette as the water around it.
        Object.assign(shader.uniforms, ocean);
        shader.vertexShader = `${OCEAN_SHADER_CHUNKS.waves}\nuniform float uOceanSurface;\nvarying float vSubmerged;\n${shader.vertexShader}`
          .replace('#include <project_vertex>', `#include <project_vertex>
            vec4 isletWorld = modelMatrix * vec4(transformed, 1.0);
            vSubmerged = uOceanSurface ${lite ? '' : '+ oceanWave(isletWorld.xz).y '}- isletWorld.y;`);
        shader.fragmentShader = `${OCEAN_SHADER_CHUNKS.color}\nvarying float vSubmerged;\n${shader.fragmentShader}`
          .replace('#include <opaque_fragment>', `
            // Just under the surface it takes the water's tone; deeper, it fades out of sight.
            float isletUnder = smoothstep(-.01, .12, vSubmerged);
            outgoingLight = mix(outgoingLight, oceanWaterColor(.35 + vSubmerged * 1.5), isletUnder * .75);
            diffuseColor.a *= 1.0 - smoothstep(.12, .5, vSubmerged);
            #include <opaque_fragment>`);
      };
      material.customProgramCacheKey = () => (lite ? 'islet-rising-lite' : 'islet-rising');
      clones.set(source, material);
    }
    return material;
  };
  object.traverse((child) => {
    const mesh = child as Mesh;
    if (!mesh.isMesh) return;
    swapped.push([mesh, mesh.material]);
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(own) : own(mesh.material);
    // Drawn after the water, like the animals, so its own tint shows what is under it.
    mesh.renderOrder = 1;
  });
  return () => {
    for (const [mesh, material] of swapped) { mesh.material = material; mesh.renderOrder = 0; }
    clones.forEach((material) => material.dispose());
  };
}
