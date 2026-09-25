import { useEffect, useState, type ComponentProps } from 'react';
import { PixelRatio, StyleSheet, View } from 'react-native';
import { isDevice } from 'expo-device';
import { Canvas, useThree } from '@react-three/fiber/native';

/** The simulator uses a software GL renderer; avoid queuing frames faster than it can draw. */
function SimulatorFrames({ active }: { active: boolean }) {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => invalidate(), 50);
    return () => clearInterval(timer);
  }, [active, invalidate]);
  return null;
}

/** Expo GL owns its drawing buffer, so native resolution is controlled by layout. */
export function SceneCanvas({ style, children, frameloop = 'always', ...props }: ComponentProps<typeof Canvas>) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const scale = Math.min(1, (isDevice ? 2 : 1) / PixelRatio.get());
  return <View style={[styles.container, style]} onLayout={({ nativeEvent: { layout } }) => {
    setSize((previous) => previous.width === layout.width && previous.height === layout.height
      ? previous : { width: layout.width, height: layout.height });
  }}>
    {size.width > 0 && size.height > 0 && <Canvas {...props} frameloop={isDevice ? frameloop : 'demand'} style={{
      width: size.width * scale,
      height: size.height * scale,
      transform: [{ scale: 1 / scale }],
    }}>
      {children}
      {!isDevice && <SimulatorFrames active={frameloop === 'always'} />}
    </Canvas>}
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
