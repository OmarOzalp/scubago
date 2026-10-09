const FIRST_RETRY_MS = 5_000;
const MAX_RETRY_MS = 5 * 60_000;

/**
 * How long to wait before retry number `attempt` (0-based): 5 s, 10 s, 20 s … capped at 5 minutes,
 * with ±25% jitter so a crowd of devices coming back online doesn't retry in step.
 */
export function retryDelayMs(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(MAX_RETRY_MS, FIRST_RETRY_MS * 2 ** Math.max(0, attempt));
  return Math.round(base * (0.75 + random() * 0.5));
}

export interface SyncScheduler {
  /**
   * Sync now, or straight after the run in progress (so a change made mid-sync isn't missed).
   * Resolves once a run that started after this call has finished. Never rejects.
   */
  request: () => Promise<void>;
  /** The app is back in the foreground (or back online): retry at once, with a fresh backoff. */
  wake: () => Promise<void>;
  /** Pending retry scheduled? (for tests and diagnostics) */
  retryPending: () => boolean;
  dispose: () => void;
}

export interface Timers {
  set: (fn: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
}

const realTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * Runs `run` one at a time. A run that throws or reports `ok: false` (something stayed queued) is
 * retried with exponential backoff until one succeeds; the queue itself lives in SQLite, so nothing
 * is lost if the app closes in between.
 */
export function createSyncScheduler(
  run: () => Promise<{ ok: boolean }>,
  timers: Timers = realTimers,
  random: () => number = Math.random,
): SyncScheduler {
  let running: Promise<void> | null = null;
  let again = false;
  let attempt = 0;
  let timer: unknown = null;
  let disposed = false;

  const clearRetry = () => {
    if (timer !== null) timers.clear(timer);
    timer = null;
  };

  const scheduleRetry = () => {
    if (disposed) return;
    clearRetry();
    timer = timers.set(() => {
      timer = null;
      void request();
    }, retryDelayMs(attempt++, random));
  };

  const request = (): Promise<void> => {
    if (disposed) return Promise.resolve();
    if (running) {
      again = true;
      return running;
    }
    clearRetry();
    running = (async () => {
      let ok = true;
      do {
        again = false;
        try {
          ok = (await run()).ok;
        } catch (e) {
          console.warn('sync failed; will retry', e);
          ok = false;
        }
      } while (again && !disposed);
      if (ok) attempt = 0;
      else scheduleRetry();
    })().finally(() => {
      running = null;
    });
    return running;
  };

  return {
    request,
    wake: () => {
      attempt = 0;
      return request();
    },
    retryPending: () => timer !== null,
    dispose: () => {
      disposed = true;
      clearRetry();
    },
  };
}
