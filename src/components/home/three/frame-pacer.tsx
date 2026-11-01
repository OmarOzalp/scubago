import { createContext, useContext, useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';

/** How often an ambient scene (Home's card, the explorer at rest) draws: the animals swim as smoothly at 30 as they need to, at half the work. */
export const AMBIENT_FPS = 30;
/** The next frame is asked for this long (ms) before it is due, so it lands on the display refresh it belongs to rather than the one after. */
export const LEAD_MS = 8;

/** How often the scene draws while it animates (60 unless paced), for readouts that call a frame slow only when it is late for that. */
export const FrameRateContext = createContext(60);
export const useFrameRate = () => useContext(FrameRateContext);

/**
 * Draws a canvas that is on demand (frameloop 'demand') `fps` times a second for as long as it is mounted: each frame asks, a
 * little before it is due, for the next one `1000 / fps` ms after its own start. A frame drawn for another reason (the
 * explorer asks for one every refresh while fingers are down or the view eases) puts the next paced one back, so those run
 * at the display's rate for as long as they last and the scene falls back to `fps` as soon as they stop. A device too slow
 * for `fps` just draws as fast as it can: the next is asked for the moment the last is done. Everything the scene does is
 * worked out from the time between frames, so its speed is the same at any rate.
 */
export function FramePacer({ fps }: { fps: number }) {
  const invalidate = useThree((state) => state.invalidate);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    invalidate();
    return () => clearTimeout(timer.current);
  }, [invalidate]);
  // First in the frame, so the next one is timed from where this one started rather than from where it ended.
  useFrame(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(invalidate, Math.max(0, 1000 / fps - LEAD_MS));
  }, -1000);
  return null;
}
