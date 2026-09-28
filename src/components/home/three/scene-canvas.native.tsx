import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { PixelRatio, StyleSheet, View } from 'react-native';
import { isDevice } from 'expo-device';
import { Canvas, useFrame, useThree } from '@react-three/fiber/native';
import { sceneQuality, SceneQualityContext } from './scene-quality';

/**
 * Pause before the next simulator frame: frames start at least 50ms apart (20fps at most),
 * and the JS thread stays idle for most of the time the last frame took to draw.
 */
export const nextFrameDelay = (cost: number) => Math.max(50 - cost, cost * .8);

/**
 * The simulator draws GL in software on a worker thread, which falls behind if frames are
 * requested on a fixed timer: queued frames pile up and the picture freezes. Instead, render
 * each frame here, wait for the worker to finish it (expo-gl's flushEXP returns once all
 * queued GL work has run), and only then schedule the next one. The scene then animates at
 * whatever rate the simulator can draw, and the picture stays current.
 */
function SimulatorFrames({ active }: { active: boolean }) {
  const invalidate = useThree((state) => state.invalidate);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const running = useRef(false);
  const log = useRef({ frames: 0, total: 0 });
  useEffect(() => {
    running.current = active;
    if (active) invalidate();
    return () => { running.current = false; clearTimeout(timer.current); };
  }, [active, invalidate]);
  // Priority 1 runs after every other frame callback and takes over rendering for this canvas.
  useFrame(({ gl, scene, camera }) => {
    const started = performance.now();
    gl.render(scene, camera);
    (gl.getContext() as { flushEXP?: () => void }).flushEXP?.();
    const cost = performance.now() - started;
    if (__DEV__) {
      const value = log.current;
      value.frames++; value.total += cost;
      if (value.frames === 60) {
        const average = value.total / 60;
        console.info(`[island] simulator GL: ${Math.round(average)}ms per frame, about ${Math.round(1000 / (average + nextFrameDelay(average)))}fps`);
        value.frames = 0; value.total = 0;
      }
    }
    clearTimeout(timer.current);
    if (running.current) timer.current = setTimeout(invalidate, nextFrameDelay(cost));
  }, 1);
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
      // Fiber's native Canvas spreads this over its own `flex: 1`, which would stretch the reduced
      // height back to the card's full height: a GL buffer 1.5x the intended size on a @3x iPhone
      // (3x on the simulator), the extra third drawn off-screen and clipped every frame.
      flex: 0,
      width: size.width * scale,
      height: size.height * scale,
      transform: [{ scale: 1 / scale }],
    }}>
      <SceneQualityContext.Provider value={sceneQuality(!isDevice)}>{children}</SceneQualityContext.Provider>
      {!isDevice && <SimulatorFrames active={frameloop === 'always'} />}
    </Canvas>}
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
