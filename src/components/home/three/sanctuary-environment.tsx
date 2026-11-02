import { useMemo, useState, type ReactNode } from 'react';
import type { Object3D } from 'three';
import type { Habitat } from '@/lib/home';
import { OCEAN } from '@/lib/ocean';
import { islandScale } from './island-shape';
import { ArchipelagoSea } from './archipelago-sea';
import { KelpCoast } from './kelp-coast';
import { KelpForest } from './kelp-forest';
import { createKelpMovers, KelpMoversContext } from './kelp-movers';
import { OceanContext } from './ocean-context';
import { islandOceanUniforms, type WaterExtent } from './ocean-mesh';
import { useSceneQuality } from './scene-quality';
import { submerge } from './islet-material';
import { VolcanicCoast } from './volcanic-coast';
import { MangroveCoast } from './mangrove-coast';
import { ReefCoast, ReefCorals } from './reef-coast';
import { WreckCoast } from './wreck-coast';
import { SeagrassMeadow } from './seagrass-meadow';
import { builtKey, wasBuilt } from './built-islands';
import { IslandContext, SeenContext, Stage, Whole } from './staging';
import { STAGE } from './stager';
import { GROWTH_SECONDS, GrowthContext } from './unlock';
import { useOcean, WaterSurface, type Ocean } from './water-surface';

export const WATER: Record<Habitat, string> = { island: '#C5E3DF', lagoon: '#B9DEDC', cove: '#C5DCD3', kelp: '#BED2CB', volcanic: '#BFD6E6', mangrove: '#C3E3D9', wreck: '#C2E3E9' };

/**
 * An island in the scene's ocean: where its middle lies (world units), whose shores it has, and
 * what lives there (its animals, drawn in the island's own frame and water; `small`, the reef's small life, which comes last).
 */
export type SceneIsland = { key: string; habitat: Habitat; x: number; z: number; content?: ReactNode; small?: ReactNode };

/**
 * One island, in its own frame at its place in the ocean: its shores (the Kelp Forest's rocky coast
 * and kelp, the Volcanic Pinnacle's lava cone, the mangrove cay and its seagrass, the Shipwreck's cay and wreck, or the Coral Reef's cay, lagoon and corals) and its animals, which take on its own water (islandOceanUniforms).
 */
function IslandPlace({ island, ocean, level, growIn }: { island: SceneIsland; ocean: Ocean; level: number; growIn: boolean }) {
  const quality = useSceneQuality();
  const uniforms = useMemo(() => islandOceanUniforms(ocean.uniforms, island.habitat), [ocean.uniforms, island.habitat]);
  // Built to the end before in this session (built-islands.ts)? Then it is simply there: nothing of it is staged. Otherwise it is built in steps and shown whole.
  const memory = builtKey(island.habitat, level, quality);
  const [seen] = useState(() => wasBuilt(memory));
  const growth = useMemo(() => ({
    animate: growIn, duration: GROWTH_SECONDS[quality],
    submerge: (group: Object3D) => submerge(group, uniforms, quality === 'lite'),
  }), [growIn, quality, uniforms]);
  // The kelp makes way for the animals swimming through it (kelp-movers.ts).
  const [movers] = useState(createKelpMovers);
  const kelp = island.habitat === 'kelp';
  // Built in steps (staging.tsx): the coast first, then the animals' swimming (and each animal in its turn), then what grows on and round
  // the island, then the reef's small life. Each is made when its step opens; the coast and what grows on and round it are shown together, whole,
  // when the last of their steps has (an island built before is simply there).
  const shore = island.habitat;
  const reef = shore !== 'kelp' && shore !== 'volcanic' && shore !== 'mangrove' && shore !== 'wreck';
  const coast = kelp ? <KelpCoast level={level} /> : shore === 'volcanic' ? <VolcanicCoast level={level} /> : shore === 'mangrove' ? <MangroveCoast level={level} />
    : shore === 'wreck' ? <WreckCoast level={level} /> : <ReefCoast level={level} ocean={ocean} place={[island.x, island.z]} />;
  const props = kelp ? <KelpForest level={level} /> : shore === 'mangrove' ? <SeagrassMeadow level={level} /> : reef ? <ReefCorals level={level} /> : null;
  return <group position={[island.x, 0, island.z]}>
    <OceanContext.Provider value={uniforms}><GrowthContext.Provider value={growth}><KelpMoversContext.Provider value={kelp ? movers : null}>
      <IslandContext.Provider value={island.key}><SeenContext.Provider value={seen}>
        {/* (the reef's, the mangroves', the volcano's and the kelp's coasts and the reef's corals are made in slices: sliced-geometry.ts) */}
        <Whole memory={memory}>
          <Stage at={STAGE.coast} grow={shore === 'wreck'} staged={false}><group scale={islandScale(level)}>{coast}</group></Stage>
          {props && <Stage at={STAGE.props} grow={!reef} staged={false}>{props}</Stage>}
        </Whole>
        <Stage at={STAGE.swim}>{island.content}</Stage>
        {island.small && <Stage at={STAGE.small} grow>{island.small}</Stage>}
      </SeenContext.Provider></IslandContext.Provider>
    </KelpMoversContext.Provider></GrowthContext.Provider></OceanContext.Provider>
  </group>;
}

/** The ocean and every island in it; `children` go in the ocean itself (the explorer's camera). */
function IslandWorld({ habitat, level, active, growIn, reach, islands, children }: {
  habitat: Habitat; level: number; active: boolean; growIn: boolean; reach?: WaterExtent; islands: readonly SceneIsland[]; children?: ReactNode;
}) {
  const quality = useSceneQuality();
  const ocean = useOcean(habitat, level, WATER[habitat], quality, reach, islands.map(({ x, z, habitat: shores }) => ({ x, z, habitat: shores })));
  // (the sea between the islands is simply there when every island in it was built before)
  const [builtBefore] = useState(() => islands.every((island) => wasBuilt(builtKey(island.habitat, level, quality))));
  return <OceanContext.Provider value={ocean.uniforms}>
    <WaterSurface ocean={ocean} active={active} />
    {ocean.field.bank && <SeenContext.Provider value={builtBefore}><Stage at={STAGE.props} grow staged={false}><ArchipelagoSea bank={ocean.field.bank} /></Stage></SeenContext.Provider>}
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
export function SanctuaryEnvironment({ habitat, level, active, inspect = false, growIn = false, reach, islands, ready = true, children }: {
  habitat: Habitat; level: number; active: boolean; inspect?: boolean;
  /** The ocean can be built (its seabed's bake is loaded, or there is none to wait for: seabed-assets.ts); until then, only the water's colour. */
  ready?: boolean;
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
    {inspect ? children : !ready ? null : islands
      ? <IslandWorld habitat={habitat} level={level} active={active} growIn={growIn} reach={reach} islands={islands}>{children}</IslandWorld>
      : <IslandWorld habitat={habitat} level={level} active={active} growIn={growIn} reach={reach} islands={alone.map((island) => ({ ...island, content: children }))} />}
  </>;
}
