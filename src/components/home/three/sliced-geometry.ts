import { useContext, useLayoutEffect, useState } from 'react';
import type { BufferGeometry } from 'three';
import { builtOnce, keepBuilt, peekBuilt } from './geometry-cache';
import { shippedOrMade, wantMesh } from './mesh-store';
import type { Group } from './stager';
import { IslandContext, StagerContext } from './staging';

/**
 * A mesh made in slices. A coast, a forest or a reef's corals is one geometry made by one long run of code (hundreds of milliseconds to
 * seconds on a phone's JavaScript engine, in one task that freezes the screen). Written as a generator, the same code stops at a number of
 * places along the way (`yield`), and the scene's stager (stager.ts) runs it a few milliseconds at a time, a task each, with the screen
 * drawn between. Nothing else changes: the parts are made in the same order by the same code, so the geometry is the same, bit for bit,
 * as when it is run in one go (as it is with no stager above, in the tests and fingerprints).
 */
export type Job = Generator<void, BufferGeometry, void>;

/** How long (ms) a slice works before it hands the thread back. */
export const SLICE_MS = 12;

const clock = () => (typeof performance === 'undefined' ? Date.now() : performance.now());

/** Run a job to the end, in one go. */
export function runAll(job: Job): BufferGeometry {
  for (;;) {
    const step = job.next();
    if (step.done) return step.value;
  }
}

/**
 * The geometry for `key`, made by `make()` (the same job whenever the key is the same) in slices, one stager step each, at this stage on
 * this island; null until it is done (the geometry it had for an earlier key until then: a level-up swaps one for the other when the new
 * is made). Kept by key (geometry-cache.ts) once made, so the next to ask for it has it at once. With no stager above (or `sliced` false, for
 * a small one that is not worth a step of its own): made at once.
 */
export function useSlicedGeometry(key: string, stage: number, make: () => Job, sliced = true): BufferGeometry | null {
  const above = useContext(StagerContext), island = useContext(IslandContext);
  const stager = sliced ? above : null;
  const [made, setMade] = useState<BufferGeometry | null>(null);
  const now = stager ? null : builtOnce(key, () => runAll(make()));
  const kept = now ?? peekBuilt(key) ?? null;
  useLayoutEffect(() => {
    if (!stager || peekBuilt(key)) return;
    // The file shipped for it, if there is one, is read while the step waits its turn (and was, mostly, ahead of the scene: mesh-assets.ts); the job is
    // that mesh's from the file if it is held when the step opens, else the builder's own.
    wantMesh(key);
    const job = shippedOrMade(key, make);
    const group: Group = {
      island, stage, total: 1, opened: 0,
      open: () => {
        const began = clock();
        let step = job.next();
        while (!step.done && clock() - began < SLICE_MS) step = job.next();
        if (step.done) {
          keepBuilt(key, step.value);
          group.total = group.opened;
          setMade(step.value);
        } else group.total = group.opened + 1;
        stager.committed(group);
      },
    };
    const leave = stager.register(group);
    return () => { leave(); job.return(undefined as never); };
    // (the job is the key's: the same whenever the key is)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stager, island, stage, key]);
  return kept ?? made;
}
