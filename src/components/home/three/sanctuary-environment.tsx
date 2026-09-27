import { useMemo, type ReactNode } from 'react';
import { Color, DoubleSide, Shape } from 'three';
import type { Habitat } from '@/lib/home';
import { OCEAN } from '@/lib/ocean';
import { islandScale, shoreline } from './island-shape';
import { OceanContext } from './ocean-context';
import { waterColorAt } from './ocean-mesh';
import { useSceneQuality } from './scene-quality';
import { useOcean, WaterSurface, type Ocean } from './water-surface';

export const WATER: Record<Habitat, string> = { island: '#C5E3DF', lagoon: '#B9DEDC', cove: '#C5DCD3' };

/** Flat layers of the dry island, stacked just above the water. */
function ShoreLayer({ scale = 1, y, color, offset = [0, 0] }: {
  scale?: number; y: number; color: string; offset?: [number, number];
}) {
  const shape = useMemo(() => shoreline(), []);
  return <mesh rotation={[-Math.PI / 2, 0, 0]} position={[offset[0], y, offset[1]]} scale={scale}>
    <shapeGeometry args={[shape, 12]} /><meshBasicMaterial color={color} />
  </mesh>;
}

/** Broad leaves and a short trunk stay readable from above. */
function Palm({ position, scale = 1, rotation = 0 }: {
  position: [number, number, number]; scale?: number; rotation?: number;
}) {
  const leaf = useMemo(() => {
    const shape = new Shape();
    shape.moveTo(0, 0);
    shape.quadraticCurveTo(.35, .31, 1.02, .04);
    shape.quadraticCurveTo(.56, -.23, 0, 0);
    return shape;
  }, []);
  return <group position={position} scale={scale} rotation={[0, rotation, 0]}>
    <mesh position={[.12, -.01, .12]} rotation={[-Math.PI / 2, 0, 0]} scale={[.85, .6, 1]}>
      <circleGeometry args={[1, 20]} /><meshBasicMaterial color="#C4CBA3" />
    </mesh>
    <mesh position={[0, .38, 0]} rotation={[0, 0, -.12]}>
      <cylinderGeometry args={[.045, .065, .78, 6]} /><meshLambertMaterial color="#AE9164" />
    </mesh>
    <group position={[.05, .78, 0]}>
      {Array.from({ length: 6 }, (_, i) => <group key={i} rotation={[0, i * Math.PI / 3, 0]}>
        <mesh rotation={[-Math.PI / 2, -.12, 0]}>
          <shapeGeometry args={[leaf, 6]} /><meshBasicMaterial color={i % 2 ? '#719C78' : '#8FB18A'} side={DoubleSide} />
        </mesh>
      </group>)}
    </group>
  </group>;
}

function Rock({ position, scale = 1, color = '#A3B6A6' }: { position: [number, number, number]; scale?: number; color?: string | Color }) {
  return <mesh position={position} scale={[scale, scale * .55, scale * .8]} rotation={[0, .5, .1]}>
    <icosahedronGeometry args={[1, 0]} /><meshLambertMaterial color={color} />
  </mesh>;
}
function Coral({ position, color = '#CBAA96' }: { position: [number, number, number]; color?: string | Color }) {
  return <group position={position}>{[-1, 0, 1].map((i) => <mesh key={i}
    position={[i * .14, 0, Math.abs(i) * .06]} rotation={[-Math.PI / 2, 0, i * .3]} scale={[.12, .22, 1]}>
    <circleGeometry args={[1, 8]} /><meshBasicMaterial color={color} />
  </mesh>)}</group>;
}

/**
 * Something resting on the seabed at island-group coordinates (x, z): its height
 * follows the seabed, and its color takes on the water above it like the sand does.
 */
function useSeabedProp(ocean: Ocean, habitat: Habitat, level: number, x: number, z: number, color: string, lift = .01) {
  const scale = islandScale(level);
  return useMemo(() => {
    const { floor, depth } = ocean.field.profile(x * scale, z * scale);
    // Props stand up off the bottom, so they fade a little less than the sand around them.
    const fade = 1 - Math.exp(-Math.max(0, depth - .15) / OCEAN.seabedVisibility);
    return { position: [x, (floor + lift) / scale, z] as [number, number, number], color: new Color(color).lerp(waterColorAt(habitat, depth), fade) };
  }, [ocean, habitat, scale, x, z, color, lift]);
}

function IslandWorld({ habitat, level, active, children }: { habitat: Habitat; level: number; active: boolean; children?: ReactNode }) {
  const ocean = useOcean(habitat, level, WATER[habitat], useSceneQuality());
  const coralA = useSeabedProp(ocean, habitat, level, -2.1, 1.25, '#B98A7C');
  const coralB = useSeabedProp(ocean, habitat, level, 2.2, .65, '#6E9C88');
  const coralC = useSeabedProp(ocean, habitat, level, 1.5, 1.65, '#B98A7C');
  const reefRock = useSeabedProp(ocean, habitat, level, -2.1, -1.3, '#8FA394', .04);
  return <OceanContext.Provider value={ocean.uniforms}>
    <WaterSurface ocean={ocean} active={active} />
    <group scale={islandScale(level)}>
      <ShoreLayer scale={1.035} y={-.12} color="#D9CEAB" offset={[.025, .06]} />
      <ShoreLayer y={-.06} color="#F0E6C9" />
      <ShoreLayer scale={.68} y={-.04} color={habitat === 'cove' ? '#BDC8A3' : '#E5DEB7'} offset={[-.25, -.14]} />
      {habitat === 'cove' ? <>
        <Rock position={[-.3, .17, -.2]} scale={.6} /><Rock position={[-.86, .06, -.05]} scale={.35} />
        <Palm position={[.6, -.015, -.1]} scale={.64} />
      </> : <>
        <Palm position={[-.5, -.015, -.25]} scale={.8} rotation={.3} />
        <Palm position={[.52, -.01, -.4]} scale={.6} rotation={1.2} />
      </>}
      <Rock position={[-1.3, 0, .3]} scale={.2} />
      <Rock position={[1.15, 0, -.2]} scale={.13} />
      {habitat === 'lagoon' && <mesh position={[.45, -.02, .62]} rotation={[-Math.PI / 2, 0, -.3]} scale={[.65, .32, 1]}>
        <circleGeometry args={[1, 24]} /><meshBasicMaterial color="#A8D3C9" />
      </mesh>}
      {(level >= 2 || habitat === 'lagoon') && <>
        <Coral position={coralA.position} color={coralA.color} /><Coral position={coralB.position} color={coralB.color} />
      </>}
      {level >= 3 && <><Rock position={reefRock.position} scale={.25} color={reefRock.color} /><Coral position={coralC.position} color={coralC.color} /></>}
      {level >= 4 && <Palm position={[-.55, -.01, .6]} scale={.46} rotation={2.5} />}
      {level >= 5 && <group position={[2.65, 0, -2]} scale={.3}>
        <ShoreLayer y={-.1} color="#F0E6C9" /><Palm position={[0, 0, 0]} scale={.8} />
      </group>}
      {level >= 6 && <group position={[-2.8, 0, 2.1]} scale={.26}>
        <ShoreLayer y={-.1} color="#F0E6C9" /><Palm position={[0, 0, 0]} scale={.7} />
      </group>}
    </group>
    {children}
  </OceanContext.Provider>;
}

/** Lights and backdrop for every scene; the island and its ocean only outside the close-up. */
export function SanctuaryEnvironment({ habitat, level, active, inspect = false, children }: {
  habitat: Habitat; level: number; active: boolean; inspect?: boolean; children?: ReactNode;
}) {
  return <>
    <color attach="background" args={[WATER[habitat]]} />
    <hemisphereLight args={['#F4F7EC', '#5E8F91', 1.15]} />
    <directionalLight position={OCEAN.sun} intensity={1.7} />
    {inspect ? children : <IslandWorld habitat={habitat} level={level} active={active}>{children}</IslandWorld>}
  </>;
}
