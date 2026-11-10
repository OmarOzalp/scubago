import { describe, expect, it } from '@jest/globals';
import { createGovernor, GOVERNOR_LEVELS, JS_LEVELS } from '../quality-governor';

/** Feed `seconds` of frames at `fps` asked, each `ms` apart, with every `missEvery`-th frame late (0: none). */
const feed = (g: ReturnType<typeof createGovernor>, seconds: number, fps: number, ms: number, missEvery = 0, lateMs = 3 * ms) => {
  let t = 0, i = 0;
  while (t < seconds * 1000) {
    const late = missEvery > 0 && i % missEvery === 0;
    const d = late ? lateMs : ms;
    g.frame(d, fps); t += d; i++;
  }
};

describe('quality governor', () => {
  it('stays at full quality while the phone keeps up', () => {
    const g = createGovernor();
    feed(g, 60, 30, 33.4);
    expect(g.level()).toBe(0);
    expect(g.changes()).toEqual([]);
  });

  it('steps down after two bad windows in a row, not after one', () => {
    const g = createGovernor();
    feed(g, 2.05, 30, 60); // one bad window
    expect(g.level()).toBe(0);
    feed(g, 2.1, 30, 33.4); // a good one breaks the run
    feed(g, 2.1, 30, 60);
    expect(g.level()).toBe(0);
    feed(g, 2.1, 30, 60);
    expect(g.level()).toBe(1);
    expect(g.current()).toBe(GOVERNOR_LEVELS[1]);
  });

  it('goes on down while it keeps missing, and never past the last level', () => {
    const g = createGovernor();
    feed(g, 60, 30, 70);
    expect(g.level()).toBe(GOVERNOR_LEVELS.length - 1);
  });

  it('steps back up only after a long run of headroom', () => {
    const g = createGovernor();
    feed(g, 4.2, 30, 60);
    expect(g.level()).toBe(1);
    feed(g, 8, 30, 33.4);
    expect(g.level()).toBe(1);
    feed(g, 4, 30, 33.4);
    expect(g.level()).toBe(0);
  });

  it('does not flap: a step up soon undone makes the next step up wait twice as long', () => {
    const g = createGovernor();
    // A phone that misses at full quality and keeps up one level down.
    const cycle = () => { if (g.level() === 0) feed(g, 2, 30, 60); else feed(g, 2, 30, 33.4); };
    for (let i = 0; i < 120; i++) cycle(); // four minutes
    const changes = g.changes();
    // Each flap doubles the wait, so in four minutes it went up only a few times.
    expect(changes.filter((c) => c.to < c.from).length).toBeLessThanOrEqual(4);
    expect(g.upAfter()).toBeGreaterThanOrEqual(20);
  });

  it('ignores stalls and anything while held', () => {
    const g = createGovernor();
    for (let i = 0; i < 100; i++) g.frame(400, 30); // build steps, compiles
    expect(g.level()).toBe(0);
    g.hold(true);
    feed(g, 30, 30, 70);
    expect(g.level()).toBe(0);
    g.hold(false);
    feed(g, 4.2, 30, 70);
    expect(g.level()).toBe(1);
  });

  it('judges against the rate asked: 20 ms frames are fine at 30 a second and late at 60', () => {
    const at30 = createGovernor(), at60 = createGovernor();
    feed(at30, 10, 30, 26);
    feed(at60, 10, 60, 26);
    expect(at30.level()).toBe(0);
    expect(at60.level()).toBeGreaterThan(0);
  });

  it('tells listeners when the level changes', () => {
    const g = createGovernor(), seen: number[] = [];
    const stop = g.subscribe(() => seen.push(g.level()));
    feed(g, 4.2, 30, 60);
    stop();
    feed(g, 4.2, 30, 60);
    expect(seen).toEqual([1]);
  });
});

describe('quality governor: the JavaScript ladder', () => {
  /** `seconds` of frames `ms` apart whose JavaScript took `jsMs` each. */
  const feedJs = (g: ReturnType<typeof createGovernor>, seconds: number, fps: number, ms: number, jsMs: number) => {
    for (let t = 0; t < seconds * 1000; t += ms) g.frame(ms, fps, jsMs);
  };

  it('late frames whose JavaScript took most of the frame step the swimming down, not the resolution', () => {
    const g = createGovernor();
    feedJs(g, 4.2, 30, 60, 45);
    expect(g.jsLevel()).toBe(1);
    expect(g.level()).toBe(0);
    expect(g.jsCurrent().cadence).toBe(30);
    expect(g.describe()).toBe('swimming at 30 steps');
    feedJs(g, 4.2, 30, 60, 45);
    expect(g.jsCurrent().touchFps).toBe(30);
    expect(g.describe()).toBe('steady 30 fps');
  });

  it('late frames with little JavaScript are the GPU’s: the resolution steps', () => {
    const g = createGovernor();
    feedJs(g, 4.2, 30, 60, 6);
    expect(g.level()).toBe(1);
    expect(g.jsLevel()).toBe(0);
  });

  it('with its own ladder at the end, a bound frame steps the other', () => {
    const g = createGovernor();
    feedJs(g, 13, 30, 60, 45);
    expect(g.jsLevel()).toBe(JS_LEVELS.length - 1);
    expect(g.level()).toBeGreaterThan(0);
  });

  it('steps back up the latest step first, after the same long run of headroom', () => {
    const g = createGovernor();
    feedJs(g, 4.2, 30, 60, 6); // resolution down
    feedJs(g, 4.2, 30, 60, 45); // then the swimming
    expect([g.level(), g.jsLevel()]).toEqual([1, 1]);
    feedJs(g, 12, 30, 33.4, 10);
    expect([g.level(), g.jsLevel()]).toEqual([1, 0]);
    feedJs(g, 12, 30, 33.4, 10);
    expect([g.level(), g.jsLevel()]).toEqual([0, 0]);
    expect(g.changes().map((c) => c.ladder)).toEqual(['gpu', 'js', 'js', 'gpu']);
  });
});
