import { describe, expect, it } from '@jest/globals';

import { createSyncScheduler, retryDelayMs, type Timers } from '@/lib/sync-scheduler';

/** Timers you advance by hand. */
function manualTimers() {
  let pending: { fn: () => void; ms: number } | null = null;
  const timers: Timers = {
    set: (fn, ms) => {
      pending = { fn, ms };
      return pending;
    },
    clear: (handle) => {
      if (pending === handle) pending = null;
    },
  };
  return {
    timers,
    delay: () => pending?.ms ?? null,
    fire: () => {
      const p = pending;
      pending = null;
      p?.fn();
    },
  };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('retry delays', () => {
  it('double from 5 seconds up to 5 minutes, with jitter of ±25%', () => {
    const mid = () => 0.5;
    expect([0, 1, 2, 3, 6, 20].map((n) => retryDelayMs(n, mid))).toEqual([5000, 10000, 20000, 40000, 300000, 300000]);
    expect(retryDelayMs(0, () => 0)).toBe(3750);
    expect(retryDelayMs(0, () => 1)).toBe(6250);
  });
});

describe('the sync scheduler', () => {
  it('runs one sync at a time, and once more for a change made during it', async () => {
    let runs = 0;
    let release!: () => void;
    const scheduler = createSyncScheduler(async () => {
      runs++;
      if (runs === 1) await new Promise<void>((resolve) => (release = resolve));
      return { ok: true };
    });
    const first = scheduler.request();
    await flush();
    const second = scheduler.request();
    const third = scheduler.request();
    expect(runs).toBe(1);
    release();
    await Promise.all([first, second, third]);
    expect(runs).toBe(2);
  });

  it('retries a failed sync with growing delays until it succeeds', async () => {
    const clock = manualTimers();
    const outcomes = [false, false, true];
    let runs = 0;
    const scheduler = createSyncScheduler(async () => ({ ok: outcomes[runs++] }), clock.timers, () => 0.5);
    await scheduler.request();
    expect(clock.delay()).toBe(5000);
    clock.fire();
    await flush();
    expect(clock.delay()).toBe(10000);
    clock.fire();
    await flush();
    expect(runs).toBe(3);
    expect(scheduler.retryPending()).toBe(false);
  });

  it('treats a thrown error (offline) like a failed sync, and never rejects', async () => {
    const clock = manualTimers();
    const scheduler = createSyncScheduler(async () => {
      throw new Error('TypeError: Network request failed');
    }, clock.timers);
    await expect(scheduler.request()).resolves.toBeUndefined();
    expect(scheduler.retryPending()).toBe(true);
  });

  it('coming back to the app retries at once and restarts the backoff', async () => {
    const clock = manualTimers();
    let ok = false;
    let runs = 0;
    const scheduler = createSyncScheduler(async () => {
      runs++;
      return { ok };
    }, clock.timers, () => 0.5);
    await scheduler.request();
    clock.fire();
    await flush();
    expect(clock.delay()).toBe(10000);
    ok = true;
    await scheduler.wake();
    expect(runs).toBe(3);
    expect(scheduler.retryPending()).toBe(false);
  });
});
