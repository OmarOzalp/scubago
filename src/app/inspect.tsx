import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { SceneCanvas as Canvas } from '@/components/home/three/scene-canvas';
import { SceneBoundary, SceneUnavailable } from '@/components/home/scene-boundary';
import { SceneCamera } from '@/components/home/three/scene-camera';
import { useLocalSearchParams } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AnimatedMarine } from '@/components/home/three/animated-marine';
import { SanctuaryEnvironment } from '@/components/home/three/sanctuary-environment';
import { useMarineModels } from '@/components/home/three/use-marine-models';
import { Spacing } from '@/constants/theme';
import { useSceneActive } from '@/hooks/use-scene-active';
import { inspectionModel, MARINE_ART } from '@/lib/marine-art';

/** A closer look at one of the swimming rigs, turning slowly in open water. */
export default function InspectScreen() {
  const params = useLocalSearchParams<{ model?: string; species?: string; preview?: string }>();
  const model = inspectionModel(params);
  const about = model ? MARINE_ART[model] : null;
  const active = useSceneActive();
  const { models, failed, retry } = useMarineModels(model ? [model] : []);

  if (!model || !about) return <ThemedView style={styles.root}><ThemedText style={styles.caption}>No swimming model is available for this selection.</ThemedText></ThemedView>;

  return <ThemedView style={styles.root}>
    <View style={styles.stage} accessible accessibilityRole="image" accessibilityLabel={`A ${about.name.toLowerCase()} turning slowly in open water`}>
      {models ? <SceneBoundary><Canvas orthographic flat {...(Platform.OS === 'web' ? { dpr: 1.25 } : {})} frameloop={active ? 'always' : 'demand'}
        gl={{ antialias: Platform.OS === 'web' }}
        camera={{ position: [0, 3.8, 9], zoom: 46, near: .1, far: 60 }}
        onCreated={({ camera }) => camera.lookAt(0, .2, 0)} style={styles.canvas}>
        <SceneCamera inspect />
        <SanctuaryEnvironment habitat="lagoon" level={1} active={active} inspect />
        <AnimatedMarine model={model} gltf={models[model]!} lane={0} active={active} inspect />
      </Canvas></SceneBoundary> : failed
        ? <SceneUnavailable onRetry={retry} />
        : <ActivityIndicator color="#356D60" style={styles.center} />}
    </View>
    <View style={styles.caption}>
      <ThemedText type="subtitle">{about.name}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {about.caption}
      </ThemedText>
      {params.preview === '1' && <ThemedText type="smallBold" themeColor="textSecondary">Preview only. Nothing in your collection changes.</ThemedText>}
    </View>
  </ThemedView>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  stage: { flex: 1, backgroundColor: '#aadbd2' },
  canvas: { flex: 1 },
  center: { flex: 1, textAlign: 'center', alignSelf: 'center', justifyContent: 'center', paddingTop: 120 },
  caption: { padding: Spacing.four, gap: Spacing.two },
});
