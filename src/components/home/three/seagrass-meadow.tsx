import { useContext, useEffect, useMemo } from 'react';
import { DoubleSide, Mesh, MeshLambertMaterial, Vector4 } from 'three';
import { SEAGRASS, seagrassTufts } from '@/lib/seagrass';
import { OceanContext } from './ocean-context';
import { buildSeagrassGeometry } from './seagrass-geometry';
import { createOceanUniforms, OCEAN_SHADER_CHUNKS, type OceanUniforms } from './ocean-mesh';
import { useSceneQuality } from './scene-quality';
import { underwaterTintGLSL, underwaterVertexGLSL } from './underwater-material';

/**
 * The blades sway with the surge, a wave travelling through the meadow, more toward their tips; under
 * the water they take on its depth tint and haze like the animals (underwater-material.ts).
 */
export function createSeagrassMaterial(ocean: OceanUniforms, lite = false) {
  const material = new MeshLambertMaterial({ vertexColors: true, side: DoubleSide });
  const { reach, period, direction } = SEAGRASS.surge;
  const surge = { value: new Vector4(Math.cos(direction), Math.sin(direction), reach, Math.PI * 2 / period) };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, ocean, { uGrassSurge: surge });
    shader.vertexShader = `attribute vec4 aGrass;\nuniform vec4 uGrassSurge;\nuniform float uOceanSurface;\nuniform float uOceanDistortion;\nuniform vec2 uOceanEdge;
varying float vOceanDepth;\nvarying float vOceanHaze;\n${OCEAN_SHADER_CHUNKS.waves}\n${shader.vertexShader}`
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float grassBend = aGrass.x * aGrass.x;
        float grassSwing = sin(uGrassSurge.w * uOceanTime + aGrass.y * .3 - dot(uGrassSurge.xy, position.xz) * 1.4);
        transformed.xz += uGrassSurge.xy * (uGrassSurge.z * grassBend * grassSwing);
        transformed.xz += vec2(-uGrassSurge.y, uGrassSurge.x) * (.006 * grassBend * sin(uOceanTime * 1.7 + aGrass.y));`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 oceanWorld = modelMatrix * vec4(transformed, 1.0);${underwaterVertexGLSL(lite)}`);
    shader.fragmentShader = `uniform vec4 uOceanUnderwater;\nuniform vec3 uOceanCard;\nuniform vec2 uOceanOpacity;\nvarying float vOceanDepth;\nvarying float vOceanHaze;\n${OCEAN_SHADER_CHUNKS.color}\n${shader.fragmentShader}`
      .replace('#include <opaque_fragment>', `${underwaterTintGLSL(lite)}
        outgoingLight = mix(outgoingLight, uOceanCard, vOceanHaze);
        #include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => (lite ? 'seagrass-v1-lite' : 'seagrass-v1');
  return material;
}

/**
 * The Mangroves & Seagrass island's seagrass meadows (src/lib/seagrass.ts) on the shelf around it, in
 * one mesh swaying on the island's water clock (so it stills when the scene does). Fewer tufts with
 * fewer blades in lite quality.
 */
export function SeagrassMeadow({ level }: { level: number }) {
  const ocean = useContext(OceanContext);
  const lite = useSceneQuality() === 'lite';
  const mesh = useMemo(() => {
    const tufts = seagrassTufts(level, lite ? SEAGRASS.tufts.lite : SEAGRASS.tufts.full);
    const mesh = new Mesh(buildSeagrassGeometry(tufts, lite ? SEAGRASS.blades.lite : SEAGRASS.blades.full), createSeagrassMaterial(ocean ?? createOceanUniforms('mangrove'), lite));
    mesh.name = 'seagrass-meadow';
    mesh.geometry.boundingSphere!.radius += .2;
    mesh.renderOrder = 1;
    mesh.raycast = () => {};
    return mesh;
  }, [level, lite, ocean]);
  useEffect(() => () => { mesh.geometry.dispose(); (mesh.material as MeshLambertMaterial).dispose(); }, [mesh]);
  return <primitive object={mesh} />;
}
