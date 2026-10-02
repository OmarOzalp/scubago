import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';
import { SceneCanvas as Canvas } from './three/scene-canvas';
import { SceneBoundary, SceneUnavailable } from './scene-boundary';
import { SceneCamera } from './three/scene-camera';
import { IslandPerfBadge } from './island-perf-badge';
import { IslandPerfProbe, ScenePerformance } from './three/scene-performance';
import { router } from 'expo-router';
import { DiscoveryNote, LevelUpBanner, NewTag } from './discovery-overlays';
import { IslandScene } from './island-scene';
import { MarineSwimmers, type Arrivals } from './three/marine-swimmers';
import { SanctuaryEnvironment } from './three/sanctuary-environment';
import { useMarineModels } from './three/use-marine-models';
import { useSceneActive, useSceneVisible } from '@/hooks/use-scene-active';
import type { Habitat } from '@/lib/home';
import { clamp, oceanScale } from '@/lib/steering';
import { hasSchool, MAX_ANIMATED, pickSwimmers, SCHOOL_SPECIES, schoolSpeciesFor, showsPreview, swimmerPages, swimsInSchool, type MarineModel } from '@/lib/swimming';
import type { DexEntry } from '@/lib/types';

/** Visiting animals for an empty ocean: labeled as a preview, never counted as discoveries. */
export const PREVIEW_SWIMMERS: { model: MarineModel; lane: number }[] = [
  { model: 'whale-shark', lane: 0 },
  { model: 'reef-manta', lane: 2 },
];
/**
 * For reviewing the island's animals together: with EXPO_PUBLIC_ISLAND_SHOWCASE=1 (restart Metro
 * with --clear), every species model visits as the preview, whatever the collection holds.
 */
const SHOWCASE = process.env.EXPO_PUBLIC_ISLAND_SHOWCASE === '1';
/** Frame timing over the card, for measuring the island on real phones (set in the EAS preview profile). */
const ISLAND_PERF = process.env.EXPO_PUBLIC_ISLAND_PERF === '1';
const SHOWCASE_SWIMMERS = (['whale-shark', 'great-white-shark', 'tiger-shark', 'reef-manta', 'mola-mola', 'green-turtle', 'scalloped-hammerhead', 'bottlenose-dolphin',
  // The reef's animals keep to their own places on the reef (reef-life.ts): the moray's den, the octopus's rock, the cuttlefish's reef edge.
  'giant-moray', 'day-octopus', 'giant-cuttlefish'] as const)
  .map((model, lane) => ({ model, lane }));

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

export function SanctuaryScene({ habitat, level, residents, paused = false, loading = false, onInspect, moments }: {
  habitat: Habitat; level: number; residents: DexEntry[]; paused?: boolean; loading?: boolean; onInspect: (model: MarineModel) => void;
  moments?: SceneMoments;
}) {
  const active = useSceneActive(paused);
  const visible = useSceneVisible();
  const [page, setPage] = useState(0);
  const pages = swimmerPages(residents);
  const preview = SHOWCASE || showsPreview(residents);
  const visitors = SHOWCASE ? SHOWCASE_SWIMMERS : PREVIEW_SWIMMERS;
  // Logged tuna are shown by the school rather than as a swimmer of their own; a tap on it opens their species.
  // A new discovery arriving has a place of its own, whatever the page.
  const swimmers = pickSwimmers(residents, page, MAX_ANIMATED, moments?.featured);
  const schoolSpecies = schoolSpeciesFor(residents);
  // No tuna unless one is logged (the showcase shows every animal, the school included).
  const school = SHOWCASE || (!preview && hasSchool(residents));
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
  if (failed) return <View style={styles.scene}><SceneUnavailable onRetry={retry}>{fallback}</SceneUnavailable></View>;
  const onLayout = (event: { nativeEvent: { layout: { width: number; height: number } } }) => {
    layout.current.width = event.nativeEvent.layout.width;
    layout.current.height = event.nativeEvent.layout.height;
  };

  const tuna = school ? ', and a school of tuna' : '';
  const description = loading ? 'Your island; loading your discoveries' : preview
    ? `Level ${level} ${habitat} with ${SHOWCASE ? `${SHOWCASE_SWIMMERS.length} visiting species` : 'a visiting whale shark and reef manta ray'} as a preview${tuna}`
    : `Level ${level} ${habitat}, home to ${residents.length} discovered species, ${swimmers.length} swimming${tuna}`;

  return <View style={styles.scene} onLayout={onLayout} accessible accessibilityRole="image" accessibilityLabel={description}>
    <SceneBoundary fallback={fallback}>
      <Canvas orthographic flat {...(Platform.OS === 'web' ? { dpr: 1.25 } : {})} frameloop={active && !!models && !loading ? 'always' : 'demand'} camera={SCENE_CAMERA}
        gl={{ antialias: Platform.OS === 'web' }}
        onCreated={({ camera }) => camera.lookAt(0, -.15, 0)} style={styles.canvas}>
        {/* The view pulls back as the island levels up and its ocean widens. */}
        <SceneCamera scale={oceanScale(level)} />
        {__DEV__ && <ScenePerformance ready={!!models && !loading} active={active} />}
        {ISLAND_PERF && <IslandPerfProbe />}
        {/* The animals swim inside the island's water, which tints and refracts them. */}
        <SanctuaryEnvironment habitat={habitat} level={level} active={active} growIn={active && !loading}>
          {models && !loading && <MarineSwimmers models={models} active={active} level={level}
            residents={preview
              ? visitors.map((s) => ({ ...s, id: s.model, onPress: () => onInspect(s.model) }))
              : swimmers.map((s) => ({ ...s, id: s.species.id, onPress: () => router.push(`/species/${s.species.id}`) }))}
            onSchoolPress={() => router.push(`/species/${schoolSpecies}`)} school={school} schoolSpecies={SCHOOLED} arrivals={arrivals} />}
        </SanctuaryEnvironment>
      </Canvas>
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
  canvas: { flex: 1 },
});
