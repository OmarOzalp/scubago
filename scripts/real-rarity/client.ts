/**
 * A polite HTTP client for the real-rarity script (docs/real-rarity.md): one request at a time,
 * at least 1.1 s between the starts of any two (iNaturalist asks for about one a second, and the
 * same gap is kept for OBIS), a User-Agent that names ScubaGo, and retries with back-off on 429,
 * 5xx, timeouts and dropped connections.
 *
 * It reuses the request queue and the errors of src/lib/external-sightings, with all hosts in one
 * lane so the gap holds across hosts too. Relative imports on purpose (run from the repository root).
 */
import { HttpError, ParseError, TimeoutError } from '../../src/lib/external-sightings/errors';
import { platformFetch, retryAfterMs, type FetchImpl } from '../../src/lib/external-sightings/http';
import { defaultSleep, HostQueue } from '../../src/lib/external-sightings/queue';

export const REPO_URL = 'https://github.com/OmarOzalp/scubago';
export const USER_AGENT = `ScubaGo-real-rarity/1.0 (+${REPO_URL}; build-time species record counts from iNaturalist and OBIS, one request at a time)`;

/** Minimum gap between the starts of two requests, to any host. */
export const REQUEST_INTERVAL_MS = 1100;
/** Tries for one request, the first included. */
export const MAX_ATTEMPTS = 5;
/** A request that has not answered after this long is given up on (and tried again). */
export const REQUEST_TIMEOUT_MS = 30_000;
/** The back-off before the second try; it doubles each time. */
export const BACKOFF_BASE_MS = 5000;
/** The longest wait for a Retry-After. A server asking for more than this is not waited out. */
export const MAX_RETRY_AFTER_MS = 10 * 60_000;

const LANE = 'all-hosts';

export interface ClientOptions {
  fetchImpl?: FetchImpl;
  /** An email or URL where the owner can be reached, added to the User-Agent. */
  contact?: string;
  intervalMs?: number;
  timeoutMs?: number;
  backoffBaseMs?: number;
  /** The clock and the wait, injectable so tests need no real time. */
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Told about each retry. */
  onRetry?: (message: string) => void;
}

export interface PoliteClient {
  /** GET a URL and parse the JSON, retrying where it makes sense. Throws HttpError for a status that is not worth retrying (or after the last try). */
  getJson(url: string): Promise<unknown>;
  /** Requests started so far, retries included. */
  requests(): number;
}

/** True for a failure that may pass: rate limit, server error, timeout, or no connection (fetch throws a TypeError). */
export function isTransient(error: unknown): boolean {
  if (error instanceof HttpError) return error.status === 429 || error.status >= 500;
  return error instanceof TimeoutError || error instanceof TypeError;
}

export function createPoliteClient(options: ClientOptions = {}): PoliteClient {
  const fetchImpl = options.fetchImpl ?? platformFetch;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms: number) => defaultSleep(ms));
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const backoffBaseMs = options.backoffBaseMs ?? BACKOFF_BASE_MS;
  const userAgent = options.contact ? `${USER_AGENT} ${options.contact}` : USER_AGENT;
  const queue = new HostQueue({
    intervalMs: { [LANE]: options.intervalMs ?? REQUEST_INTERVAL_MS },
    maxBackoffWaitMs: MAX_RETRY_AFTER_MS,
    now,
    sleep,
  });
  let started = 0;

  const attemptOnce = (url: string): Promise<unknown> =>
    queue.schedule(LANE, async () => {
      started += 1;
      const controller = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);
      try {
        const response = await fetchImpl(url, { signal: controller.signal, headers: { Accept: 'application/json', 'User-Agent': userAgent } });
        if (!response.ok) throw new HttpError(response.status, retryAfterMs(response));
        try {
          return await response.json();
        } catch (error) {
          if (timedOut) throw error;
          throw new ParseError('The response was not JSON');
        }
      } catch (error) {
        if (timedOut) throw new TimeoutError();
        throw error;
      } finally {
        clearTimeout(timer);
      }
    });

  return {
    requests: () => started,
    async getJson(url) {
      for (let attempt = 1; ; attempt++) {
        try {
          return await attemptOnce(url);
        } catch (error) {
          if (!isTransient(error) || attempt >= MAX_ATTEMPTS) throw error;
          const rateLimited = error instanceof HttpError && error.status === 429;
          // A 429 holds the lane back for as long as the server asked, else for a longer back-off than a 5xx.
          const waitMs = rateLimited
            ? Math.min((error as HttpError).retryAfterMs ?? backoffBaseMs * 6 * 2 ** (attempt - 1), MAX_RETRY_AFTER_MS)
            : Math.min(backoffBaseMs * 2 ** (attempt - 1), 120_000);
          const why = error instanceof HttpError ? `HTTP ${error.status}` : error instanceof TimeoutError ? 'a time-out' : 'no connection';
          options.onRetry?.(`${why}; waiting ${Math.round(waitMs / 1000)} s (try ${attempt + 1} of ${MAX_ATTEMPTS})`);
          queue.penalize(LANE, waitMs);
        }
      }
    },
  };
}
