import { useContext, useEffect, useMemo } from 'react';
import { DoubleSide, Mesh, MeshLambertMaterial, Vector4 } from 'three';
import { KELP, kelpPlants } from '@/lib/kelp';
import { buildKelpGeometry, KELP_DETAIL } from './kelp-geometry';
import { createKelpMovers, KELP_MOVERS, KelpMoversContext, type KelpMovers } from './kelp-movers';
import { createOceanUniforms, OCEAN_SHADER_CHUNKS, type OceanUniforms } from './ocean-mesh';
import { OceanContext } from './ocean-context';
import { useSceneQuality } from './scene-quality';
import { underwaterTintGLSL, underwaterVertexGLSL } from './underwater-material';

/**
 * Kelp's material: vertex-colored and double-sided, swaying in the vertex shader from each vertex's
 * `aKelp` (see kelp-geometry.ts). The surge swings the stipes back and forth, more toward the top,
 * as a wave travelling through the forest; the canopy floats on the surface waves and meanders; the
 * blades flutter. Animals swimming through it push it aside (`movers`, see kelp-movers.ts): the
 * stipes and blades near one bend away from it, more toward their tops. Under the surface the kelp
 * takes on the water like the animals (the same depth tint, refraction and haze; see
 * underwater-material.ts), so the stipes fade into the green below the golden canopy.
 */
export function createKelpMaterial(ocean: OceanUniforms, lite = false, movers: KelpMovers = createKelpMovers()) {
  const material = new MeshLambertMaterial({ vertexColors: true, side: DoubleSide });
  const surge = { value: new Vector4(Math.cos(KELP.current), Math.sin(KELP.current), KELP.surge.reach, Math.PI * 2 / KELP.surge.period) };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, ocean, { uKelpSurge: surge, uKelpMovers: movers });
    shader.vertexShader = `#define KELP_MOVERS ${KELP_MOVERS}\n${lite ? '#define KELP_LITE\n' : ''}attribute vec4 aKelp;\nattribute vec2 aAnchor;\nuniform vec4 uKelpSurge;\nuniform vec4 uKelpMovers[KELP_MOVERS * 2];\nuniform float uOceanSurface;\nuniform float uOceanDistortion;\nuniform vec2 uOceanEdge;
varying float vOceanDepth;\nvarying float vOceanHaze;\n${OCEAN_SHADER_CHUNKS.waves}\n${shader.vertexShader}`
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        // The surge: a slow swing along the current, travelling through the forest, bending the stipes from the holdfast up.
        vec2 kelpFlow = uKelpSurge.xy, kelpSide = vec2(-kelpFlow.y, kelpFlow.x);
        float kelpSwing = sin(uKelpSurge.w * uOceanTime + aKelp.z * .35 - dot(kelpFlow, position.xz) * .55);
        transformed.xz += kelpFlow * (uKelpSurge.z * pow(aKelp.x, 1.6) * kelpSwing);
        // The canopy meanders along the surface, more toward its end; the blades flutter.
        transformed.xz += kelpSide * (.035 * aKelp.y * sin(uOceanTime * .55 + aKelp.y * 3.5 + aKelp.z));
        float kelpFlutter = .01 * aKelp.w * sin(uOceanTime * 2.3 + aKelp.z * 2.0 + position.y * 7.0 + position.x * 5.0);
        transformed += vec3(kelpSide.x, .4, kelpSide.y) * kelpFlutter;
        // Making way for the animals swimming through: each piece (a blade, a float, a canopy mat) is pushed
        // softly aside whole, from where it hangs on its stipe (aAnchor), away from each animal's body (a
        // capsule along its spine), about as far as its girth and only near its depth; the stipe bends from
        // point to point, the holdfast staying put, and the canopy on the surface hardly moves for an animal
        // passing under it (full quality only). In the island's own frame, as its swimmers tell it.
        #ifndef KELP_LITE
        vec2 kelpPush = vec2(0.0);
        for (int i = 0; i < KELP_MOVERS; i++) {
          vec4 body = uKelpMovers[i * 2], spine = uKelpMovers[i * 2 + 1];
          if (body.w <= 0.0) continue;
          vec2 from = aAnchor - body.xz;
          vec2 away = from - spine.xy * clamp(dot(from, spine.xy), -spine.z, spine.z);
          float gap = length(away);
          float push = body.w * pow(max(0.0, 1.0 - gap / (body.w * 1.6)), 1.5);
          float level = exp(-pow((position.y - body.y) / (body.w + .15), 2.0));
          kelpPush += away / max(gap, 1e-4) * (push * level);
        }
        transformed.xz += kelpPush * smoothstep(0.0, .35, aKelp.x) * (1.0 - .75 * smoothstep(.85, 1.0, aKelp.x));
        #endif
        // The top of each stipe and its canopy float on the waves (the ocean's, wherever the island lies).
        transformed.y += oceanWave((modelMatrix * vec4(transformed, 1.0)).xz).y * smoothstep(.8, 1.0, aKelp.x);`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 oceanWorld = modelMatrix * vec4(transformed, 1.0);${underwaterVertexGLSL(lite)}`);
    shader.fragmentShader = `uniform vec4 uOceanUnderwater;\nuniform vec3 uOceanCard;\nuniform vec2 uOceanOpacity;\nvarying float vOceanDepth;\nvarying float vOceanHaze;\n${OCEAN_SHADER_CHUNKS.color}\n${shader.fragmentShader}`
      .replace('#include <opaque_fragment>', `${underwaterTintGLSL(lite)}
        outgoingLight = mix(outgoingLight, uOceanCard, vOceanHaze);
        #include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => (lite ? 'kelp-v5-lite' : 'kelp-v5');
  return material;
}

/**
 * The Kelp Forest island's giant kelp (src/lib/kelp.ts): every plant in one mesh, swaying in the
 * shader with the island's water clock (so it stills when the scene pauses). Fewer plants with fewer
 * blades in lite quality.
 */
export function KelpForest({ level }: { level: number }) {
  const ocean = useContext(OceanContext), movers = useContext(KelpMoversContext);
  const lite = useSceneQuality() === 'lite';
  const mesh = useMemo(() => {
    const plants = kelpPlants(level, lite ? KELP.plants.lite : KELP.plants.full);
    const mesh = new Mesh(buildKelpGeometry(plants, KELP_DETAIL[lite ? 'lite' : 'full']), createKelpMaterial(ocean ?? createOceanUniforms('kelp'), lite, movers ?? undefined));
    mesh.name = 'kelp-forest';
    // Out of view (the explorer looking at another island) it isn't drawn: its bounds, padded for the sway and the parting.
    mesh.geometry.boundingSphere!.radius += 1;
    mesh.renderOrder = 1;
    // Taps go through the kelp to the animals behind it.
    mesh.raycast = () => {};
    return mesh;
  }, [level, lite, ocean, movers]);
  useEffect(() => () => { mesh.geometry.dispose(); (mesh.material as MeshLambertMaterial).dispose(); }, [mesh]);
  return <primitive object={mesh} />;
}
