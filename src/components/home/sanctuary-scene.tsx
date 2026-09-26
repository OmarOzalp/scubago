import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { SceneCanvas as Canvas } from './three/scene-canvas';
import { SceneBoundary, SceneUnavailable } from './scene-boundary';
import { SceneCamera } from './three/scene-camera';
import { ScenePerformance } from './three/scene-performance';
import { router } from 'expo-router';
import { IslandScene } from './island-scene';
import { MarineSwimmers } from './three/marine-swimmers';
import { SanctuaryEnvironment } from './three/sanctuary-environment';
import { useMarineModels } from './three/use-marine-models';
import { useSceneActive } from '@/hooks/use-scene-active';
import type { Habitat } from '@/lib/home';
import { pickSwimmers, showsPreview, swimmerPages, type MarineModel } from '@/lib/swimming';
import type { DexEntry } from '@/lib/types';

/** Visiting animals for an empty ocean: labeled as a preview, never counted as discoveries. */
export const PREVIEW_SWIMMERS: { model: MarineModel; lane: number }[] = [
  { model: 'whale-shark', lane: 0 },
  { model: 'reef-manta', lane: 2 },
];

/** A mostly overhead orthographic view gives the island an illustrated 2.5D appearance. */
export const SCENE_CAMERA = { position: [0, 12, 6] as [number, number, number], zoom: 31, near: .1, far: 60 };

export function SanctuaryScene({ habitat, level, residents, paused = false, loading = false, onInspect }: {
  habitat: Habitat; level: number; residents: DexEntry[]; paused?: boolean; loading?: boolean; onInspect: (model: MarineModel) => void;
}) {
  const active = useSceneActive(paused);
  const [page, setPage] = useState(0);
  const pages = swimmerPages(residents);
  const preview = showsPreview(residents);
  const swimmers = pickSwimmers(residents, page);
  const { models, failed, retry } = useMarineModels(loading ? [] : (preview ? PREVIEW_SWIMMERS : swimmers).map((s) => s.model));
  useEffect(() => {
    if (!active || pages <= 1) return;
    const timer = setInterval(() => setPage((p) => (p + 1) % pages), 30000);
    return () => clearInterval(timer);
  }, [active, pages]);

  const fallback = <IslandScene habitat={habitat} level={level} residents={residents} paused={paused} />;
  if (failed) return <View style={styles.scene}><SceneUnavailable onRetry={retry}>{fallback}</SceneUnavailable></View>;

  const label = loading ? 'Your island; loading your discoveries' : preview
    ? `Level ${level} ${habitat} with a visiting whale shark and reef manta ray as a preview`
    : `Level ${level} ${habitat}, home to ${residents.length} discovered species, ${swimmers.length} swimming`;

  return <View style={styles.scene} accessible accessibilityRole="image" accessibilityLabel={label}>
    <SceneBoundary fallback={fallback}>
      <Canvas orthographic flat {...(Platform.OS === 'web' ? { dpr: 1.25 } : {})} frameloop={active && !!models && !loading ? 'always' : 'demand'} camera={SCENE_CAMERA}
        gl={{ antialias: Platform.OS === 'web' }}
        onCreated={({ camera }) => camera.lookAt(0, -.15, 0)} style={styles.canvas}>
        <SceneCamera />
        {__DEV__ && <ScenePerformance ready={!!models && !loading} active={active} />}
        {/* The animals swim inside the island's water, which tints and refracts them. */}
        <SanctuaryEnvironment habitat={habitat} level={level} active={active}>
          {models && !loading && <MarineSwimmers models={models} active={active}
            residents={preview
              ? PREVIEW_SWIMMERS.map((s) => ({ ...s, id: s.model, onPress: () => onInspect(s.model) }))
              : swimmers.map((s) => ({ ...s, id: s.species.id, onPress: () => router.push(`/species/${s.species.id}`) }))} />}
        </SanctuaryEnvironment>
      </Canvas>
    </SceneBoundary>
  </View>;
}

const styles = StyleSheet.create({
  scene: { width: '100%', aspectRatio: 420 / 390 },
  canvas: { flex: 1 },
});
