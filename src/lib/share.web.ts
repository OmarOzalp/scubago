/**
 * Sharing a card on the web: draw the card's element into a PNG, then hand it to the browser's share
 * dialog (the Web Share API, with the PNG as a file) where there is one, or download it.
 *
 * react-native-view-shot draws the web the same way, with html2canvas (a library it installs), but
 * it can't be told to ignore the scaled frame the preview shows the card in. html2canvas would
 * lay the card out at preview size and set its text at full size inside it. So this calls
 * html2canvas itself and, in the copy of the page it draws from, takes the scale off the card's
 * parents.
 *
 * Browsers want a share to start within a few seconds of the tap, and drawing the card takes longer
 * than that on a slow machine, so the preview draws it as it opens (`prepareCard`) and Share
 * uses that picture. Without one (the diver tapped at once), Share draws it then; if the browser
 * refuses the late share, the PNG is downloaded instead.
 */
import {
  CARD_SIZE,
  MESSAGES,
  resultForError,
  type ShareOptions,
  type ShareResult,
} from '@/components/share/card-spec';

export { CARD_SIZE, type ShareOptions, type ShareResult, type ShareStatus } from '@/components/share/card-spec';

export interface ShareDeps {
  /** Draws the card's element into a PNG, 1080×1350. */
  capture: (target: unknown) => Promise<Blob>;
  /** The browser's `navigator` (for `share` and `canShare`); absent where there is no Web Share API. */
  nav?: { share?: (data: ShareData) => Promise<void>; canShare?: (data: ShareData) => boolean };
  /** Gives the diver the file. */
  download: (blob: Blob, fileName: string) => void;
  /** Wraps the PNG as a file for the Web Share API. */
  makeFile: (blob: Blob, fileName: string) => File;
}

/** The web saves the card as a file, as well as sharing it. */
export const canSaveCard = true;

export const DEFAULT_TITLE = 'Share your ScubaGo card';

/** A card already drawn, ready to be shared the moment the diver taps. */
export interface PreparedCard {
  blob: Blob;
}

const isPrepared = (value: unknown): value is PreparedCard => !!value && typeof (value as PreparedCard).blob === 'object';

/** The DOM node a ref (or the node itself) stands for. */
function nodeOf(target: unknown): HTMLElement {
  const node = target && typeof target === 'object' && 'current' in target ? (target as { current: unknown }).current : target;
  if (!node || typeof (node as HTMLElement).getBoundingClientRect !== 'function') throw new Error('The card is not on the page');
  return node as HTMLElement;
}

/**
 * The page html2canvas draws from is a copy; here the copy's parents of the card lose their scale and
 * clipping, so the card is laid out at its own 1080×1350.
 */
export function unscaleParents(clone: HTMLElement) {
  for (let el = clone.parentElement; el; el = el.parentElement) {
    el.style.transform = 'none';
    el.style.overflow = 'visible';
    el.style.clipPath = 'none';
  }
}

async function captureNode(target: unknown): Promise<Blob> {
  const node = nodeOf(target);
  const { default: html2canvas } = await import('html2canvas');
  // The text should be set in its own faces before it is measured, not in the fallbacks.
  await document.fonts?.ready;
  const drawn = await html2canvas(node, {
    scale: 1,
    useCORS: true,
    logging: false,
    backgroundColor: '#FBF6EC',
    onclone: (_doc, clone) => unscaleParents(clone),
  });
  // Exactly 1080×1350, whatever the browser did.
  const canvas = document.createElement('canvas');
  canvas.width = CARD_SIZE.width;
  canvas.height = CARD_SIZE.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('The browser can’t draw the picture');
  context.drawImage(drawn, 0, 0, CARD_SIZE.width, CARD_SIZE.height);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The picture came out empty'))), 'image/png');
  });
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Let the browser start reading the file before it is let go.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

const defaults = (): ShareDeps => ({
  capture: captureNode,
  nav: typeof navigator === 'undefined' ? undefined : navigator,
  download: downloadBlob,
  makeFile: (blob, fileName) => new File([blob], fileName, { type: 'image/png' }),
});

/** Draws the card ahead of the tap. Resolves null if that fails (Share then tries again). */
export async function prepareCard(target: unknown, deps: ShareDeps = defaults()): Promise<PreparedCard | null> {
  try {
    return { blob: await deps.capture(target) };
  } catch {
    return null;
  }
}

async function pngOf(target: unknown, options: ShareOptions, deps: ShareDeps): Promise<{ blob: Blob } | ShareResult> {
  if (isPrepared(options.prepared)) return options.prepared;
  try {
    return { blob: await deps.capture(target) };
  } catch (error) {
    return resultForError(error, 'capture');
  }
}

/**
 * Opens the browser's share dialog with the card as a PNG file, or, where the browser can't share
 * files, downloads it. Never throws.
 */
export async function shareCard(target: unknown, options: ShareOptions = {}, deps: ShareDeps = defaults()): Promise<ShareResult> {
  const png = await pngOf(target, options, deps);
  if (!('blob' in png)) return png;
  const fileName = `${options.fileName ?? 'scubago-card'}.png`;

  try {
    const file = deps.makeFile(png.blob, fileName);
    const data: ShareData = { files: [file], title: options.title ?? DEFAULT_TITLE };
    if (deps.nav?.share && deps.nav.canShare?.(data)) {
      try {
        await deps.nav.share(data);
        return { status: 'shared' };
      } catch (error) {
        // Backing out is the diver's choice; anything else (the browser refusing a late share) falls through to the download.
        if (resultForError(error, 'share').status === 'cancelled') return { status: 'cancelled' };
      }
    }
  } catch {
    // Couldn't make a File: download the PNG instead.
  }
  return download(png.blob, fileName, deps);
}

/** Downloads the card as a PNG. */
export async function saveCard(target: unknown, options: ShareOptions = {}, deps: ShareDeps = defaults()): Promise<ShareResult> {
  const png = await pngOf(target, options, deps);
  if (!('blob' in png)) return png;
  return download(png.blob, `${options.fileName ?? 'scubago-card'}.png`, deps);
}

function download(blob: Blob, fileName: string, deps: ShareDeps): ShareResult {
  try {
    deps.download(blob, fileName);
    return { status: 'saved', message: MESSAGES.saved };
  } catch {
    return { status: 'error', message: MESSAGES.share };
  }
}
