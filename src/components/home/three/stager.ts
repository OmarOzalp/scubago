/**
 * The order a scene is built in. Building all of an island scene at once (its ocean, every island's coast, corals, forests, the animals'
 * swimming and each animal) is one task of seconds on a phone's JavaScript engine, during which nothing on screen answers. A `Stager`
 * hands it out in steps instead, each in a task of its own, with the screen drawn in between (staging.tsx opens the steps in the scene;
 * sliced-geometry.ts builds the big meshes in slices of a few milliseconds each).
 *
 * A step belongs to an island (or to none: the sea between) and has a stage (STAGE: the coast first, then the animals' swimming and each
 * animal, then what grows on and round the island, then the small life of the reef). The next step is always the pending one with the lowest
 * rank: the islands in or near the view before the rest (`focus`, asked afresh at every step, so an island the camera nears moves up),
 * and within them stage by stage, so every island in view has its coast before any has its props, and its first animal before any has
 * its second. Nothing is built before the scene's first frame has been drawn: the ocean comes first.
 *
 * Pure: no React, no three.js, and the clock and timers are handed in, so the order is tested without a scene.
 */

/** The stages of an island, in the order they are built in: the coast, the animals' swimming, each animal (a stage with many steps), then what grows on and round the island, and its small life. */
export const STAGE = { coast: 1, swim: 2, animal: 3, props: 4, small: 5 } as const;

/** Islands (their keys) nearest the view first, and how many of them are in or near it. */
export type Focus = { order: readonly string[]; near: number };

/**
 * A run of steps of one kind on one island: `total` of them, `opened` so far. `open` is told each time another opens (the scene builds
 * it then: a component shows its part, or a slice of a mesh is made), and the scene says when it has (`committed`), so the next step
 * waits for it. A run whose length is not known (the slices of a mesh) says so by growing `total` as it goes.
 */
export type Group = { island: string | null; stage: number; total: number; opened: number; open: (opened: number) => void };

export type StagerOptions = {
  /** Where the camera is: the islands nearest it first. Without it, every island is as near as the rest, in the order they were met. */
  focus?: () => Focus;
  /** A step that took this long (ms) or more is followed by a drawn frame before the next. */
  heavy?: number;
  /** After a step, a scene whose last frame is older than this (ms) waits for a drawn frame before the next step. */
  age?: number;
  /** The longest (ms) to wait for a frame, or for a step to be shown, before carrying on without. */
  patience?: number;
  now?: () => number;
  /** Call `run` after `ms`; returns the way to cancel it. */
  later?: (run: () => void, ms: number) => () => void;
  /** Ask the canvas for a frame (it draws on demand while still or paused). */
  invalidate?: () => void;
  /** Hear each step as it opens and is shown (marks, tests): its island, stage, number, and how long it took (ms). */
  trace?: (step: { island: string | null; stage: number; index: number; ms: number }) => void;
};

/** What the scene hears: nothing pending in or near the view (`settled`: true too while nothing is staged at all), nothing pending anywhere once something was (`done`). */
export type StagerState = { settled: boolean; done: boolean };

export const STAGING = {
  /** A step this long (ms) is followed by a frame. */
  heavy: 30,
  /**
   * While frames keep coming this often (ms) the steps follow one another straight away, each a task short enough to leave room for them (the
   * frames are asked for 33 ms apart); once the last frame is older than this, the next step waits for one.
   */
  age: 50,
  /** The longest to wait for a frame or a shown step (ms). */
  patience: 160,
  /** A scene that has drawn no frame for this long (ms) is asked for one when a step has been shown. */
  idle: 60,
};

const wait = (run: () => void, ms: number) => {
  const timer = setTimeout(run, ms);
  return () => clearTimeout(timer);
};

export function createStager(options: StagerOptions = {}) {
  const heavy = options.heavy ?? STAGING.heavy, age = options.age ?? STAGING.age, patience = options.patience ?? STAGING.patience;
  const now = options.now ?? (() => (typeof performance === 'undefined' ? Date.now() : performance.now()));
  const later = options.later ?? wait;
  const groups = new Set<Group>();
  const listeners = new Set<() => void>();
  /** Island keys in the order they were met, for ranking when nothing says which is nearer. */
  const met: string[] = [];
  let focus = options.focus;
  let invalidate = options.invalidate;
  let state: StagerState = { settled: true, done: false };
  // Whether a frame has been drawn (the scene is on screen: only then does building go on), the frames so far and when the last began,
  // whether building is held (the scene is hidden), and whether the scene is on show (what arrives then grows in).
  let started = false, frames = 0, held = false, disposed = false, shown = true, built = false, lastFrame = -Infinity;
  // The step opened and not yet shown, and when it opened.
  let busy: { group: Group; at: number } | null = null;
  let cancelGuard: (() => void) | null = null, cancelNext: (() => void) | null = null, waitingFor = -1;

  const notify = () => {
    // (settled: in or near the view; done: everywhere)
    const live = [...groups], near = nearSet();
    const pending = (g: Group) => g.opened < g.total;
    const next: StagerState = {
      settled: !live.some((g) => pending(g) && tierOf(g.island, near) === 0) && !busy,
      done: built && !live.some(pending) && !busy,
    };
    if (next.settled === state.settled && next.done === state.done) return;
    state = next;
    listeners.forEach((listener) => listener());
  };

  /** The islands in or near the view now (null: all of them). */
  function nearSet(): Set<string> | null {
    const where = focus?.();
    return where ? new Set(where.order.slice(0, where.near)) : null;
  }
  const tierOf = (island: string | null, near: Set<string> | null) => (island === null || !near || near.has(island) ? 0 : 1);

  /** The pending step to open next: the lowest rank by (tier, stage, steps already open, nearness). */
  function pick(): Group | null {
    const where = focus?.(), near = where ? new Set(where.order.slice(0, where.near)) : null;
    const order = where ? where.order : met;
    let best: Group | null = null, bestRank: number[] = [];
    for (const g of groups) {
      if (g.opened >= g.total) continue;
      const nearness = g.island === null ? -1 : Math.max(0, order.indexOf(g.island));
      const rank = [tierOf(g.island, near), g.stage, g.opened, nearness];
      if (!best || lower(rank, bestRank)) { best = g; bestRank = rank; }
    }
    return best;
  }

  function pump() {
    cancelNext?.(); cancelNext = null;
    if (disposed || held || !started || busy) return;
    const group = pick();
    if (!group) { notify(); return; }
    busy = { group, at: now() };
    group.opened++;
    // (a step that is never shown, its scene gone, must not stop the rest)
    cancelGuard = later(() => finish(group), patience * 4);
    group.open(group.opened);
  }

  /** The step just opened has been shown (its scene committed it): the next one, after a frame if the frames have been kept waiting. */
  function finish(group: Group) {
    if (!busy || busy.group !== group) return;
    const at = now(), ms = at - busy.at;
    cancelGuard?.(); cancelGuard = null;
    options.trace?.({ island: group.island, stage: group.stage, index: group.opened - 1, ms });
    busy = null;
    // (a scene that draws every frame anyway needs no asking; a still one, or a paused one, needs one to show what was built)
    if (at - lastFrame > STAGING.idle) invalidate?.();
    if (ms >= heavy || at - lastFrame > age) {
      // Let the screen draw what is there before more is built: the next frame, or after a moment if none comes.
      waitingFor = frames;
      cancelNext = later(pump, patience);
    } else cancelNext = later(pump, 0);
    notify();
  }

  const stager = {
    setFocus(next: (() => Focus) | undefined) { focus = next; },
    setInvalidate(next: (() => void) | undefined) { invalidate = next; },
    /** Whether the scene can be seen: what arrives while it is, grows or rises in (staging.tsx); what arrives under a picture is simply there. */
    show(value: boolean) { shown = value; },
    get shown() { return shown; },
    /** A run of steps joins the order (the scene mounts something to be built in steps). Returns the way to leave it. */
    register(group: Group) {
      groups.add(group);
      if (group.island !== null && !met.includes(group.island)) met.push(group.island);
      built = true;
      if (started && !busy) cancelNext ??= later(pump, 0);
      notify();
      return () => {
        groups.delete(group);
        if (busy?.group === group) finish(group);
        notify();
      };
    },
    /** More (or fewer) steps in a run. */
    resize(group: Group, total: number) {
      if (group.total === total) return;
      group.total = total;
      if (started && !busy) cancelNext ??= later(pump, 0);
      notify();
    },
    /** The step a group opened is on screen (its scene committed it). */
    committed(group: Group) { finish(group); },
    /** A frame is about to be drawn: the first starts the building, and any later ends a wait for a frame. */
    frame() {
      frames++;
      lastFrame = now();
      if (!started) {
        started = true;
        cancelNext ??= later(pump, 0);
      } else if (cancelNext && waitingFor >= 0 && frames > waitingFor) {
        waitingFor = -1;
        cancelNext(); cancelNext = later(pump, 0);
      }
    },
    /** Hold the building (the scene is hidden: nothing is gained by building what is not seen) or let it go on. */
    hold(value: boolean) {
      held = value;
      if (!value && started && !busy) cancelNext ??= later(pump, 0);
    },
    get frames() { return frames; },
    get started() { return started; },
    getState: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    dispose() {
      disposed = true;
      cancelGuard?.(); cancelNext?.();
      listeners.clear(); groups.clear();
    },
  };
  return stager;
}
export type Stager = ReturnType<typeof createStager>;

/** Whether rank `a` comes before rank `b`. */
function lower(a: readonly number[], b: readonly number[]) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
}
