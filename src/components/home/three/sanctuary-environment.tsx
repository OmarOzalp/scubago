import { useMemo, useState, type ReactNode } from 'react';
import { Color, DoubleSide, Shape, type Object3D } from 'three';
import type { Habitat } from '@/lib/home';
import { SEABED_PROPS } from '@/lib/island-outline';
import { OCEAN } from '@/lib/ocean';
import { islandScale, shoreline } from './island-shape';
import { ArchipelagoSea } from './archipelago-sea';
import { KelpCoast } from './kelp-coast';
import { KelpForest } from './kelp-forest';
import { createKelpMovers, KelpMoversContext } from './kelp-movers';
import { OceanContext } from './ocean-context';
import { islandOceanUniforms, waterColorAt, type WaterExtent } from './ocean-mesh';
import { useSceneQuality } from './scene-quality';
import { submerge } from './islet-material';
import { VolcanicCoast } from './volcanic-coast';
import { MangroveCoast } from './mangrove-coast';
import { SeagrassMeadow } from './seagrass-meadow';
import { GROWTH_SECONDS, GrowthContext, Unlock } from './unlock';
import { useOcean, WaterSurface, type Ocean } from './water-surface';

export const WATER: Record<Habitat, string> = { island: '#C5E3DF', lagoon: '#B9DEDC', cove: '#C5DCD3', kelp: '#BED2CB', volcanic: '#BFD6E6', mangrove: '#C3E3D9' };

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
 * Something resting on the seabed at island-group coordinates (x, z) of the island at `place`
 * (its middle, world units): its height follows the seabed, and its color takes on the water
 * above it like the sand does.
 */
function useSeabedProp(ocean: Ocean, habitat: Habitat, level: number, place: readonly [number, number], x: number, z: number, color: string, lift = .01) {
  const scale = islandScale(level), [px, pz] = place;
  return useMemo(() => {
    const { floor, depth } = ocean.field.profile(px + x * scale, pz + z * scale);
    // Props stand up off the bottom, so they fade a little less than the sand around them.
    const fade = 1 - Math.exp(-Math.max(0, depth - .15) / OCEAN.seabedVisibility);
    return { position: [x, (floor + lift) / scale, z] as [number, number, number], color: new Color(color).lerp(waterColorAt(habitat, depth), fade) };
  }, [ocean, habitat, scale, px, pz, x, z, color, lift]);
}

/** The Coral Reef's sandy palm island (and the lagoon's and cove's shores): its sand, palms, rocks and corals, and what each level adds. */
function CoralIsland({ habitat, level, ocean, place }: { habitat: Habitat; level: number; ocean: Ocean; place: readonly [number, number] }) {
  const coralA = useSeabedProp(ocean, habitat, level, place, ...SEABED_PROPS.coralA, '#B98A7C');
  const coralB = useSeabedProp(ocean, habitat, level, place, ...SEABED_PROPS.coralB, '#6E9C88');
  const coralC = useSeabedProp(ocean, habitat, level, place, ...SEABED_PROPS.coralC, '#B98A7C');
  const reefRock = useSeabedProp(ocean, habitat, level, place, ...SEABED_PROPS.reefRock, '#8FA394', .04);
  return <group scale={islandScale(level)}>
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
    {/* What each level adds grows in (or rises from the water) when it's unlocked on screen. */}
    <Unlock at={habitat === 'lagoon' ? 1 : 2} level={level} kind="grow">
      <Coral position={coralA.position} color={coralA.color} /><Coral position={coralB.position} color={coralB.color} />
    </Unlock>
    <Unlock at={3} level={level} kind="grow">
      <Rock position={reefRock.position} scale={.25} color={reefRock.color} /><Coral position={coralC.position} color={coralC.color} />
    </Unlock>
    <Unlock at={4} level={level} kind="grow"><Palm position={[-.55, -.01, .6]} scale={.46} rotation={2.5} /></Unlock>
    <Unlock at={5} level={level} kind="rise">
      <group position={[2.65, 0, -2]} scale={.3}><ShoreLayer y={-.1} color="#F0E6C9" /><Palm position={[0, 0, 0]} scale={.8} /></group>
    </Unlock>
    <Unlock at={6} level={level} kind="rise">
      <group position={[-2.8, 0, 2.1]} scale={.26}><ShoreLayer y={-.1} color="#F0E6C9" /><Palm position={[0, 0, 0]} scale={.7} /></group>
    </Unlock>
  </group>;
}

/**
 * An island in the scene's ocean: where its middle lies (world units), whose shores it has, and
 * what lives there (its animals, drawn in the island's own frame and water).
 */
export type SceneIsland = { key: string; habitat: Habitat; x: number; z: number; content?: ReactNode };

/**
 * One island, in its own frame at its place in the ocean: its shores (the Kelp Forest's rocky coast
 * and kelp, the Volcanic Pinnacle's lava cone, the mangrove cay and its seagrass, or a sandy island) and its animals, which take on its own water (islandOceanUniforms).
 */
function IslandPlace({ island, ocean, level, growIn }: { island: SceneIsland; ocean: Ocean; level: number; growIn: boolean }) {
  const quality = useSceneQuality();
  const uniforms = useMemo(() => islandOceanUniforms(ocean.uniforms, island.habitat), [ocean.uniforms, island.habitat]);
  const growth = useMemo(() => ({
    animate: growIn, duration: GROWTH_SECONDS[quality],
    submerge: (group: Object3D) => submerge(group, uniforms, quality === 'lite'),
  }), [growIn, quality, uniforms]);
  // The kelp makes way for the animals swimming through it (kelp-movers.ts).
  const [movers] = useState(createKelpMovers);
  const kelp = island.habitat === 'kelp';
  return <group position={[island.x, 0, island.z]}>
    <OceanContext.Provider value={uniforms}><GrowthContext.Provider value={growth}><KelpMoversContext.Provider value={kelp ? movers : null}>
      {kelp ? <>
        <group scale={islandScale(level)}><KelpCoast level={level} /></group>
        <KelpForest level={level} />
      </> : island.habitat === 'volcanic'
        ? <group scale={islandScale(level)}><VolcanicCoast level={level} /></group>
        : island.habitat === 'mangrove' ? <>
          <group scale={islandScale(level)}><MangroveCoast level={level} /></group>
          <SeagrassMeadow level={level} />
        </> : <CoralIsland habitat={island.habitat} level={level} ocean={ocean} place={[island.x, island.z]} />}
      {island.content}
    </KelpMoversContext.Provider></GrowthContext.Provider></OceanContext.Provider>
  </group>;
}

/** The ocean and every island in it; `children` go in the ocean itself (the explorer's camera). */
function IslandWorld({ habitat, level, active, growIn, reach, islands, children }: {
  habitat: Habitat; level: number; active: boolean; growIn: boolean; reach?: WaterExtent; islands: readonly SceneIsland[]; children?: ReactNode;
}) {
  const quality = useSceneQuality();
  const ocean = useOcean(habitat, level, WATER[habitat], quality, reach, islands.map(({ x, z, habitat: shores }) => ({ x, z, habitat: shores })));
  return <OceanContext.Provider value={ocean.uniforms}>
    <WaterSurface ocean={ocean} active={active} />
    {ocean.field.bank && <ArchipelagoSea bank={ocean.field.bank} />}
    {islands.map((island) => <IslandPlace key={island.key} island={island} ocean={ocean} level={level} growIn={growIn} />)}
    {children}
  </OceanContext.Provider>;
}

/**
 * Lights and backdrop for every scene; the islands and their ocean only outside the close-up.
 * `islands`: every island in the ocean and what lives at each (its `content`). Unless given, the
 * habitat's island alone in the middle, with `children` living there; given, `children` go in the
 * ocean itself.
 */
export function SanctuaryEnvironment({ habitat, level, active, inspect = false, growIn = false, reach, islands, children }: {
  habitat: Habitat; level: number; active: boolean; inspect?: boolean;
  /** A new level's additions rise or grow in (see Growth), rather than simply being there. */
  growIn?: boolean;
  /** How far the water reaches from every island's middle (units): farther than the card's in the island explorer, which fills a whole screen with it (waterReach). */
  reach?: WaterExtent; islands?: readonly SceneIsland[]; children?: ReactNode;
}) {
  const alone = useMemo(() => [{ key: habitat, habitat, x: 0, z: 0 }], [habitat]);
  return <>
    <color attach="background" args={[WATER[habitat]]} />
    <hemisphereLight args={['#F4F7EC', '#5E8F91', 1.15]} />
    <directionalLight position={OCEAN.sun} intensity={1.7} />
    {inspect ? children : islands
      ? <IslandWorld habitat={habitat} level={level} active={active} growIn={growIn} reach={reach} islands={islands}>{children}</IslandWorld>
      : <IslandWorld habitat={habitat} level={level} active={active} growIn={growIn} reach={reach} islands={alone.map((island) => ({ ...island, content: children }))} />}
  </>;
}
