/**
 * Timing marks for how soon the island is on screen, each made once per launch with the User Timing API
 * (`performance.mark`, where there is one; nothing otherwise): `scubago:scene-frame`, the scene's first
 * drawn frame, `scubago:first-animal`, the first frame an animal is drawn in, and `scubago:picture`, Home's
 * picture of its island shown at launch (instant-picture.tsx). Cheap enough to leave in: a timing script
 * reads them from the web build (performance.getEntriesByName), and on a phone a debugger can.
 */
export type SceneMark = 'scubago:scene-frame' | 'scubago:first-animal' | 'scubago:picture';

const made = new Set<SceneMark>();

export function markOnce(name: SceneMark) {
  if (made.has(name)) return;
  made.add(name);
  try {
    globalThis.performance?.mark?.(name);
  } catch {
    // No User Timing here: nothing to mark.
  }
}
