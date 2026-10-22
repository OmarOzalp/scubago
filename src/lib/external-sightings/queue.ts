import { abortError, BackoffError, ParseError, TimeoutError } from '@/lib/external-sightings/errors';
import { hostOf, platformFetch, retryAfterMs, type FetchImpl } from '@/lib/external-sightings/http';

/**
 * Minimum gap between the starts of two requests to a host. iNaturalist asks for about one request
 * a second (100 a minute at most, under 10,000 a day), so it gets 1.1 s. OBIS publishes no figure;
 * half a second is our own courtesy.
 */
export const HOST_INTERVAL_MS: Readonly<Record<string, number>> = {
  'api.inaturalist.org': 1100,
  'api.obis.org': 500,
};

export const DEFAULT_INTERVAL_MS = 1000;
/** A request that has not answered after this long is given up on. */
export const REQUEST_TIMEOUT_MS = 20_000;
/** What to wait after a 429 that did not say how long. */
const DEFAULT_RATE_LIMIT_BACKOFF_MS = 60_000;

export function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export interface QueueOptions {
  /** Minimum ms between request starts, per host. */
  intervalMs?: Readonly<Record<string, number>>;
  defaultIntervalMs?: number;
  /** A back-off longer than this fails the request at once instead of making the diver wait. */
  maxBackoffWaitMs?: number;
  /** The clock and the wait, injectable so tests need no real time. */
  now?: () => number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

interface HostState {
  /** Settles when the last queued request has finished; never rejects. */
  tail: Promise<unknown>;
  lastStart: number | null;
  blockedUntil: number;
}

const noop = () => undefined;

/**
 * Runs requests one at a time per host, at least `intervalMs` apart. Different hosts run side by
 * side. A request that is aborted while it waits leaves the queue without using up a slot.
 */
export class HostQueue {
  private readonly hosts = new Map<string, HostState>();
  private readonly intervalMs: Readonly<Record<string, number>>;
  private readonly defaultIntervalMs: number;
  private readonly maxBackoffWaitMs: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>;

  constructor(options: QueueOptions = {}) {
    this.intervalMs = options.intervalMs ?? HOST_INTERVAL_MS;
    this.defaultIntervalMs = options.defaultIntervalMs ?? DEFAULT_INTERVAL_MS;
    this.maxBackoffWaitMs = options.maxBackoffWaitMs ?? 15_000;
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? defaultSleep;
  }

  private state(host: string): HostState {
    let state = this.hosts.get(host);
    if (!state) {
      state = { tail: Promise.resolve(), lastStart: null, blockedUntil: 0 };
      this.hosts.set(host, state);
    }
    return state;
  }

  /** Queue `task` behind the host's earlier requests. */
  schedule<T>(host: string, task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    const state = this.state(host);
    const interval = this.intervalMs[host] ?? this.defaultIntervalMs;
    const run = async (): Promise<T> => {
      if (signal?.aborted) throw abortError();
      const blockedFor = state.blockedUntil - this.now();
      if (blockedFor > this.maxBackoffWaitMs) throw new BackoffError(blockedFor);
      const spacing = state.lastStart === null ? 0 : state.lastStart + interval - this.now();
      const wait = Math.max(spacing, blockedFor, 0);
      if (wait > 0) await this.sleep(wait, signal);
      if (signal?.aborted) throw abortError();
      state.lastStart = this.now();
      return task();
    };
    const result = state.tail.then(run);
    state.tail = result.then(noop, noop);
    return result;
  }

  /** The host said to slow down: hold its next requests back for `ms`. */
  penalize(host: string, ms: number): void {
    const state = this.state(host);
    state.blockedUntil = Math.max(state.blockedUntil, this.now() + ms);
  }
}

/**
 * A fetch that goes through the queue, with a timeout. The body is read inside the queue slot so
 * "one request at a time per host" holds until the answer is fully in. A 429 holds the host back.
 */
export function createQueuedFetch(
  queue: HostQueue,
  fetchImpl: FetchImpl = platformFetch,
  timeoutMs = REQUEST_TIMEOUT_MS,
  extraHeaders?: Readonly<Record<string, string>>,
): FetchImpl {
  return (url, init) => {
    const host = hostOf(url);
    const outer = init?.signal;
    return queue.schedule(host, async () => {
      const controller = new AbortController();
      const onAbort = () => controller.abort();
      outer?.addEventListener('abort', onAbort, { once: true });
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);
      try {
        const headers = extraHeaders ? { ...extraHeaders, ...init?.headers } : init?.headers;
        const response = await fetchImpl(url, { ...init, headers, signal: controller.signal });
        if (response.status === 429) queue.penalize(host, retryAfterMs(response) ?? DEFAULT_RATE_LIMIT_BACKOFF_MS);
        let body: unknown;
        let bodyFailed = false;
        if (response.ok) {
          try {
            body = await response.json();
          } catch (error) {
            if (outer?.aborted || timedOut) throw error;
            bodyFailed = true;
          }
        }
        return {
          ok: response.ok,
          status: response.status,
          headers: response.headers,
          json: async () => {
            if (bodyFailed) throw new ParseError('The response was not JSON');
            return body;
          },
        };
      } catch (error) {
        if (timedOut && !outer?.aborted) throw new TimeoutError();
        throw error;
      } finally {
        clearTimeout(timer);
        outer?.removeEventListener('abort', onAbort);
      }
    }, outer);
  };
}

interface InFlightEntry<T> {
  promise: Promise<T>;
  controller: AbortController;
  waiters: number;
}

/**
 * Shares one running job between callers with the same key, so two screens asking for the same site
 * cause one set of requests. The job is aborted only when every caller has given up on it; a
 * caller that aborts gets an AbortError while the others carry on.
 */
export class InFlight<T> {
  private readonly jobs = new Map<string, InFlightEntry<T>>();

  run(key: string, start: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
    let entry = this.jobs.get(key);
    if (!entry) {
      const controller = new AbortController();
      const created: InFlightEntry<T> = {
        controller,
        waiters: 0,
        promise: Promise.resolve().then(() => start(controller.signal)).finally(() => {
          if (this.jobs.get(key) === created) this.jobs.delete(key);
        }),
      };
      // Callers handle the result; this only stops "unhandled rejection" for a job nobody awaits any more.
      created.promise.catch(noop);
      this.jobs.set(key, created);
      entry = created;
    }
    const job = entry;
    job.waiters += 1;
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const leave = () => {
        signal?.removeEventListener('abort', onAbort);
      };
      const onAbort = () => {
        if (settled) return;
        settled = true;
        leave();
        job.waiters -= 1;
        if (job.waiters === 0) {
          if (this.jobs.get(key) === job) this.jobs.delete(key);
          job.controller.abort();
        }
        reject(abortError());
      };
      if (signal?.aborted) {
        onAbort();
        return;
      }
      signal?.addEventListener('abort', onAbort, { once: true });
      job.promise.then(
        (value) => {
          if (settled) return;
          settled = true;
          leave();
          resolve(value);
        },
        (error) => {
          if (settled) return;
          settled = true;
          leave();
          reject(error);
        },
      );
    });
  }
}
