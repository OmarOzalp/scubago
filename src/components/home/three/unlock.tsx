import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';

/**
 * How the island grows into a new level while it is on screen: newly unlocked props rise or grow in
 * over `duration` seconds (quicker in lite quality). Without animation (reduced motion, or the scene
 * paused) they are simply there.
 */
export type Growth = {
  animate: boolean; duration: number;
  /** Make a rising islet look under water below the surface; returns the undo (see islet-material.ts). */
  submerge?: (group: Group) => () => void;
};
export const GrowthContext = createContext<Growth>({ animate: false, duration: 3.5 });
export const GROWTH_SECONDS = { full: 3.5, lite: 2 };
/** How far below its place (units) an islet starts: deep enough that its sand and palm are out of sight. */
export const ISLET_DEPTH = .7;
const easeInOut = (t: number) => t * t * (3 - 2 * t);

/**
 * Something the island gains at level `at`. If it appears while the island is already shown, it
 * rises from the water (`rise`: an islet, carrying what stands on it) or grows from nothing (`grow`:
 * coral, a rock, a palm); present from the start, it is simply there.
 */
export function Unlock({ at, level, kind, children }: { at: number; level: number; kind: 'rise' | 'grow'; children: ReactNode }) {
  const { animate, duration, submerge } = useContext(GrowthContext);
  const present = level >= at;
  const [initially] = useState(present);
  const group = useRef<Group>(null);
  // How far it has grown in (0 hidden, 1 in place). Set only from effects and frames, never as JSX props:
  // a re-render must not undo a rise part-way.
  const progress = useRef(initially ? 1 : 0);
  // While an islet is rising, the undo for its underwater look.
  const underwater = useRef<(() => void) | null>(null);
  const surface = () => { underwater.current?.(); underwater.current = null; };
  const apply = (t: number) => {
    const g = group.current, e = easeInOut(t);
    if (!g) return;
    if (kind === 'rise') g.position.y = e >= 1 ? 0 : -ISLET_DEPTH * (1 - e);
    else g.scale.setScalar(Math.max(.001, e));
  };
  useLayoutEffect(() => {
    // Gone (the level is held back for its level-up, or fell): when it comes back, it grows in again.
    if (!present) { progress.current = 0; surface(); return; }
    if (!animate) progress.current = 1;
    apply(progress.current);
    if (kind === 'rise' && progress.current < 1 && !underwater.current && group.current && submerge) underwater.current = submerge(group.current);
    if (progress.current >= 1) surface();
  });
  useLayoutEffect(() => surface, []);
  useFrame((_, delta) => {
    if (!present || progress.current >= 1) return;
    progress.current = animate ? Math.min(1, progress.current + Math.min(delta, .05) / duration) : 1;
    apply(progress.current);
    if (progress.current >= 1) surface();
  });
  return present ? <group ref={group}>{children}</group> : null;
}
