/**
 * Work that can be done in short slices. A long computation (the explorer's ocean takes a phone seconds) is written once, as a
 * generator that yields between small pieces of its work (`Steps`): `finish` runs it to the end at once, as an ordinary function
 * would (the tests, the bake script, and everything that needs the answer now), and `runSliced` runs it a slice at a time, giving the
 * thread back between slices so touches, timers and frames get their turn. Both run the very same code, so the same numbers come out.
 */
export type Steps<T> = Generator<void, T, undefined>;

/** Run to the end at once. */
export function finish<T>(steps: Steps<T>): T {
  for (let step = steps.next(); ; step = steps.next()) if (step.done) return step.value;
}

export type Pacing = {
  /** About how long (ms) to work before giving the thread back; asked again for every slice, so a computation can be hurried while it runs. */
  slice: number | (() => number);
  /** Give the thread back (the default: a zero timeout, after which the timers and touches waiting have had their turn). */
  pause?: () => Promise<void>;
  /** The clock (ms). */
  now?: () => number;
  /** Told how long each slice ran (ms), for measuring the longest. */
  onSlice?: (ms: number) => void;
  /** Asked each time the thread has been given back: true to give up (the run then rejects with `Stopped`, and the steps go no further). */
  stop?: () => boolean;
};

/** What a run that was told to stop rejects with. */
export class Stopped extends Error {
  constructor() { super('Stopped'); this.name = 'Stopped'; }
}

const clock = () => (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now());
const later = () => new Promise<void>((resolve) => { setTimeout(resolve, 0); });

/**
 * Run in slices: step until the next step would take it past `slice` ms (judged by how long the last one took), give the thread back, and
 * go on. A step is not cut short, so a slice runs about `slice` ms, a little over where a step takes longer than the one before it (the
 * generator's own pieces are a few to ten milliseconds each); every slice takes at least one step.
 */
export async function runSliced<T>(steps: Steps<T>, pacing: Pacing): Promise<T> {
  const now = pacing.now ?? clock, pause = pacing.pause ?? later;
  for (;;) {
    const started = now(), budget = typeof pacing.slice === 'function' ? pacing.slice() : pacing.slice;
    for (let before = started; ;) {
      const step = steps.next(), at = now();
      if (step.done) { pacing.onSlice?.(at - started); return step.value; }
      if (at - started + (at - before) >= budget) { pacing.onSlice?.(at - started); break; }
      before = at;
    }
    await pause();
    if (pacing.stop?.()) { steps.return(undefined as never); throw new Stopped(); }
  }
}
