/**
 * What every share card and the share service agree on: the card's size, the result of a share and
 * how a failure is told to the diver. Plain TypeScript with no imports, so the native and web
 * services (src/lib/share.ts, share.web.ts) and the cards can all use it.
 */

/** The cards are drawn at this size (4:5, a feed-friendly portrait) and saved as a PNG of exactly it. */
export const CARD_SIZE = { width: 1080, height: 1350 } as const;

/**
 * How a share ended.
 * - `shared`: the share sheet was shown and closed. The phone doesn't say whether the diver posted
 *   or backed out, so that is all it can mean on iOS and Android.
 * - `saved`: (web) the PNG was downloaded.
 * - `cancelled`: the diver closed the browser's share dialog.
 * - `unavailable`: this device can't share.
 * - `error`: something failed; `message` says so politely.
 */
export type ShareStatus = 'shared' | 'saved' | 'cancelled' | 'unavailable' | 'error';

export interface ShareResult {
  status: ShareStatus;
  /** A sentence for the diver, set for `saved`, `unavailable` and `error`. */
  message?: string;
}

/** What the share sheet is told about the card. */
export interface ShareOptions {
  /** Title of the share dialog (Android and web). */
  title?: string;
  /** File name without the extension, for the PNG a browser downloads. */
  fileName?: string;
  /** A picture already drawn by `prepareCard` (web), so the share starts the moment it is tapped. */
  prepared?: unknown;
}

export const MESSAGES = {
  unavailable: 'Sharing isn’t available on this device.',
  capture: 'Couldn’t make your picture. Please try again.',
  share: 'Couldn’t open the share sheet. Please try again.',
  busy: 'Another share is still open. Close it and try again.',
  saved: 'Saved to your downloads.',
  saveUnavailable: 'Saving isn’t available here. Use Share instead.',
} as const;

/** The step that was running when something threw, so the message says the right thing. */
export type ShareStep = 'capture' | 'share';

/** Whether a thrown value is the diver backing out (the browser's AbortError, or a library saying so). */
export function isCancellation(error: unknown): boolean {
  const e = error as { name?: unknown; code?: unknown; message?: unknown } | null | undefined;
  if (!e || typeof e !== 'object') return false;
  const name = String(e.name ?? '');
  const code = String(e.code ?? '');
  const message = String(e.message ?? '');
  return name === 'AbortError' || /cancel|abort|dismiss/i.test(code) || /\b(cancell?ed|canceled|aborted|dismissed)\b/i.test(message);
}

/** A thrown value as a result: cancelling is not a failure; anything else is told politely. */
export function resultForError(error: unknown, step: ShareStep): ShareResult {
  if (isCancellation(error)) return { status: 'cancelled' };
  const e = error as { code?: unknown; message?: unknown } | null | undefined;
  const text = `${String(e?.code ?? '')} ${String(e?.message ?? '')}`;
  if (/in.?progress|being processed/i.test(text)) return { status: 'error', message: MESSAGES.busy };
  if (/unavailab|not.?supported/i.test(text) && step === 'share') return { status: 'unavailable', message: MESSAGES.unavailable };
  return { status: 'error', message: step === 'capture' ? MESSAGES.capture : MESSAGES.share };
}

/** "scubago-reef-manta": lower case letters, digits and dashes, so it is a safe file name anywhere. */
export function cardFileName(...parts: (string | number | undefined)[]): string {
  const slug = parts
    .filter((p) => p !== undefined && p !== '')
    .join(' ')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug ? `scubago-${slug}` : 'scubago-card';
}

/** `file:///…` for a path or URI the capture returned (iOS gives a bare path, Android a file URI). */
export function toFileUri(uri: string): string {
  return /^[a-z][a-z0-9+.-]*:/i.test(uri) ? uri : `file://${uri}`;
}
