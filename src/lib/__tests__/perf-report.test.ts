import { describe, expect, it } from '@jest/globals';
import { createPerfReport, formatReport, FRAME_WINDOW, KEPT_EPISODES, reportSections, STALL_MS, type ReportEnv } from '../perf-report';

const env = (dev: boolean): ReportEnv => ({ dev, environment: 'Expo Go', platform: 'ios', device: 'iPhone 15 Pro', os: '18.1', app: '1.0.0' });

describe('perf report', () => {
  it('keeps the first time of each milestone', () => {
    let t = 0;
    const report = createPerfReport(() => t);
    t = 120; report.mark('js-start');
    t = 900; report.mark('js-start');
    report.mark('home-frame', 1500);
    expect(report.markAt('js-start')).toBe(120);
    expect(report.markAt('home-frame')).toBe(1500);
    expect(report.markAt('fonts-ready')).toBeUndefined();
  });

  it('times the steps of an episode from its start, the first time each is reached, and keeps the latest few', () => {
    let t = 0;
    const report = createPerfReport(() => t);
    report.step('explorer', 'frame'); // nothing open: ignored
    t = 1000; report.begin('explorer', 'reef');
    t = 1040; report.step('explorer', 'frame');
    t = 1300; report.step('explorer', 'frame');
    expect(report.waiting('explorer', 'complete')).toBe(true);
    t = 2500; report.step('explorer', 'complete');
    expect(report.waiting('explorer', 'complete')).toBe(false);
    t = 2600; report.step('explorer', 'animal'); // closed: ignored
    const [episode] = report.episodes();
    expect(episode.steps).toEqual({ frame: 1040, complete: 2500 });
    for (let i = 0; i < KEPT_EPISODES + 3; i++) report.begin('switch', `s${i}`);
    report.begin('explorer', 'kelp');
    const kinds = report.episodes().map((e) => e.kind);
    expect(kinds.filter((k) => k === 'switch')).toHaveLength(KEPT_EPISODES);
    expect(kinds.filter((k) => k === 'explorer')).toHaveLength(2);
    expect(report.episodes().filter((e) => e.kind === 'switch').map((e) => e.label)).toEqual(['s3', 's4', 's5', 's6']);
  });

  it('summarises the last frames of a scene: rate, slow frames, quantiles, JS time; stalls apart', () => {
    const report = createPerfReport(() => 0);
    report.info('home', { fps: 30, quality: 'full', dpr: 2, level: 0, levelName: 'full' });
    for (let i = 0; i < 90; i++) report.frame('home', i % 10 === 0 ? 60 : 33.3, 4 + (i % 3), 40, 12000);
    report.frame('home', STALL_MS + 1, 3, 40, 12000);
    const s = report.summary('home')!;
    expect(s.frames).toBe(90);
    expect(s.slow).toBe(9); // 60 ms is over 1.5 x 33.3
    expect(s.stalls).toBe(1);
    expect(s.p50).toBeCloseTo(33.3, 1);
    expect(s.max).toBe(60);
    expect(s.jsMean).toBeCloseTo(5, 1);
    expect(s.fps).toBeGreaterThan(25);
    expect(s.draws).toBe(40);
    expect(report.sessionFrames('home')).toEqual({ total: 91, slow: 9, stalls: 1, max: 60 });
  });

  it('keeps only the last window of frames', () => {
    const report = createPerfReport(() => 0);
    for (let i = 0; i < FRAME_WINDOW; i++) report.frame('explorer', 100, 1, 1, 1);
    for (let i = 0; i < FRAME_WINDOW; i++) report.frame('explorer', 16, 1, 1, 1);
    expect(report.summary('explorer')!.max).toBe(16);
    expect(report.summary('nothing')).toBeNull();
  });

  it('says in its first line whether the JS is a development build', () => {
    const report = createPerfReport(() => 0);
    report.mark('js-start', 350);
    expect(formatReport(report, env(true)).split('\n')[0]).toMatch(/DEVELOPMENT build/);
    expect(formatReport(report, env(false)).split('\n')[0]).toMatch(/Release JS/);
  });

  it('formats every section as plain label: value lines', () => {
    const report = createPerfReport(() => 0);
    report.mark('js-start', 350.4);
    report.begin('explorer', 'reef', 1000); report.step('explorer', 'frame', 1016);
    report.frame('home', 33, 5, 10, 100);
    report.count('home: animals arrived at once');
    const text = formatReport(report, { ...env(false), startup: { startTime: 10, executeJavaScriptBundleEntryPointStart: 200 } });
    expect(text).toContain('JS start (root layout evaluated): 350');
    expect(text).toContain('Native start: 10');
    expect(text).toContain('Explorer reef: picture - · frame 16 · animal - · done -');
    expect(text).toContain('# Scene: home');
    expect(text).toContain('home: animals arrived at once: 1');
    expect(text).not.toMatch(/undefined|NaN/);
    const titles = reportSections(report, env(false)).map((s) => s.title);
    expect(titles[0]).toBe('Build');
  });
});
