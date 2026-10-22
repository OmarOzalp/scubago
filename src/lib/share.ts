/**
 * Sharing a card (iOS and Android): draw the card's view into a PNG and open the share sheet with it.
 * The web has its own version, `share.web.ts`, with the same exports.
 *
 * Both native modules are required when a card is first shared, not when the app starts, so a screen
 * that only has a Share button doesn't load them. Everything the service touches is passed in
 * (`ShareDeps`), so the tests run it with mocks.
 */
import { PixelRatio, Platform } from 'react-native';

import {
  CARD_SIZE,
  MESSAGES,
  resultForError,
  toFileUri,
  type ShareOptions,
  type ShareResult,
} from '@/components/share/card-spec';

export { CARD_SIZE, type ShareOptions, type ShareResult, type ShareStatus } from '@/components/share/card-spec';

/** What the capture is asked for (react-native-view-shot's options, the ones used here). */
export interface CaptureRequest {
  format: 'png';
  result: 'tmpfile';
  quality: 1;
  width: number;
  height: number;
}

/** What the share sheet is told (expo-sharing's options, the ones used here). */
export interface SheetOptions {
  mimeType: string;
  UTI: string;
  dialogTitle: string;
}

export interface ShareDeps {
  /** Draws the view (a ref to it, or the node) into a PNG file and returns where it is. */
  capture: (target: unknown, request: CaptureRequest) => Promise<string>;
  /** Whether this device can open a share sheet. */
  isAvailable: () => Promise<boolean>;
  /** Opens the share sheet for a `file://` URI; resolves when it closes. */
  share: (uri: string, options: SheetOptions) => Promise<void>;
  /** 'ios' counts the capture's size in points; anything else in pixels. */
  platform?: string;
  /** Pixels per point of the screen (iOS only). */
  pixelRatio?: number;
}

/** Whether this platform can save the card as a file the diver keeps (the web can; a phone shares it). */
export const canSaveCard = false;

export const DEFAULT_TITLE = 'Share your ScubaGo card';

/**
 * The size to ask the capture for, so the PNG is exactly 1080×1350 pixels. Android counts the size
 * in pixels. iOS counts it in points and draws at the screen's scale, so a 3× phone is asked for a
 * third of it (otherwise it would write a 3240 px wide picture).
 */
export function captureSize(platform: string = Platform.OS, pixelRatio: number = PixelRatio.get()): { width: number; height: number } {
  const k = platform === 'ios' && pixelRatio > 0 ? 1 / pixelRatio : 1;
  return { width: CARD_SIZE.width * k, height: CARD_SIZE.height * k };
}

/** The native modules, required when first used (a screen with a Share button doesn't load them). */
const viewShot = () => require('react-native-view-shot') as typeof import('react-native-view-shot'); // eslint-disable-line @typescript-eslint/no-require-imports
const sharing = () => require('expo-sharing') as typeof import('expo-sharing'); // eslint-disable-line @typescript-eslint/no-require-imports

const defaults: ShareDeps = {
  capture: (target, request) => viewShot().captureRef(target as Parameters<ReturnType<typeof viewShot>['captureRef']>[0], request),
  isAvailable: () => sharing().isAvailableAsync(),
  share: (uri, options) => sharing().shareAsync(uri, options),
};

/** Nothing to prepare on a phone: the picture is drawn when Share is tapped. */
export async function prepareCard(): Promise<unknown> {
  return null;
}

/**
 * Draws the card (a ref to its view, at full size) into a 1080×1350 PNG and opens the share sheet.
 * Never throws: the result says what happened.
 */
export async function shareCard(target: unknown, options: ShareOptions = {}, deps: ShareDeps = defaults): Promise<ShareResult> {
  try {
    if (!(await deps.isAvailable())) return { status: 'unavailable', message: MESSAGES.unavailable };
  } catch {
    return { status: 'unavailable', message: MESSAGES.unavailable };
  }

  let uri: string;
  try {
    const size = captureSize(deps.platform, deps.pixelRatio);
    uri = await deps.capture(target, { format: 'png', result: 'tmpfile', quality: 1, ...size });
    if (!uri) throw new Error('The capture returned no file');
  } catch (error) {
    return resultForError(error, 'capture');
  }

  try {
    await deps.share(toFileUri(uri), { mimeType: 'image/png', UTI: 'public.png', dialogTitle: options.title ?? DEFAULT_TITLE });
    return { status: 'shared' };
  } catch (error) {
    return resultForError(error, 'share');
  }
}

/** Phones share instead of saving: Share has "Save Image" in it. */
export async function saveCard(): Promise<ShareResult> {
  return { status: 'unavailable', message: MESSAGES.saveUnavailable };
}
