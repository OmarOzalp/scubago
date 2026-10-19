import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';
import { SceneCanvas as Canvas } from './three/scene-canvas';
import { SceneBoundary, SceneUnavailable } from './scene-boundary';
import { SceneCamera } from './three/scene-camera';
import { IslandPerfBadge } from './island-perf-badge';
import { IslandPerfProbe, ScenePerformance } from './three/scene-performance';
import { router } from 'expo-router';
import { DiscoveryNote, LevelUpBanner, NewTag } from './discovery-overlays';
import { IslandScene } from './island-scene';
import { MacroLife } from './three/macro-life';
import { MarineSwimmers, type Arrivals } from './three/marine-swimmers';
import { SanctuaryEnvironment, type SceneIsland } from './three/sanctuary-environment';
import { TapAnywhere } from './three/tap-anywhere';
import { useMarineModels } from './three/use-marine-models';
import { useSceneActive, useSceneVisible } from '@/hooks/use-scene-active';
import { EXPLORER } from '@/lib/explorer-view';
import type { Habitat } from '@/lib/home';
import { MACRO_SPECIES, macroResidents, type MacroSpecies } from '@/lib/macro-life';
import { clamp, oceanScale } from '@/lib/steering';
import { hasSchool, MAX_ANIMATED, pickSwimmers, SCHOOL_SPECIES, schoolSpeciesFor, swimmerPages, swimsInSchool, type MarineModel } from '@/lib/swimming';
import type { DexEntry } from '@/lib/types';

/**
 * Only the diver's own discoveries swim here: a new island's ocean is empty until the first one.
 * For reviewing the island's animals together, EXPO_PUBLIC_ISLAND_SHOWCASE=1 (restart Metro with
 * --clear) brings every species model as a visitor, whatever the collection holds (development only).
 */
const SHOWCASE = process.env.EXPO_PUBLIC_ISLAND_SHOWCASE === '1';
/** Frame timing over the card, for measuring the island on real phones (set in the EAS preview profile). */
const ISLAND_PERF = process.env.EXPO_PUBLIC_ISLAND_PERF === '1';
const SHOWCASE_SWIMMERS = (['whale-shark', 'great-white-shark', 'tiger-shark', 'reef-manta', 'mola-mola', 'green-turtle', 'scalloped-hammerhead', 'bottlenose-dolphin',
  'great-barracuda', 'sailfish', 'california-sea-lion', 'spotted-eagle-ray', 'golden-jellyfish',
  // The Open Ocean's animals, far out from the island.
  'humpback-whale', 'sperm-whale', 'oceanic-whitetip', 'leatherback-turtle', 'oceanic-manta',
  // The Kelp Forest's (shown on Home's island in the showcase, though they live at their own).
  'harbor-seal', 'sea-otter', 'garibaldi', 'leafy-seadragon', 'orca',
  'marine-iguana', 'galapagos-shark', 'thresher-shark', 'giant-trevally', 'king-angelfish',
  'dugong', 'sawfish', 'lemon-shark', 'southern-stingray', 'tarpon',
  // The reef's animals keep to their own places on the reef (reef-life.ts): the moray's den, the octopus's rock, the cuttlefish's reef edge, the clownfish's anemone.
  'giant-moray', 'day-octopus', 'giant-cuttlefish', 'clownfish'] as const)
  .map((model, lane) => ({ model, lane }));
/** And the reef's small life, every one, in the explorer. */
const SHOWCASE_MACRO = Object.keys(MACRO_SPECIES) as MacroSpecies[];

/** A mostly overhead orthographic view gives the island an illustrated 2.5D appearance. */
export const SCENE_CAMERA = { position: [0, 12, 6] as [number, number, number], zoom: 31, near: .1, far: 60 };

/** The discovery moments the scene plays (see useDiscoveryMoments): arrivals and their "New" tag. */
export type SceneMoments = Pick<Arrivals, 'waiting' | 'now' | 'onArrived'> & {
  /** New species with a guaranteed place on the island while they arrive. */
  featured: readonly string[];
  tag: { speciesId: string; label: string } | null;
  /** A level-up banner over the island, and a note along its bottom. */
  banner: { level: number; reward: string; visible: boolean } | null;
  note: string | null;
  /** Moments are playing: the island's animals don't change page meanwhile. */
  busy: boolean;
};

const SCHOOLED = SCHOOL_SPECIES.filter(swimsInSchool);
/** Where the tag sits over its animal (px): centered above it, kept inside the card. */
const TAG = { above: 46, margin: 8, height: 24 };

/**
 * The island explorer (src/app/explore.tsx) draws the archipelago full screen: its own camera
 * (ExplorerCamera, which goes inside the islands' ocean) in place of the card's, tap targets sized
 * for its zoom (tapScaleAt), and the reef's small life (MacroLife), which comes into view as it
 * zooms in (`zoom`, its points per world unit now).
 */
export type ExplorerScene = {
  camera: ReactNode; tapScale: number; zoom: () => number;
  /** Look closely at a point on the water (x, z): ease over and in to at least `zoom`. */
  focus: (x: number, z: number, zoom: number) => void;
};

/** An island in the scene's ocean (its middle, world units, and its shores) and the species living there. */
export type ScenePlace = { key: string; habitat: Habitat; x: number; z: number; residents: DexEntry[] };

export function SanctuaryScene({ habitat, level, residents, islands, paused = false, loading = false, onInspect, onOpen, moments, explorer }: {
  habitat: Habitat; level: number; residents: DexEntry[]; paused?: boolean; loading?: boolean; onInspect: (model: MarineModel) => void;
  /**
   * Every island in the ocean, each with its own residents (the explorer's archipelago). Unless
   * given, the habitat's island alone, home to `residents`. Discovery moments play at the first.
   */
  islands?: readonly ScenePlace[];
  /** A tap anywhere on the island that no animal takes (the Home card: open it full screen). */
  onOpen?: () => void;
  moments?: SceneMoments; explorer?: ExplorerScene;
}) {
  const active = useSceneActive(paused);
  const visible = useSceneVisible();
  const [page, setPage] = useState(0);
  const places = islands ?? [{ key: habitat, habitat, x: 0, z: 0, residents }];
  const pages = Math.max(...places.map((place) => swimmerPages(place.residents)));
  const preview = SHOWCASE;
  const visitors = SHOWCASE_SWIMMERS;
  // Each island's animals. Logged tuna are shown by the school rather than as a swimmer of their own; a tap on it
  // opens their species. A new discovery arriving has a place of its own, whatever the page. No tuna unless one is
  // logged (the showcase shows every animal, the school included, at the first island).
  const lineups = places.map((place, i) => ({
    place,
    swimmers: pickSwimmers(place.residents, page, MAX_ANIMATED, i === 0 ? moments?.featured : undefined),
    schoolSpecies: schoolSpeciesFor(place.residents),
    school: preview ? i === 0 : hasSchool(place.residents),
  }));
  const swimmers = lineups.flatMap((lineup) => lineup.swimmers);
  const school = lineups.some((lineup) => lineup.school);
  const { models, failed, retry } = useMarineModels(loading ? [] : (preview ? visitors : swimmers).map((s) => s.model));
  const busy = !!moments?.busy;
  useEffect(() => {
    if (!active || pages <= 1 || busy) return;
    const timer = setInterval(() => setPage((p) => (p + 1) % pages), 30000);
    return () => clearInterval(timer);
  }, [active, pages, busy]);

  // The "New" tag: the canvas reports its animal's place on screen every frame.
  const [tag] = useState(() => ({ x: new Animated.Value(-1000), y: new Animated.Value(-1000), inView: new Animated.Value(0) }));
  const layout = useRef({ width: 0, height: 0, tag: 120, seen: 0 });
  const anchor = useCallback((x: number, y: number, inView: boolean) => {
    const l = layout.current;
    l.seen += ((inView ? 1 : 0) - l.seen) * .15;
    tag.x.setValue(clamp(x - l.tag / 2, TAG.margin, Math.max(TAG.margin, l.width - l.tag - TAG.margin)));
    tag.y.setValue(clamp(y - TAG.above, TAG.margin, Math.max(TAG.margin, l.height - TAG.height - TAG.margin)));
    tag.inView.setValue(l.seen);
  }, [tag]);
  // The tag and the note keep their last words while they fade out.
  const [label, setLabel] = useState('');
  if (moments?.tag && moments.tag.label !== label) setLabel(moments.tag.label);
  const [note, setNote] = useState('');
  if (moments?.note && moments.note !== note) setNote(moments.note);
  // Without the 3D scene there is nothing to swim in: an arrival is done at once.
  const now = moments?.now ?? null, onArrived = moments?.onArrived;
  useEffect(() => {
    if (now && (failed || preview)) onArrived?.(now);
  }, [now, failed, preview, onArrived]);
  const arrivals: Arrivals | undefined = moments && !preview ? {
    waiting: moments.waiting, now: moments.now, onArrived: moments.onArrived, instant: !active, visible,
    tag: moments.tag ? { speciesId: moments.tag.speciesId, anchor } : null,
  } : undefined;

  const fallback = <IslandScene habitat={habitat} level={level} residents={residents} paused={paused} />;
  const frame = explorer ? styles.fill : styles.scene;
  if (failed) return <View style={frame}><SceneUnavailable onRetry={retry}>{fallback}</SceneUnavailable></View>;
  const onLayout = (event: { nativeEvent: { layout: { width: number; height: number } } }) => {
    layout.current.width = event.nativeEvent.layout.width;
    layout.current.height = event.nativeEvent.layout.height;
  };

  const tuna = school ? ', and a school of tuna' : '';
  // The reef's small life lives only in the explorer, too small for the card: at each island, its own.
  const macroAt = (place: ScenePlace, i: number) => (!explorer ? [] : preview ? (i === 0 ? SHOWCASE_MACRO : []) : macroResidents(place.residents));
  const macro = places.flatMap(macroAt);
  const small = macro.length === 0 ? '' : macro.length === 1 ? ', and a small creature on the reef to find up close' : `, and ${macro.length} small creatures on the reef to find up close`;
  const explore = explorer ? `${small}. Pinch or use the zoom buttons to look closer, and drag to look around${places.length > 1 ? ' and sail between the islands' : ''}` : '';
  const everyone = places.reduce((sum, place) => sum + place.residents.length, 0);
  const where = places.length > 1 ? `${places.length} islands at level ${level}` : `Level ${level} ${habitat}`;
  const description = (loading ? 'Your island; loading your discoveries' : preview
    ? `${where} with ${SHOWCASE_SWIMMERS.length} visiting species (showcase)${tuna}`
    : everyone === 0
      ? `${where}, its ocean still empty`
      : `${where}, home to ${everyone} discovered species, ${swimmers.length} swimming${tuna}`) + explore;
  // Each island's animals (and small life, in the explorer) live at its place in the ocean.
  const sceneIslands: SceneIsland[] = lineups.map(({ place, swimmers: here, schoolSpecies, school: schooling }, i) => ({
    key: place.key, habitat: place.habitat, x: place.x, z: place.z,
    content: <>
      {models && !loading && <MarineSwimmers models={models} active={active} level={level} tapScale={explorer?.tapScale}
        residents={preview
          ? (i === 0 ? visitors.map((s) => ({ ...s, id: s.model, onPress: () => onInspect(s.model) })) : [])
          : here.map((s) => ({ ...s, id: s.species.id, onPress: () => router.push(`/species/${s.species.id}`) }))}
        onSchoolPress={() => router.push(`/species/${schoolSpecies}`)} school={schooling} schoolSpecies={SCHOOLED} arrivals={i === 0 ? arrivals : undefined} />}
      {explorer && !loading && macroAt(place, i).length > 0 && <MacroLife level={level} species={macroAt(place, i)} zoom={explorer.zoom} tapScale={explorer.tapScale} active={active}
        onPress={(id) => router.push(`/species/${id}`)} onFocus={(x, z, zoom) => explorer.focus(place.x + x, place.z + z, zoom)} />}
    </>,
  }));

  // The 3D view is one labelled image for screen readers. The label sits inside the error boundary,
  // so if the scene fails, its fallback and "Try again" button can still be reached.
  return <View style={frame} onLayout={onLayout}>
    <SceneBoundary fallback={fallback}>
      <View style={styles.canvas} accessible accessibilityRole="image" accessibilityLabel={description}>
      <Canvas orthographic flat {...(Platform.OS === 'web' ? { dpr: 1.25 } : {})} frameloop={active && !!models && !loading ? 'always' : 'demand'} camera={SCENE_CAMERA}
        gl={{ antialias: Platform.OS === 'web' }}
        onCreated={({ camera }) => camera.lookAt(0, -.15, 0)} style={styles.canvas}>
        {/* The view pulls back as the island levels up and its ocean widens. */}
        {!explorer && <SceneCamera scale={oceanScale(level)} />}
        {onOpen && !explorer && <TapAnywhere onTap={onOpen} />}
        {__DEV__ && <ScenePerformance ready={!!models && !loading} active={active} />}
        {ISLAND_PERF && <IslandPerfProbe />}
        {/* The animals swim inside their island's water, which tints and refracts them. */}
        <SanctuaryEnvironment habitat={habitat} level={level} active={active} growIn={active && !loading} reach={explorer ? EXPLORER.reach : undefined} islands={sceneIslands}>
          {explorer?.camera}
        </SanctuaryEnvironment>
      </Canvas>
      </View>
    </SceneBoundary>
    {!!label && <NewTag label={label} x={tag.x} y={tag.y} inView={tag.inView} visible={!!moments?.tag && !preview}
      onWidth={(width) => { layout.current.tag = width; }} />}
    {moments?.banner && <LevelUpBanner {...moments.banner} still={!active} />}
    {!!note && <DiscoveryNote text={note} visible={!!moments?.note} still={!active} />}
    {ISLAND_PERF && <IslandPerfBadge />}
  </View>;
}

const styles = StyleSheet.create({
  scene: { width: '100%', aspectRatio: 420 / 390 },
  fill: { flex: 1 },
  canvas: { flex: 1 },
});
