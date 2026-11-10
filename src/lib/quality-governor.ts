/**
 * The adaptive quality governor: it watches the frame times a scene really gets on the device and steps the scene's cost down when it
 * keeps missing its rate, and back up when there has been headroom for a while. Pure: the canvas feeds it frames and reads its levels
 * (three/governor.tsx). Hysteresis keeps it from flapping: a step down needs two bad windows in a row, a step up needs a long run of good
 * ones, and that run doubles each time a step up is soon followed by a step down again (so a phone that sits on the edge settles below it).
 * Long stalls (a build step, a program compile, the app coming back) are not load and are not counted, and the governor can be held (while
 * the scene builds) so it only judges the steady scene.
 *
 * Two ladders. A late frame whose JavaScript took most of the time the rate allows is the JavaScript's: fewer pixels would not help, so
 * the JS ladder steps (the swimming at half the steps a second, then a steady 30 frames a second under a finger). Otherwise it is the GPU's,
 * and the resolution steps. A step up undoes the latest step down first.
 */

export type GovernorLevel = {
  name: string;
  /**
   * Drawing-buffer pixels per point on a phone (2 as designed: scene-canvas.native.tsx). What a frame costs the GPU goes with the pixels: 1.5 is
   * 56% of them. The web scales its own 1.25 by the same share.
   */
  dpr: number;
};

/** The resolution ladder, from the look as designed to the cheapest. A phone that keeps up never leaves the first. */
export const GOVERNOR_LEVELS: readonly GovernorLevel[] = [
  { name: 'full', dpr: 2 },
  { name: 'dpr 1.75', dpr: 1.75 },
  { name: 'dpr 1.5', dpr: 1.5 },
  { name: 'dpr 1.25', dpr: 1.25 },
];

/**
 * The JavaScript ladder. `cadence`: the swimming's steps a second (marine-motion.ts `setCadence`; what is drawn is interpolated, and
 * `SWIM_CADENCE=30 npm run verify:swim` finds 0 clipped, on land or grazing). `touchFps`: how often the explorer draws under a finger or a
 * glide (an even 30 looks smoother than a rate that wobbles in the 40s).
 */
export type JsLevel = { name: string; cadence: number; touchFps: number };
export const JS_LEVELS: readonly JsLevel[] = [
  { name: 'as designed', cadence: 60, touchFps: 60 },
  { name: 'swimming at 30 steps', cadence: 30, touchFps: 60 },
  { name: 'steady 30 fps', cadence: 30, touchFps: 30 },
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
  /** A bad window is the JavaScript's when its frames' mean JS time is over this share of the frame time the rate allows. */
  jsShare?: number;
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
  jsLevels?: readonly JsLevel[];
  /** Start the resolution ladder at this level. */
  start?: number;
};

export type Ladder = 'gpu' | 'js';
export type GovernorChange = { ladder: Ladder; from: number; to: number; at: number; missShare: number; jsMs: number };

export function createGovernor(options: GovernorOptions = {}) {
  const {
    windowMs = 2000, missFactor = 1.5, badShare = .2, goodShare = .03, jsShare = .6, downAfter = 2, upAfter = 5, maxUpAfter = 40, flapMs = 20000, stallMs = 250,
    levels = GOVERNOR_LEVELS, jsLevels = JS_LEVELS,
  } = options;
  const at: Record<Ladder, number> = { gpu: Math.max(0, Math.min(levels.length - 1, options.start ?? 0)), js: 0 };
  const top: Record<Ladder, number> = { gpu: levels.length - 1, js: jsLevels.length - 1 };
  let elapsed = 0, frames = 0, misses = 0, js = 0, bad = 0, badJs = 0, good = 0, needUp = upAfter, clock = 0, lastUp = -Infinity, held = false;
  /** The ladders stepped down, the latest last: a step up undoes the latest first. */
  const lowered: Ladder[] = [];
  const changes: GovernorChange[] = [];
  const listeners = new Set<() => void>();
  const set = (ladder: Ladder, to: number, missShare: number, jsMs: number) => {
    changes.push({ ladder, from: at[ladder], to, at: clock, missShare, jsMs });
    if (changes.length > 20) changes.shift();
    at[ladder] = to; bad = 0; badJs = 0; good = 0;
    listeners.forEach((listener) => listener());
  };
  return {
    /** One frame: ms since the previous one, the rate the scene asks for (a second), and the JS ms the frame took (0: unknown, the GPU's). */
    frame(intervalMs: number, fps: number, jsMs = 0) {
      if (!(intervalMs > 0) || intervalMs > stallMs) return;
      clock += intervalMs;
      if (held) return;
      elapsed += intervalMs; frames++; js += jsMs;
      if (intervalMs > missFactor * 1000 / fps) misses++;
      if (elapsed < windowMs) return;
      const share = misses / frames, jsMean = js / frames;
      elapsed = 0; frames = 0; misses = 0; js = 0;
      if (share > badShare) { bad++; if (jsMean > jsShare * 1000 / fps) badJs++; good = 0; }
      else if (share < goodShare) { good++; bad = 0; badJs = 0; }
      else { bad = 0; badJs = 0; good = 0; }
      if (bad >= downAfter) {
        // Mostly the JavaScript's: its ladder while it has a step left; otherwise the resolution's (and the other when one is at its end).
        const wanted: Ladder = badJs * 2 >= bad ? 'js' : 'gpu', other: Ladder = wanted === 'js' ? 'gpu' : 'js';
        const ladder = at[wanted] < top[wanted] ? wanted : at[other] < top[other] ? other : null;
        if (!ladder) { bad = 0; badJs = 0; return; }
        // Down soon after going up: that step up was one too many, so wait longer before the next.
        if (clock - lastUp < flapMs) needUp = Math.min(maxUpAfter, needUp * 2);
        lowered.push(ladder);
        set(ladder, at[ladder] + 1, share, jsMean);
      } else if (good >= needUp && lowered.length) {
        lastUp = clock;
        const ladder = lowered.pop()!;
        set(ladder, at[ladder] - 1, share, jsMean);
      }
    },
    /** Hold judging (the scene is building, hidden or still): what was counted of the window is dropped. */
    hold(on: boolean) {
      if (on === held) return;
      held = on; elapsed = 0; frames = 0; misses = 0; js = 0; bad = 0; badJs = 0; good = 0;
    },
    /** The resolution ladder's level and step. */
    level: () => at.gpu,
    current: () => levels[at.gpu],
    /** The JavaScript ladder's. */
    jsLevel: () => at.js,
    jsCurrent: () => jsLevels[at.js],
    /** Both, for the report: "full", or e.g. "dpr 1.5, swimming at 30 steps". */
    describe: () => [at.gpu ? levels[at.gpu].name : '', at.js ? jsLevels[at.js].name : ''].filter(Boolean).join(', ') || 'full',
    /** Good windows in a row it now takes to step up. */
    upAfter: () => needUp,
    changes: () => changes.slice(),
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}

export type Governor = ReturnType<typeof createGovernor>;
