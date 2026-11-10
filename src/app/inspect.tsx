import { useSyncExternalStore } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { SceneCanvas as Canvas } from '@/components/home/three/scene-canvas';
import { SceneBoundary, SceneUnavailable } from '@/components/home/scene-boundary';
import { SceneCamera } from '@/components/home/three/scene-camera';
import { useLocalSearchParams } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AnimatedMarine } from '@/components/home/three/animated-marine';
import { SanctuaryEnvironment, WATER } from '@/components/home/three/sanctuary-environment';
import { useMarineModels } from '@/components/home/three/use-marine-models';
import { OnWater, Radius, Space } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSceneActive } from '@/hooks/use-scene-active';
import { inspectionModel, MARINE_ART } from '@/lib/marine-art';

const noSubscription = () => () => undefined;

/** A closer look at one of the swimming rigs, turning slowly in open water. */
export default function InspectScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ model?: string; species?: string; preview?: string }>();
  const model = inspectionModel(params);
  const about = model ? MARINE_ART[model] : null;
  const active = useSceneActive();
  const { models, failed, retry } = useMarineModels(model ? [model] : []);
  // On the web this page is pre-rendered as HTML at build time, when it has no ?species= or ?model=, so the HTML says "No swimming
  // model". The first client render does have them, and React rejects the mismatch (error #418). While hydrating, draw what the HTML
  // had (an empty page); the real page follows at once.
  const hydrated = useSyncExternalStore(noSubscription, () => true, () => false);

  if (!hydrated) return <ThemedView style={styles.root} />;
  if (!model || !about) return <ThemedView style={styles.root}><ThemedText style={styles.empty}>No swimming model is available for this selection.</ThemedText></ThemedView>;

  return <ThemedView style={styles.root}>
    <View style={styles.stage}>
      {models ? <SceneBoundary><View style={styles.canvas} accessible accessibilityRole="image" accessibilityLabel={`A ${about.name.toLowerCase()} turning slowly in open water`}><Canvas orthographic flat {...(Platform.OS === 'web' ? { dpr: 1.25 } : {})} frameloop={active ? 'always' : 'demand'} fps={60}
        gl={{ antialias: Platform.OS === 'web' }}
        camera={{ position: [0, 3.8, 9], zoom: 46, near: .1, far: 60 }}
        onCreated={({ camera }) => camera.lookAt(0, .2, 0)} style={styles.canvas}>
        <SceneCamera inspect />
        <SanctuaryEnvironment habitat="lagoon" level={1} active={active} inspect />
        <AnimatedMarine model={model} gltf={models[model]!} lane={0} active={active} inspect />
      </Canvas></View></SceneBoundary> : failed
        ? <SceneUnavailable onRetry={retry} />
        : <ActivityIndicator color={OnWater.ink} style={styles.center} accessibilityLabel="Loading the 3D model" />}
    </View>
    <View style={[styles.caption, { backgroundColor: theme.background }]}>
      <ThemedText type="title" accessibilityRole="header">{about.name}</ThemedText>
      <ThemedText type="callout" themeColor="textSecondary">
        {about.caption}
      </ThemedText>
      {params.preview === '1' && <ThemedText type="footnoteStrong" themeColor="textSecondary">Preview only. Nothing in your collection changes.</ThemedText>}
    </View>
  </ThemedView>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  stage: { flex: 1, backgroundColor: WATER.lagoon },
  canvas: { flex: 1 },
  center: { flex: 1, textAlign: 'center', alignSelf: 'center', justifyContent: 'center', paddingTop: 120 },
  // The caption is a sheet over the foot of the water: page colour, big top corners.
  caption: { padding: Space.s6, gap: Space.s2, marginTop: -Radius.xl, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl },
  empty: { padding: Space.s6 },
});
