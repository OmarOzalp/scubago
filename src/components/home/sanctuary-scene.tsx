import { Component, type ReactNode, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Canvas } from '@react-three/fiber';
import { router } from 'expo-router';
import { IslandScene } from './island-scene';
import { AnimatedMarine } from './three/animated-marine';
import { SanctuaryEnvironment } from './three/sanctuary-environment';
import { useMarineModels } from './three/use-marine-models';
import { useSceneActive } from '@/hooks/use-scene-active';
import type { Habitat } from '@/lib/home';
import { pickSwimmers, showsPreview, swimmerPages, type MarineModel } from '@/lib/swimming';
import type { DexEntry } from '@/lib/types';

/** Visiting animals for an empty ocean: labeled as a preview, never counted as discoveries. */
export const PREVIEW_SWIMMERS: { model: MarineModel; lane: number }[] = [
  { model: 'shark', lane: 0 },
  { model: 'manta', lane: 2 },
];

/** Oblique orthographic view: island at the origin, camera up and to the front-right. */
export const SCENE_CAMERA = { position: [7.5, 6.6, 7.5] as [number, number, number], zoom: 31, near: .1, far: 60 };

class SceneBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { console.warn('3D sanctuary unavailable; showing the illustrated island', error); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export function SanctuaryScene({ habitat, level, residents, paused = false, onInspect }: {
  habitat: Habitat; level: number; residents: DexEntry[]; paused?: boolean; onInspect: (model: MarineModel) => void;
}) {
  const active = useSceneActive(paused);
  const { models, failed } = useMarineModels();
  const [page, setPage] = useState(0);
  const pages = swimmerPages(residents);
  useEffect(() => {
    if (!active || pages <= 1) return;
    const timer = setInterval(() => setPage((p) => (p + 1) % pages), 30000);
    return () => clearInterval(timer);
  }, [active, pages]);

  const fallback = <IslandScene habitat={habitat} level={level} residents={residents} paused={paused} />;
  if (failed) return fallback;

  const preview = showsPreview(residents);
  const swimmers = pickSwimmers(residents, page);
  const label = preview
    ? `Level ${level} ${habitat} with a visiting shark and manta ray as a preview`
    : `Level ${level} ${habitat}, home to ${residents.length} discovered species, ${swimmers.length} swimming`;

  return <View style={styles.scene} accessible accessibilityRole="image" accessibilityLabel={label}>
    {models ? <SceneBoundary fallback={fallback}>
      <Canvas orthographic shadows frameloop={active ? 'always' : 'demand'} camera={SCENE_CAMERA}
        onCreated={({ camera }) => camera.lookAt(0, -.15, 0)} style={styles.canvas}>
        <SanctuaryEnvironment habitat={habitat} level={level} active={active} />
        {preview
          ? PREVIEW_SWIMMERS.map((s) => <AnimatedMarine key={s.model} model={s.model} gltf={models[s.model]} lane={s.lane} active={active} onPress={() => onInspect(s.model)} />)
          : swimmers.map((s) => <AnimatedMarine key={s.species.id} model={s.model} gltf={models[s.model]} lane={s.lane} active={active} onPress={() => router.push(`/species/${s.species.id}`)} />)}
      </Canvas>
    </SceneBoundary> : <View style={styles.loading}><ActivityIndicator color="#356D60" /></View>}
  </View>;
}

const styles = StyleSheet.create({
  scene: { width: '100%', aspectRatio: 420 / 390 },
  canvas: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
