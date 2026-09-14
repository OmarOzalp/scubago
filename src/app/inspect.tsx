import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Canvas } from '@react-three/fiber';
import { useLocalSearchParams } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AnimatedMarine } from '@/components/home/three/animated-marine';
import { SanctuaryEnvironment } from '@/components/home/three/sanctuary-environment';
import { useMarineModels } from '@/components/home/three/use-marine-models';
import { Spacing } from '@/constants/theme';
import { useSceneActive } from '@/hooks/use-scene-active';
import type { MarineModel } from '@/lib/swimming';

const ABOUT: Record<MarineModel, { name: string; family: string }> = {
  shark: { name: 'Shark', family: 'shark' },
  manta: { name: 'Manta ray', family: 'ray' },
  'reef-fish': { name: 'Reef fish', family: 'fish' },
};

/** A closer look at one of the swimming rigs, turning slowly in open water. */
export default function InspectScreen() {
  const params = useLocalSearchParams<{ model?: string; preview?: string }>();
  const model: MarineModel = params.model === 'manta' ? 'manta' : params.model === 'reef-fish' ? 'reef-fish' : 'shark';
  const about = ABOUT[model];
  const active = useSceneActive();
  const { models, failed } = useMarineModels();

  return <ThemedView style={styles.root}>
    <View style={styles.stage} accessible accessibilityRole="image" accessibilityLabel={`A ${about.name.toLowerCase()} turning slowly in open water`}>
      {models ? <Canvas orthographic shadows frameloop={active ? 'always' : 'demand'}
        camera={{ position: [6, 4.2, 6], zoom: 46, near: .1, far: 60 }}
        onCreated={({ camera }) => camera.lookAt(0, .2, 0)} style={styles.canvas}>
        <SanctuaryEnvironment habitat="lagoon" level={1} active={active} inspect />
        <AnimatedMarine model={model} gltf={models[model]} lane={0} active={active} inspect />
      </Canvas> : failed
        ? <ThemedText type="small" themeColor="textSecondary" style={styles.center}>The 3D view isn&apos;t available on this device.</ThemedText>
        : <ActivityIndicator color="#356D60" style={styles.center} />}
    </View>
    <View style={styles.caption}>
      <ThemedText type="subtitle">{about.name}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        A stylized family representative: every {about.family} in your collection swims with this rig, not a scientific model of each species.
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
