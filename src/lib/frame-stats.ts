/**
 * Frame timing for the island's on-device performance readout (EXPO_PUBLIC_ISLAND_PERF=1, set in
 * the EAS preview profile): averages over a short window, published once per window so the
 * readout changes calmly. Pure; the probe inside the canvas feeds it and a badge reads it.
 */
export interface FrameSnapshot {
  /** Frames drawn per second over the window. */
  fps: number;
  /** Frames that took longer than SLOW_FRAME_MS (a visible hitch at 60 Hz). */
  slow: number;
  /** JS time per frame, from the first frame callback until three.js has issued its draw calls (ms). */
  jsMs: number;
  jsMaxMs: number;
  /** Time spent waiting for Expo GL's queue to finish the frame, sampled about once a second (ms); null where unavailable. */
  glMs: number | null;
  draws: number;
  triangles: number;
  quality: string;
}

export const SLOW_FRAME_MS = 25;

export function createFrameStats(windowSeconds = 2) {
  let frames = 0, seconds = 0, js = 0, jsMax = 0, slow = 0, gl: number | null = null;
  let latest: FrameSnapshot | null = null;
  return {
    /** One rendered frame: seconds since the previous one, JS ms spent on it, and the renderer's counts for it. */
    frame(delta: number, jsMs: number, draws: number, triangles: number, quality: string) {
      if (!(delta > 0)) return;
      frames++; seconds += delta; js += jsMs; jsMax = Math.max(jsMax, jsMs);
      if (delta * 1000 > SLOW_FRAME_MS) slow++;
      if (seconds < windowSeconds) return;
      latest = { fps: frames / seconds, slow, jsMs: js / frames, jsMaxMs: jsMax, glMs: gl, draws, triangles, quality };
      frames = 0; seconds = 0; js = 0; jsMax = 0; slow = 0;
    },
    /** A sample of how long the GL queue took to drain after a frame. */
    gl(ms: number) { gl = ms; },
    latest: () => latest,
  };
}

/** The island's stats, shared by the probe in the canvas and the badge over it. */
export const islandFrameStats = createFrameStats();

/** Two short lines for the badge, e.g. "60 fps · 0 slow · full" / "JS 4.1 ms (max 9.0) · GL 3.2 ms · 31 draws · 12.3k tris". */
export function formatFrameSnapshot(s: FrameSnapshot): [string, string] {
  const ms = (value: number) => value.toFixed(1);
  const triangles = s.triangles >= 1000 ? `${(s.triangles / 1000).toFixed(1)}k` : String(s.triangles);
  return [
    `${Math.round(s.fps)} fps · ${s.slow} slow · ${s.quality}`,
    `JS ${ms(s.jsMs)} ms (max ${ms(s.jsMaxMs)})${s.glMs === null ? '' : ` · GL ${ms(s.glMs)} ms`} · ${s.draws} draws · ${triangles} tris`,
  ];
}
