import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import { createGovernor, GOVERNOR_LEVELS, type Governor } from '@/lib/quality-governor';

/**
 * The canvas's quality governor (src/lib/quality-governor.ts): made by SceneCanvas, fed by the scene's FrameReport, read by SceneCanvas for
 * the drawing buffer's resolution. `EXPO_PUBLIC_QUALITY_GOVERNOR=0` (restart Metro with --clear) turns it off: always as designed.
 */
export const GovernorContext = createContext<Governor | null>(null);
export const useGovernor = () => useContext(GovernorContext);

const OFF = process.env.EXPO_PUBLIC_QUALITY_GOVERNOR === '0';

/** A canvas's own governor (null when switched off) and its level now. */
export function useCanvasGovernor() {
  const [governor] = useState(() => (OFF ? null : createGovernor()));
  const level = useSyncExternalStore(
    (listener) => governor?.subscribe(listener) ?? (() => {}),
    () => governor?.level() ?? 0,
    () => 0,
  );
  return { governor, level: GOVERNOR_LEVELS[level] };
}

/**
 * In the canvas: the governor judges only the steady scene. While it is being built, behind its picture, still, paused or out of sight,
 * its frames are not load (a build step, a compile, a frame on demand), so they are not counted.
 */
export function GovernorHold({ hold }: { hold: boolean }) {
  const governor = useGovernor();
  useEffect(() => { governor?.hold(hold); }, [governor, hold]);
  return null;
}
