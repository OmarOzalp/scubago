import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Habitat } from '@/lib/home';
import { OCEAN } from '@/lib/ocean';
import { advanceSwimTime } from '@/lib/swimming';
import {
  applyOceanPalette, applyRegionPalettes, buildDepthField, buildLiteOceanMap, createLiteOceanMesh, createOceanUniforms, createSeabedMesh, createWaterMesh,
  setOceanDepthMap, setOceanLiteMap, setOceanTime, type OceanIsland,
} from './ocean-mesh';
import type { SceneQuality } from './scene-quality';

/**
 * Build the ocean once per level and set of islands; the card's palette follows the habitat without
 * rebuilding. Full quality draws a seabed and a separate wave surface; lite draws one baked, faceted layer.
 */
/**
 * The ocean around the islands (`islands`; the habitat's own island alone in the middle unless given):
 * its uniforms, depth field and meshes, the water reaching `reach` units each way from every island
 * (farther in the explorer).
 */
export function useOcean(habitat: Habitat, level: number, card: string, quality: SceneQuality = 'full', reach = OCEAN.waterExtent, islands?: readonly OceanIsland[]) {
  // One uniforms object for the scene's lifetime, so swimmers keep their materials across changes.
  const [uniforms] = useState(() => createOceanUniforms(habitat, card));
  const placed = JSON.stringify(islands ?? [{ x: 0, z: 0, habitat }]);
  const field = useMemo(() => buildDepthField(level, JSON.parse(placed) as OceanIsland[]), [level, placed]);
  const lite = quality === 'lite';
  const meshes = useMemo(() => lite ? [createLiteOceanMesh(uniforms, field, OCEAN, reach)]
    : [createSeabedMesh(uniforms, field, level, reach), createWaterMesh(uniforms, field, OCEAN, reach)], [lite, uniforms, field, level, reach]);
  const liteMap = useMemo(() => lite ? buildLiteOceanMap(field) : null, [lite, field]);
  useLayoutEffect(() => { applyOceanPalette(uniforms, habitat, card); }, [uniforms, habitat, card]);
  useLayoutEffect(() => {
    setOceanDepthMap(uniforms, field);
    applyRegionPalettes(uniforms, field.habitats);
    return () => { field.texture.dispose(); field.region.dispose(); };
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
