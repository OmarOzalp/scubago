import { HttpError, ParseError } from '@/lib/external-sightings/errors';

/** The part of a fetch Response the clients read. The real `fetch` fits; so do small test doubles. */
export interface ResponseLike {
  ok: boolean;
  status: number;
  headers?: { get(name: string): string | null };
  json(): Promise<unknown>;
}

/** The part of `fetch` the clients use, so tests and the request queue can stand in for it. */
export type FetchImpl = (
  url: string,
  init?: { signal?: AbortSignal; headers?: Record<string, string> },
) => Promise<ResponseLike>;

/** The platform's fetch, looked up when called so a test can replace it. */
export const platformFetch: FetchImpl = (url, init) => globalThis.fetch(url, init);

export interface ClientOptions {
  fetchImpl?: FetchImpl;
  signal?: AbortSignal;
}

type QueryValue = string | number | boolean | undefined;

/**
 * "?a=1&b=2" with values percent-encoded (commas kept readable). Built by hand because the
 * URLSearchParams in some React Native versions is incomplete.
 */
export function buildQuery(params: Record<string, QueryValue>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value)).replace(/%2C/g, ',')}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

/** The host of an https URL, lowercase, or '' when it is not one. */
export function hostOf(url: string): string {
  const match = /^https?:\/\/([^/?#]+)/i.exec(url);
  return match ? match[1].toLowerCase() : '';
}

/** Seconds (or an HTTP date) from a Retry-After header, in ms. */
export function retryAfterMs(response: ResponseLike, now = Date.now()): number | undefined {
  const raw = response.headers?.get('retry-after');
  if (!raw) return undefined;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return Math.max(0, Math.round(seconds * 1000));
  const date = Date.parse(raw);
  return Number.isFinite(date) ? Math.max(0, date - now) : undefined;
}

/** GET a URL and parse the JSON. Throws HttpError for a non-success status and ParseError for a body that is not JSON. */
export async function fetchJson(url: string, { fetchImpl = platformFetch, signal }: ClientOptions = {}): Promise<unknown> {
  const response = await fetchImpl(url, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) throw new HttpError(response.status, retryAfterMs(response));
  try {
    return await response.json();
  } catch {
    throw new ParseError('The response was not JSON');
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A finite number, or undefined. Numeric strings are accepted ("12"). */
export function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

/** A non-empty trimmed string, or undefined. */
export function toText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}
