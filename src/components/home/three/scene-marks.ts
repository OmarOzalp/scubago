import { createContext } from 'react';

/**
 * Timing marks for how soon the island is on screen, each made once per launch with the User Timing API
 * (`performance.mark`, where there is one; nothing otherwise): `scubago:scene-frame`, the scene's first
 * drawn frame, `scubago:first-animal`, the first frame an animal is drawn in, and `scubago:picture`, Home's
 * picture of its island shown at launch (instant-picture.tsx), and `scubago:scene-built`, the first moment
 * nothing more is left to build (stager.ts). The island explorer makes its own: `scubago:explorer-frame`,
 * `scubago:explorer-animal`, `scubago:explorer-built` and `scubago:explorer-picture` (the kept picture of its opening
 * view). Cheap enough to leave in: a timing script reads them from the web build
 * (performance.getEntriesByName), and on a phone a debugger can.
 */
export type SceneMark =
  | 'scubago:scene-frame' | 'scubago:first-animal' | 'scubago:picture' | 'scubago:scene-built'
  | 'scubago:explorer-frame' | 'scubago:explorer-animal' | 'scubago:explorer-built' | 'scubago:explorer-picture';

const made = new Set<SceneMark>();
const waiting = new Map<SceneMark, (() => void)[]>();

export function markOnce(name: SceneMark) {
  if (made.has(name)) return;
  made.add(name);
  try {
    globalThis.performance?.mark?.(name);
  } catch {
    // No User Timing here: nothing to mark.
  }
  for (const resume of waiting.get(name) ?? []) resume();
  waiting.delete(name);
}

/** Resolves once the mark has been made this launch (at once, if it has): for what should wait until the island is on show (ocean-ahead.ts). */
export function whenMarked(name: SceneMark): Promise<void> {
  if (made.has(name)) return Promise.resolve();
  return new Promise((resolve) => { waiting.set(name, [...(waiting.get(name) ?? []), resolve]); });
}

/** The marks a scene makes for its first drawn frame, its first animal and its being built: Home's card, or the explorer's. */
export type SceneMarks = { frame: SceneMark; animal: SceneMark; built: SceneMark };
export const HOME_MARKS: SceneMarks = { frame: 'scubago:scene-frame', animal: 'scubago:first-animal', built: 'scubago:scene-built' };
export const EXPLORER_MARKS: SceneMarks = { frame: 'scubago:explorer-frame', animal: 'scubago:explorer-animal', built: 'scubago:explorer-built' };
export const SceneMarksContext = createContext<SceneMarks>(HOME_MARKS);

/** A step of the scene's building shown (stager.ts), as a measure on the User Timing timeline: `scubago:step <island> <stage>.<n>`, `ms` long, ending now. */
export function markStep({ island, stage, index, ms }: { island: string | null; stage: number; index: number; ms: number }) {
  try {
    const end = globalThis.performance.now();
    globalThis.performance.measure(`scubago:step ${island ?? '-'} ${stage}.${index}`, { start: end - ms, end });
  } catch {
    // No User Timing here: nothing to measure.
  }
}
