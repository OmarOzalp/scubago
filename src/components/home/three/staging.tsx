import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { Group as Object3DGroup } from 'three';
import { STAGE, type Group, type Stager } from './stager';
import { GrowthContext } from './unlock';

/**
 * A scene built in steps (stager.ts): what a component is to build, it builds when its step opens, in a task of its own, with the screen
 * drawn between. Without a stager above it (the animal close-up, the tests), everything is there at once, as before.
 */
export const StagerContext = createContext<Stager | null>(null);
/** The island whose place a component is building (none: the sea between). */
export const IslandContext = createContext<string | null>(null);

/**
 * Hands the stager the scene's frames (the first starts the building; later ones end the wait for a frame between steps) and its
 * way to ask for one, and holds the building while the scene is hidden.
 */
export function StagingProvider({ stager, hidden = false, children }: { stager: Stager; hidden?: boolean; children?: ReactNode }) {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    stager.setInvalidate(invalidate);
    return () => stager.setInvalidate(undefined);
  }, [stager, invalidate]);
  useEffect(() => { stager.hold(hidden); }, [stager, hidden]);
  useFrame(() => stager.frame(), -2000);
  return <StagerContext.Provider value={stager}>{children}</StagerContext.Provider>;
}

/**
 * How many of `total` steps of this stage (on this island, unless said otherwise) have opened. With no stager to wait for, all of them. The
 * steps open one at a time, in the stager's order, and the count only grows; more steps (`total` grows: an animal's model has arrived)
 * are opened in their turn too.
 */
export function useSteps(stage: number, total = 1, island?: string | null): number {
  const stager = useContext(StagerContext), here = useContext(IslandContext);
  const at = island === undefined ? here : island;
  const [opened, setOpened] = useState(0);
  const group = useRef<Group | null>(null);
  useLayoutEffect(() => {
    if (!stager) return;
    const joined: Group = { island: at, stage, total, opened, open: setOpened };
    group.current = joined;
    const leave = stager.register(joined);
    return () => { group.current = null; leave(); };
    // (the group is made once for its island and stage; the count it is told of and the steps it has open are its own)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stager, at, stage]);
  useLayoutEffect(() => {
    if (stager && group.current) stager.resize(group.current, total);
  }, [stager, total]);
  // The step just opened is on screen: the next may open.
  useLayoutEffect(() => {
    if (stager && group.current && group.current.opened === opened) stager.committed(group.current);
  }, [stager, opened]);
  return stager ? Math.min(opened, total) : total;
}

/** Whether this stage's step (on this island) has opened. */
export function useStep(stage: number, island?: string | null) {
  return useSteps(stage, 1, island) > 0;
}

/** How long what arrives after the first frame takes to grow into its place (s). */
export const ARRIVE_SECONDS = .6;
const easeInOut = (t: number) => t * t * (3 - 2 * t);

/**
 * What arrives into a scene that is on show grows from its place over `ARRIVE_SECONDS`, as an island's new corals and palm do at
 * a level-up (unlock.tsx), instead of appearing all at once; what arrives under Home's picture, or with the first frame, is simply there.
 */
function Arrive({ children }: { children: ReactNode }) {
  const stager = useContext(StagerContext), growth = useContext(GrowthContext);
  const group = useRef<Object3DGroup>(null);
  // (the scene on show and moving: not under a picture of it, not still or paused)
  const [animate] = useState(() => growth.animate && !!stager?.shown);
  const progress = useRef(animate ? 0 : 1);
  useLayoutEffect(() => {
    group.current?.scale.setScalar(Math.max(.001, easeInOut(progress.current)));
  }, []);
  const invalidate = useThree((state) => state.invalidate);
  useFrame((_, delta) => {
    if (progress.current >= 1 || !group.current) return;
    progress.current = Math.min(1, progress.current + Math.min(delta, .05) / ARRIVE_SECONDS);
    group.current.scale.setScalar(Math.max(.001, easeInOut(progress.current)));
    if (progress.current < 1) invalidate();
  });
  return <group ref={group}>{children}</group>;
}

/**
 * Its children are built when this stage's step opens (on the island above it), and grow in then if `grow`. Nothing is rendered of them
 * before: a coast, a forest, the animals' swimming. With no stager above, they are there at once, as they were.
 */
export function Stage({ at, grow = false, children }: { at: number; grow?: boolean; children?: ReactNode }) {
  const stager = useContext(StagerContext);
  const open = useStep(at);
  if (!open) return null;
  return grow && stager ? <Arrive>{children}</Arrive> : <>{children}</>;
}

/** What a mesh made in slices (sliced-geometry.ts) comes in with once it is made: it grows in if the scene is staged (and on show), and is simply there if it is not. */
export function Arriving({ children }: { children?: ReactNode }) {
  const stager = useContext(StagerContext);
  return stager ? <Arrive>{children}</Arrive> : <>{children}</>;
}

export { STAGE };
