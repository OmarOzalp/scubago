import { useEffect, useState, type ComponentProps } from 'react';
import { AppState, PixelRatio, StyleSheet, View } from 'react-native';
import { isDevice } from 'expo-device';
import type { ExpoWebGLRenderingContext } from 'expo-gl';
import { Canvas, useThree } from '@react-three/fiber/native';

/** Milliseconds between simulator frames: 20 Hz at best, never slower than one frame every two seconds. */
export const SIMULATOR_FRAME_MS = { min: 50, max: 2000 };

/**
 * The next simulator frame interval. `waited` is how long the GL queue was still
 * busy with the previous frame when the next one was due: leave that much more
 * room (plus a margin), and ease back toward 20 Hz once the queue keeps up.
 */
export function nextSimulatorDelay(delay: number, waited: number) {
  const { min, max } = SIMULATOR_FRAME_MS;
  return waited > 2 ? Math.min(max, (delay + waited) * 1.25) : Math.max(min, delay * .75);
}

/**
 * The simulator draws GL in software on the Mac's CPU, and Expo GL has no
 * back-pressure: `endFrameEXP` queues the frame and returns at once. Asking for
 * frames faster than the software renderer can draw them grows that queue
 * without bound, so the view shows a stale or empty image while memory and
 * latency climb. Before each frame, wait for the previous one (`flushEXP`
 * blocks until the GL queue drains) and stretch the interval by however long
 * that took, so at most one frame is ever in flight.
 */
function SimulatorFrames({ active }: { active: boolean }) {
  const invalidate = useThree((state) => state.invalidate);
  const gl = useThree((state) => state.gl);
  useEffect(() => {
    if (!active) return;
    const context = gl?.getContext() as Partial<ExpoWebGLRenderingContext> | undefined;
    let delay = SIMULATOR_FRAME_MS.min, ticks = 0, longest = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      let waited = 0;
      // Expo GL stops draining its queue once the app resigns active, so never block then.
      if (context?.flushEXP && AppState.currentState === 'active') {
        const start = performance.now();
        context.flushEXP();
        waited = performance.now() - start;
      }
      delay = nextSimulatorDelay(delay, waited);
      longest = Math.max(longest, waited);
      if (__DEV__ && ++ticks === 60) {
        console.info(`[island] simulator GL pacing: a frame every ${Math.round(delay)}ms; longest wait for the GL queue ${Math.round(longest)}ms`);
      }
      invalidate();
      timer = setTimeout(tick, delay);
    };
    timer = setTimeout(tick, delay);
    return () => clearTimeout(timer);
  }, [active, gl, invalidate]);
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
      // Fiber's native Canvas spreads this over its own `flex: 1`, which would otherwise
      // stretch the reduced height back to the full card (a GL buffer 3x taller than
      // intended on a @3x simulator, mostly drawn off-screen and clipped).
      flex: 0,
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
