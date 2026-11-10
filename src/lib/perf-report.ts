/**
 * The performance report (src/app/perf.tsx): what the phone itself measured this session, as plain numbers the owner can copy and send.
 * Pure: it keeps marks, episodes (an explorer open, an island switch, each timed from its start), rolling frame statistics for each scene and
 * a few counters, and formats them as one compact text block. It costs nothing when nobody reads it: a mark is a number put in a map, a frame
 * is a number written into a ring buffer, and nothing is worked out until the report is asked for.
 *
 * Times are ms on the clock the report is given (performance.now(): on a phone, since the app's process started; on the web, since the page).
 */

/** Milestones of a launch, each kept the first time it happens (in this order in the report). */
export const MILESTONES = [
  ['js-start', 'JS start (root layout evaluated)'],
  ['fonts-ready', 'Fonts ready'],
  ['store-ready', 'Collection read (store ready)'],
  ['home-picture', 'Home: kept picture shown'],
  ['home-frame', 'Home: scene first frame'],
  ['home-first-animal', 'Home: first animal drawn'],
  ['home-animals', 'Home: all its animals present'],
  ['home-built', 'Home: scene fully built'],
  ['explorer-frame', 'Explorer: first frame (first open)'],
  ['explorer-built', 'Explorer: fully built (first open)'],
] as const;
export type Milestone = (typeof MILESTONES)[number][0];

/** Something timed from its own start, and its steps (the first time each is reached): an explorer open, an island switch on Home. */
export type EpisodeKind = 'explorer' | 'switch';
export type EpisodeStep = 'picture' | 'frame' | 'animal' | 'complete';
export type Episode = { kind: EpisodeKind; label: string; start: number; steps: Partial<Record<EpisodeStep, number>> };
/** The episodes kept of each kind (the latest). */
export const KEPT_EPISODES = 4;

/** What a scene's frames are measured against: its target rate, quality tier, resolution and the governor's level. */
export type SceneInfo = { fps: number; quality: string; dpr: number; level: number; levelName: string };
/** Frames kept for the rolling statistics: about 8 s at 30 a second. */
export const FRAME_WINDOW = 240;
/** A frame interval longer than this (ms) is a stall (a build step, a program compile, the app in the background), counted apart. */
export const STALL_MS = 250;

export type FrameSummary = {
  frames: number; seconds: number; fps: number; slow: number; stalls: number;
  p50: number; p95: number; max: number; jsMean: number; jsP95: number; draws: number; triangles: number;
};

type SceneFrames = {
  interval: Float32Array; js: Float32Array; count: number; next: number;
  /** Over the whole session, not just the window. */
  total: number; totalSlow: number; totalStalls: number; maxInterval: number;
  draws: number; triangles: number; info: SceneInfo | null;
};

export type ReportEnv = {
  dev: boolean; environment: string; platform: string; device: string; os: string; app: string;
  /** React Native's own startup timing (performance.rnStartupTiming), on the same clock, where there is one. */
  startup?: { startTime?: number | null; initializeRuntimeStart?: number | null; executeJavaScriptBundleEntryPointStart?: number | null; endTime?: number | null } | null;
  screen?: string;
};

const quantile = (values: number[], q: number) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
};

export function createPerfReport(now: () => number = () => globalThis.performance?.now?.() ?? Date.now()) {
  const marks = new Map<Milestone, number>();
  const episodes: Episode[] = [];
  const open = new Map<EpisodeKind, Episode>();
  const scenes = new Map<string, SceneFrames>();
  const counters = new Map<string, number>();

  const scene = (name: string) => {
    let s = scenes.get(name);
    if (!s) {
      s = { interval: new Float32Array(FRAME_WINDOW), js: new Float32Array(FRAME_WINDOW), count: 0, next: 0, total: 0, totalSlow: 0, totalStalls: 0, maxInterval: 0, draws: 0, triangles: 0, info: null };
      scenes.set(name, s);
    }
    return s;
  };

  return {
    /** A milestone, kept the first time (later ones are ignored). */
    mark(name: Milestone, at = now()) {
      if (!marks.has(name)) marks.set(name, at);
    },
    markAt: (name: Milestone) => marks.get(name),
    /** An episode starts (the latest of its kind is the one steps go to). */
    begin(kind: EpisodeKind, label: string, at = now()) {
      const episode: Episode = { kind, label, start: at, steps: {} };
      open.set(kind, episode);
      episodes.push(episode);
      const same = episodes.filter((e) => e.kind === kind);
      if (same.length > KEPT_EPISODES) episodes.splice(episodes.indexOf(same[0]), 1);
    },
    /** A step of the open episode of `kind`, the first time it is reached; nothing if none is open. */
    step(kind: EpisodeKind, step: EpisodeStep, at = now()) {
      const episode = open.get(kind);
      if (!episode || episode.steps[step] !== undefined) return;
      episode.steps[step] = at;
      if (step === 'complete') open.delete(kind);
    },
    /** Whether an episode of `kind` is waiting for `step`. */
    waiting: (kind: EpisodeKind, step: EpisodeStep) => { const e = open.get(kind); return !!e && e.steps[step] === undefined; },
    episodes: () => episodes.slice(),
    /** One drawn frame of `name`: ms since its previous frame and JS ms spent on it, and the renderer's counts. */
    frame(name: string, intervalMs: number, jsMs: number, draws: number, triangles: number) {
      if (!(intervalMs > 0)) return;
      const s = scene(name);
      s.total++;
      if (intervalMs > STALL_MS) { s.totalStalls++; return; }
      s.interval[s.next] = intervalMs; s.js[s.next] = jsMs;
      s.next = (s.next + 1) % FRAME_WINDOW; s.count = Math.min(FRAME_WINDOW, s.count + 1);
      const fps = s.info?.fps ?? 60;
      if (intervalMs > 1500 / fps) s.totalSlow++;
      s.maxInterval = Math.max(s.maxInterval, intervalMs);
      s.draws = draws; s.triangles = triangles;
    },
    info(name: string, info: SceneInfo) { scene(name).info = info; },
    sceneInfo: (name: string) => scenes.get(name)?.info ?? null,
    /** The rolling statistics of `name` over its last FRAME_WINDOW frames (null before any). */
    summary(name: string): FrameSummary | null {
      const s = scenes.get(name);
      if (!s || s.count === 0) return null;
      const intervals = Array.from(s.interval.subarray(0, s.count)), js = Array.from(s.js.subarray(0, s.count));
      const seconds = intervals.reduce((a, b) => a + b, 0) / 1000, fps = s.info?.fps ?? 60;
      return {
        frames: s.count, seconds, fps: s.count / Math.max(seconds, 1e-3), slow: intervals.filter((v) => v > 1500 / fps).length, stalls: s.totalStalls,
        p50: quantile(intervals, .5), p95: quantile(intervals, .95), max: Math.max(...intervals),
        jsMean: js.reduce((a, b) => a + b, 0) / js.length, jsP95: quantile(js, .95), draws: s.draws, triangles: s.triangles,
      };
    },
    sessionFrames: (name: string) => { const s = scenes.get(name); return s ? { total: s.total, slow: s.totalSlow, stalls: s.totalStalls, max: s.maxInterval } : null; },
    sceneNames: () => [...scenes.keys()],
    count(key: string, by = 1) { counters.set(key, (counters.get(key) ?? 0) + by); },
    counter: (key: string) => counters.get(key) ?? 0,
    counters: () => new Map(counters),
    /** For tests. */
    reset() { marks.clear(); episodes.length = 0; open.clear(); scenes.clear(); counters.clear(); },
  };
}

export type PerfReport = ReturnType<typeof createPerfReport>;

/** The app's one report. */
export const perfReport = createPerfReport();
export const perfMark = (name: Milestone) => perfReport.mark(name);

const ms = (v: number | undefined | null) => (v === undefined || v === null || !Number.isFinite(v) ? '-' : `${Math.round(v)}`);
const one = (v: number) => v.toFixed(1);

/** The first line: how the JS was built, which alone can explain slowness (a development build runs unminified with React's checks). */
export function buildLine(env: ReportEnv) {
  return env.dev
    ? 'DEVELOPMENT build (__DEV__ on: unminified JS, React dev checks; much slower than release; start Expo with --no-dev --minify to measure)'
    : 'Release JS (__DEV__ off)';
}

/** Rows for the screen: [label, value] in sections. */
export function reportSections(report: PerfReport, env: ReportEnv): { title: string; rows: [string, string][] }[] {
  const sections: { title: string; rows: [string, string][] }[] = [];
  sections.push({ title: 'Build', rows: [
    ['JS', env.dev ? 'development (__DEV__)' : 'release'],
    ['Runs in', env.environment], ['Device', env.device], ['System', `${env.platform} ${env.os}`], ['App', env.app],
    ...(env.screen ? [['Screen', env.screen] as [string, string]] : []),
  ] });
  const start = env.startup ?? null;
  const launch: [string, string][] = [];
  if (start?.startTime) {
    launch.push(['Native start', ms(start.startTime)]);
    if (start.executeJavaScriptBundleEntryPointStart) launch.push(['JS bundle starts', ms(start.executeJavaScriptBundleEntryPointStart)]);
  }
  for (const [key, label] of MILESTONES) launch.push([label, ms(report.markAt(key))]);
  sections.push({ title: 'Launch (ms on the app clock)', rows: launch });
  const episodes = report.episodes();
  if (episodes.length) {
    sections.push({ title: 'Opens and switches (ms after each starts)', rows: episodes.map((e) => {
      const s = e.steps, at = (k: EpisodeStep) => (s[k] === undefined ? '-' : ms(s[k]! - e.start));
      return [`${e.kind === 'explorer' ? 'Explorer' : 'Switch'} ${e.label}`, `picture ${at('picture')} · frame ${at('frame')} · animal ${at('animal')} · done ${at('complete')}`];
    }) });
  }
  for (const name of report.sceneNames()) {
    const sum = report.summary(name), session = report.sessionFrames(name), info = report.sceneInfo(name);
    const rows: [string, string][] = [];
    if (info) rows.push(['Target', `${info.fps} fps · ${info.quality} · DPR ${info.dpr} · governor ${info.levelName}`]);
    if (sum) {
      rows.push(['Last frames', `${sum.frames} in ${one(sum.seconds)} s · ${one(sum.fps)} fps · ${sum.slow} slow`]);
      rows.push(['Frame time', `p50 ${one(sum.p50)} · p95 ${one(sum.p95)} · max ${one(sum.max)} ms`]);
      rows.push(['JS per frame', `mean ${one(sum.jsMean)} · p95 ${one(sum.jsP95)} ms`]);
      rows.push(['Drawn', `${sum.draws} draw calls · ${sum.triangles} triangles`]);
    }
    if (session) rows.push(['Session', `${session.total} frames · ${session.slow} slow · ${session.stalls} stalls over ${STALL_MS} ms`]);
    sections.push({ title: `Scene: ${name}`, rows });
  }
  const counters = [...report.counters()].sort(([a], [b]) => a.localeCompare(b));
  if (counters.length) sections.push({ title: 'Counts', rows: counters.map(([k, v]) => [k, String(v)]) });
  return sections;
}

/** The whole report as one compact text block to paste: the build line first. */
export function formatReport(report: PerfReport, env: ReportEnv) {
  const lines = [`ScubaGo performance report. ${buildLine(env)}`];
  for (const section of reportSections(report, env)) {
    lines.push(`# ${section.title}`);
    for (const [label, value] of section.rows) lines.push(`${label}: ${value}`);
  }
  return lines.join('\n');
}
