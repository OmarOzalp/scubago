import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Habitat } from '@/lib/home';
import { advanceSwimTime } from '@/lib/swimming';
import { applyOceanPalette, buildDepthField, createOceanUniforms, createSeabedMesh, createWaterMesh, setOceanDepthMap, setOceanTime } from './ocean-mesh';

/** Build the island's water once per level; the palette follows the habitat without rebuilding. */
export function useOcean(habitat: Habitat, level: number, card: string) {
  // One uniforms object for the scene's lifetime, so swimmers keep their materials across changes.
  const [uniforms] = useState(() => createOceanUniforms(habitat, card));
  const field = useMemo(() => buildDepthField(level), [level]);
  const water = useMemo(() => createWaterMesh(uniforms, field), [uniforms, field]);
  const seabed = useMemo(() => createSeabedMesh(uniforms, field, level), [uniforms, field, level]);
  useLayoutEffect(() => { applyOceanPalette(uniforms, habitat, card); }, [uniforms, habitat, card]);
  useLayoutEffect(() => {
    setOceanDepthMap(uniforms, field.texture);
    return () => field.texture.dispose();
  }, [uniforms, field]);
  useEffect(() => () => { water.geometry.dispose(); (water.material as { dispose(): void }).dispose(); }, [water]);
  useEffect(() => () => { seabed.geometry.dispose(); (seabed.material as { dispose(): void }).dispose(); }, [seabed]);
  return useMemo(() => ({ uniforms, field, water, seabed }), [uniforms, field, water, seabed]);
}
export type Ocean = ReturnType<typeof useOcean>;

/** Advances the shared water clock (frozen while paused) and draws the surface and seabed. */
export function WaterSurface({ ocean, active }: { ocean: Ocean; active: boolean }) {
  const elapsed = useRef(0);
  useFrame((_, delta) => {
    elapsed.current = advanceSwimTime(elapsed.current, delta, active);
    setOceanTime(ocean.uniforms, elapsed.current);
  }, -2);
  return <>
    <primitive object={ocean.seabed} dispose={null} />
    <primitive object={ocean.water} dispose={null} />
  </>;
}
