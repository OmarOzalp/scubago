import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Habitat } from '@/lib/home';
import { advanceSwimTime } from '@/lib/swimming';
import {
  applyOceanPalette, buildDepthField, buildLiteOceanMap, createLiteOceanMesh, createOceanUniforms, createSeabedMesh, createWaterMesh,
  setOceanDepthMap, setOceanLiteMap, setOceanTime,
} from './ocean-mesh';
import type { SceneQuality } from './scene-quality';

/**
 * Build the island's water once per level; the palette follows the habitat without rebuilding.
 * Full quality draws a seabed and a separate wave surface; lite draws one baked, faceted layer.
 */
export function useOcean(habitat: Habitat, level: number, card: string, quality: SceneQuality = 'full') {
  // One uniforms object for the scene's lifetime, so swimmers keep their materials across changes.
  const [uniforms] = useState(() => createOceanUniforms(habitat, card));
  const field = useMemo(() => buildDepthField(level), [level]);
  const lite = quality === 'lite';
  const meshes = useMemo(() => lite ? [createLiteOceanMesh(uniforms, field)]
    : [createSeabedMesh(uniforms, field, level), createWaterMesh(uniforms, field)], [lite, uniforms, field, level]);
  const liteMap = useMemo(() => lite ? buildLiteOceanMap(field, habitat) : null, [lite, field, habitat]);
  useLayoutEffect(() => { applyOceanPalette(uniforms, habitat, card); }, [uniforms, habitat, card]);
  useLayoutEffect(() => {
    setOceanDepthMap(uniforms, field.texture);
    return () => field.texture.dispose();
  }, [uniforms, field]);
  useLayoutEffect(() => {
    setOceanLiteMap(uniforms, liteMap);
    return () => liteMap?.dispose();
  }, [uniforms, liteMap]);
  useEffect(() => () => meshes.forEach((mesh) => { mesh.geometry.dispose(); (mesh.material as { dispose(): void }).dispose(); }), [meshes]);
  return useMemo(() => ({ uniforms, field, meshes }), [uniforms, field, meshes]);
}
export type Ocean = ReturnType<typeof useOcean>;

/** Advances the shared water clock (frozen while paused) and draws the ocean's meshes. */
export function WaterSurface({ ocean, active }: { ocean: Ocean; active: boolean }) {
  const elapsed = useRef(0);
  useFrame((_, delta) => {
    elapsed.current = advanceSwimTime(elapsed.current, delta, active);
    setOceanTime(ocean.uniforms, elapsed.current);
  }, -2);
  return <>{ocean.meshes.map((mesh) => <primitive key={mesh.uuid} object={mesh} dispose={null} />)}</>;
}
