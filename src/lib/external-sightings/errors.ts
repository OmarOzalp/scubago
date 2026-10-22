/** Errors the sightings clients throw, and how they are told apart. */

export function abortError(): Error {
  const error = new Error('Aborted');
  error.name = 'AbortError';
  return error;
}

export function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError';
}

/** The server answered, but not with success. */
export class HttpError extends Error {
  readonly status: number;
  /** How long the server asked us to wait, from a Retry-After header in seconds. */
  readonly retryAfterMs?: number;

  constructor(status: number, retryAfterMs?: number) {
    super(`HTTP ${status}`);
    this.name = 'HttpError';
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

/** The answer was not the JSON shape the documentation promises. */
export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParseError';
  }
}

export class TimeoutError extends Error {
  constructor() {
    super('Timed out');
    this.name = 'TimeoutError';
  }
}

/** The queue refused to wait out a long back-off (a rate limit the server asked for). */
export class BackoffError extends Error {
  readonly retryAfterMs: number;

  constructor(retryAfterMs: number) {
    super('Rate limited');
    this.name = 'BackoffError';
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * A short, plain reason for a failed request, and whether it looks like having no connection.
 * Never includes the URL.
 */
export function describeError(error: unknown, sourceName: string): { message: string; offline: boolean } {
  if (error instanceof HttpError) {
    if (error.status === 429) return { message: `${sourceName} is busy (HTTP 429). Try again later.`, offline: false };
    return { message: `${sourceName} answered with HTTP ${error.status}.`, offline: false };
  }
  if (error instanceof BackoffError) return { message: `${sourceName} asked us to wait. Try again later.`, offline: false };
  if (error instanceof TimeoutError) return { message: `${sourceName} did not answer in time.`, offline: true };
  if (error instanceof ParseError) return { message: `${sourceName} sent an answer we could not read.`, offline: false };
  // fetch() rejects with a TypeError when there is no network ("Network request failed" / "Failed to fetch").
  if (error instanceof TypeError) return { message: 'No connection.', offline: true };
  return { message: `${sourceName} could not be reached.`, offline: false };
}
