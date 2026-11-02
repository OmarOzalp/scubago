import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { Group as Object3DGroup } from 'three';
import { markBuilt } from './built-islands';
import { STAGE, type Group, type Stager } from './stager';
import { GrowthContext } from './unlock';

/**
 * A scene built in steps (stager.ts): what a component is to build, it builds when its step opens, in a task of its own, with the screen
 * drawn between. Without a stager above it (the animal close-up, the tests), everything is there at once, as before.
 */
export const StagerContext = createContext<Stager | null>(null);
/** The island whose place a component is building (none: the sea between). */
export const IslandContext = createContext<string | null>(null);
/** The island whose place a component is building was built before (built-islands.ts): its pieces are simply there, not staged and not shown in any special way. */
export const SeenContext = createContext(false);

/**
 * How what is built into a scene that is already on show comes into it: `whole`, an island's coast and what grows on and round it all at once, when every
 * step of them has opened (hidden until then); `grow`, each piece growing from nothing as its own step opens (the way a level's new corals and palm
 * do: unlock.tsx, which this does not touch). The one place a nicer arrival can be plugged in. `EXPO_PUBLIC_ISLAND_ARRIVAL=grow` brings back the growing,
 * for comparing the two.
 */
export const arrival = (): 'whole' | 'grow' => (process.env.EXPO_PUBLIC_ISLAND_ARRIVAL === 'grow' ? 'grow' : 'whole');

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
export function useSteps(stage: number, total = 1, island?: string | null, staged = true): number {
  const above = useContext(StagerContext), here = useContext(IslandContext), seen = useContext(SeenContext);
  // (what was built before is not staged: its steps are all open at once, unless it is the kind of step that has real work to do each time, `staged`)
  const stager = seen && !staged ? null : above;
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
export function useStep(stage: number, island?: string | null, staged = true) {
  return useSteps(stage, 1, island, staged) > 0;
}

/** How long what arrives after the first frame takes to grow into its place (s). */
export const ARRIVE_SECONDS = .6;
const easeInOut = (t: number) => t * t * (3 - 2 * t);

/**
 * With `grow` arrival (see `arrival`), what arrives into a scene that is on show grows from its place over `ARRIVE_SECONDS`, as an island's new
 * corals and palm do at a level-up (unlock.tsx), instead of appearing all at once; what arrives under a picture of the scene, with the first frame,
 * or on an island built before, is simply there. With `whole` arrival it is simply there too (the island shows it whole: `Whole`).
 */
function Arrive({ children }: { children: ReactNode }) {
  const stager = useContext(StagerContext), growth = useContext(GrowthContext), seen = useContext(SeenContext);
  const group = useRef<Object3DGroup>(null);
  // (the scene on show and moving: not under a picture of it, not still or paused; and not what was built before)
  const [animate] = useState(() => arrival() === 'grow' && growth.animate && !!stager?.shown && !seen);
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

/** The stages whose being all shown makes an island built: its coast, and what grows on and round it (the animals and the small life are different every time). */
const SHOWN = [STAGE.coast, STAGE.props] as const;

/**
 * An island's coast and what grows on and round it (the island above it, built in steps), shown whole: hidden while any of their steps (a coast
 * made in slices, corals, a kelp forest) is still to open, and all there at once when the last has. An island built before is simply there (`seen`);
 * once shown, it stays (a level-up's new pieces are another matter: unlock.tsx). Each island built to the end is remembered under `memory`
 * (built-islands.ts). With `grow` arrival, or no stager, nothing is held back.
 */
export function Whole({ memory, children }: { memory: string; children?: ReactNode }) {
  const stager = useContext(StagerContext), island = useContext(IslandContext), seen = useContext(SeenContext);
  const subscribe = useCallback((listener: () => void) => (stager ? stager.watch(listener) : () => undefined), [stager]);
  const complete = useSyncExternalStore(
    subscribe,
    () => !stager || island === null || (stager.has(island, SHOWN) && !stager.pending(island, SHOWN)),
    () => true,
  );
  const [shown, setShown] = useState(seen);
  if (complete && !shown) setShown(true);
  useEffect(() => { if (complete) markBuilt(memory); }, [complete, memory]);
  return <group visible={shown || arrival() === 'grow'}>{children}</group>;
}

/**
 * Its children are built when this stage's step opens (on the island above it), and grow in then if `grow`. Nothing is rendered of them
 * before: a coast, a forest, the animals' swimming. With no stager above, they are there at once, as they were. On an island built before
 * (built-islands.ts) they are there at once too, unless the stage is one that has real work to do each time (`staged`: the animals).
 */
export function Stage({ at, grow = false, staged = true, children }: { at: number; grow?: boolean; staged?: boolean; children?: ReactNode }) {
  const stager = useContext(StagerContext);
  const open = useStep(at, undefined, staged);
  if (!open) return null;
  return grow && stager ? <Arrive>{children}</Arrive> : <>{children}</>;
}

/** What a mesh made in slices (sliced-geometry.ts) comes in with once it is made: it grows in if the scene is staged (and on show), and is simply there if it is not. */
export function Arriving({ children }: { children?: ReactNode }) {
  const stager = useContext(StagerContext);
  return stager ? <Arrive>{children}</Arrive> : <>{children}</>;
}

export { STAGE };
