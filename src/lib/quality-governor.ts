/**
 * The adaptive quality governor: it watches the frame times a scene really gets on the device and steps the scene's cost down when it
 * keeps missing its rate, and back up when there has been headroom for a while. Pure: the canvas feeds it frames and reads its level
 * (three/governor.tsx). Hysteresis keeps it from flapping: a step down needs two bad windows in a row, a step up needs a long run of good
 * ones, and that run doubles each time a step up is soon followed by a step down again (so a phone that sits on the edge settles below it).
 * Long stalls (a build step, a program compile, the app coming back) are not load and are not counted, and the governor can be held (while
 * the scene builds) so it only judges the steady scene.
 */

export type GovernorLevel = {
  name: string;
  /**
   * Drawing-buffer pixels per point on a phone (2 as designed: scene-canvas.native.tsx). What a frame costs the GPU goes with the pixels: 1.5 is
   * 56% of them. The web scales its own 1.25 by the same share.
   */
  dpr: number;
};

/**
 * From the look as designed to the cheapest. A phone that keeps up never leaves the first. (Only the resolution: the JavaScript of a frame,
 * the swimming and three.js's own work for each object, does not shrink with it, and the report says which of the two a phone is short of.)
 */
export const GOVERNOR_LEVELS: readonly GovernorLevel[] = [
  { name: 'full', dpr: 2 },
  { name: 'dpr 1.75', dpr: 1.75 },
  { name: 'dpr 1.5', dpr: 1.5 },
  { name: 'dpr 1.25', dpr: 1.25 },
];

export type GovernorOptions = {
  /** Length of a judging window (ms of frames). */
  windowMs?: number;
  /** A frame is a miss when it comes this many times later than the rate asks. */
  missFactor?: number;
  /** A window is bad when more than this share of its frames miss... */
  badShare?: number;
  /** ...and good when fewer than this share do. */
  goodShare?: number;
  /** Bad windows in a row before a step down. */
  downAfter?: number;
  /** Good windows in a row before a step up (doubled after each flap, up to maxUpAfter). */
  upAfter?: number;
  maxUpAfter?: number;
  /** A step down within this long (ms of frames) after a step up is a flap. */
  flapMs?: number;
  /** Frame intervals longer than this (ms) are stalls, not load. */
  stallMs?: number;
  levels?: readonly GovernorLevel[];
  /** Start at this level (the last one a session settled at, say). */
  start?: number;
};

export type GovernorChange = { from: number; to: number; at: number; missShare: number };

export function createGovernor(options: GovernorOptions = {}) {
  const {
    windowMs = 2000, missFactor = 1.5, badShare = .2, goodShare = .03, downAfter = 2, upAfter = 5, maxUpAfter = 40, flapMs = 20000, stallMs = 250,
    levels = GOVERNOR_LEVELS,
  } = options;
  let level = Math.max(0, Math.min(levels.length - 1, options.start ?? 0));
  let elapsed = 0, frames = 0, misses = 0, bad = 0, good = 0, needUp = upAfter, clock = 0, lastUp = -Infinity, held = false;
  const changes: GovernorChange[] = [];
  const listeners = new Set<(level: number) => void>();
  const set = (to: number, missShare: number) => {
    changes.push({ from: level, to, at: clock, missShare });
    if (changes.length > 20) changes.shift();
    level = to; bad = 0; good = 0;
    listeners.forEach((listener) => listener(level));
  };
  return {
    /** One frame: ms since the previous one, and the rate the scene asks for (a second). */
    frame(intervalMs: number, fps: number) {
      if (!(intervalMs > 0) || intervalMs > stallMs) return;
      clock += intervalMs;
      if (held) return;
      elapsed += intervalMs; frames++;
      if (intervalMs > missFactor * 1000 / fps) misses++;
      if (elapsed < windowMs) return;
      const share = misses / frames;
      elapsed = 0; frames = 0; misses = 0;
      if (share > badShare) { bad++; good = 0; } else if (share < goodShare) { good++; bad = 0; } else { bad = 0; good = 0; }
      if (bad >= downAfter && level < levels.length - 1) {
        // Down soon after going up: that step up was one too many, so wait longer before the next.
        if (clock - lastUp < flapMs) needUp = Math.min(maxUpAfter, needUp * 2);
        set(level + 1, share);
      } else if (good >= needUp && level > 0) {
        lastUp = clock;
        set(level - 1, share);
      }
    },
    /** Hold judging (the scene is building, hidden or still): what was counted of the window is dropped. */
    hold(on: boolean) {
      if (on === held) return;
      held = on; elapsed = 0; frames = 0; misses = 0; bad = 0; good = 0;
    },
    level: () => level,
    current: () => levels[level],
    /** Good windows in a row it now takes to step up. */
    upAfter: () => needUp,
    changes: () => changes.slice(),
    subscribe(listener: (level: number) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}

export type Governor = ReturnType<typeof createGovernor>;
