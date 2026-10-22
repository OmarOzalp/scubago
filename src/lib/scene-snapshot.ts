/**
 * A picture of the live 3D scene, for the share cards' hero (docs/sharing.md).
 *
 * The mounted scene registers a `capture` function under a name (`'home'`: Home's island card); the
 * Share flow asks for it with `captureScene('home', { width, height })`. Nothing here keeps a
 * reference to the scene, and nothing throws: no scene, a scene that can't be read, or one that is
 * too slow all answer `null`, and the card draws its illustration instead.
 *
 * How the picture is taken, once, on demand (nothing runs per frame, and `preserveDrawingBuffer`
 * stays off, so the normal frame rate is untouched):
 * - **Web.** For one synchronous step the renderer is resized to a larger drawing buffer of the
 *   canvas's own shape (the camera is optionally zoomed out a little: `widen`), the scene is drawn
 *   once, a centred strip of it in the picture's shape is copied to a 2D canvas, and the renderer
 *   and camera are put back and the island drawn again, all in the same task, so the browser never
 *   paints the in-between. (The strip is cut out of a full-shape render rather than rendered at
 *   the strip's own shape because the ocean's edge haze is in clip space: it would fall on the
 *   picture's top and bottom.) The copy becomes a PNG `blob:` URL (`releaseSnapshot` revokes it).
 * - **iOS and Android.** The scene is drawn once and expo-gl's `GLView.takeSnapshotAsync` reads
 *   the GL framebuffer for the same centred strip (`rect`), into a PNG file in the cache directory
 *   (a `file://` URI). The camera is not touched, so there is no visible jump: the picture is
 *   the card's own framing, not widened. (Widening needs a frame drawn at another zoom, and Expo
 *   GL presents every frame `render` draws: the diver would see it flash.)
 *
 * Both are plain functions over the renderer R3F hands out (`gl`, `scene`, `camera`), typed
 * structurally so this file needs no three.js, and everything platform-specific is passed in
 * (`CaptureDeps`), so the tests run it with mocks.
 */
import { Platform } from 'react-native';

import type { ExpoWebGLRenderingContext, GLSnapshot, SnapshotOptions as GLSnapshotOptions } from 'expo-gl';

/** The size wanted, in pixels. Its shape (width ÷ height) is the framing; a phone may return fewer pixels. */
export interface SnapshotRequest {
  width: number;
  height: number;
  /** Web only: how much more of the world than the scene's own view to show (1.25: a quarter wider and taller; 1 or unset: the same). */
  widen?: number;
}

/** What a scene registers: its picture as an image URI (`file://`, `data:` or `blob:`), or null. */
export type SceneCapture = (request: SnapshotRequest) => Promise<string | null> | string | null;

/** How long Share waits for the scene before it uses the illustration. */
export const CAPTURE_TIMEOUT_MS = 1500;

/**
 * The Home card's picture: twice the share card's hero frame (868×406), so it stays sharp, and on the
 * web a little more of the sea than the card shows, so the island's reef isn't cut at the edges of
 * the strip (Home's view fits the island to the card's height, which a 2.1:1 strip is half of).
 */
export const HERO_SNAPSHOT: SnapshotRequest = { width: 1736, height: 812, widen: 1.25 };

/** The most pixels the web asks the GPU to draw for a picture (the full-shape render the strip is cut from). */
const MAX_PIXELS = 4_000_000;

// ── The registry ─────────────────────────────────────────────────────────────────────────────────

const captures = new Map<string, SceneCapture>();

/** A mounted scene says how to take its picture. Returns the function that takes it back (call it on unmount). */
export function registerSceneCapture(key: string, capture: SceneCapture): () => void {
  captures.set(key, capture);
  return () => {
    // A newer scene under the same name stays registered.
    if (captures.get(key) === capture) captures.delete(key);
  };
}

/** Whether a scene is registered under this name (for the screens that only offer a picture when there is one). */
export function hasScene(key: string): boolean {
  return captures.has(key);
}

const isImageUri = (value: unknown): value is string =>
  typeof value === 'string' && /^(file:\/\/|blob:|data:image\/)/i.test(value);

/** Lets go of a picture's memory once it is no longer shown: a web `blob:` URL is revoked, a file is left to the system's cache clean-up. */
export function releaseSnapshot(uri: string | null | undefined): void {
  if (!uri || !/^blob:/i.test(uri)) return;
  try {
    URL.revokeObjectURL(uri);
  } catch {
    // Nothing to release.
  }
}

/**
 * The registered scene's picture, or `null`: no scene under this name, a scene that throws or
 * answers with something that isn't an image, or one that takes longer than `timeoutMs`. Never
 * throws. A picture that arrives after the timeout is released, not leaked.
 */
export async function captureScene(key: string, request: SnapshotRequest, timeoutMs: number = CAPTURE_TIMEOUT_MS): Promise<string | null> {
  const capture = captures.get(key);
  if (!capture) return null;

  let timer: ReturnType<typeof setTimeout> | undefined;
  let late = false;
  const taken = (async () => {
    try {
      const uri = await capture(request);
      return isImageUri(uri) ? uri : null;
    } catch {
      return null;
    }
  })();
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      late = true;
      resolve(null);
    }, timeoutMs);
  });
  const uri = await Promise.race([taken, timeout]);
  clearTimeout(timer);
  if (late) void taken.then(releaseSnapshot);
  return uri;
}

// ── Taking the picture ───────────────────────────────────────────────────────────────────────────

/** The part of three's orthographic camera the capture frames. */
export interface FrameCamera {
  isOrthographicCamera?: boolean;
  zoom: number;
  updateProjectionMatrix(): void;
}

/** The part of three's WebGLRenderer the capture uses (R3F's `gl`). */
export interface FrameRenderer {
  domElement?: unknown;
  render(scene: unknown, camera: unknown): void;
  getContext(): unknown;
  getSize(target: { set(x: number, y: number): unknown }): unknown;
  getPixelRatio(): number;
  setPixelRatio(ratio: number): void;
  setSize(width: number, height: number, updateStyle?: boolean): void;
  capabilities?: { maxTextureSize?: number };
}

export interface FrameTarget {
  gl: FrameRenderer;
  scene: unknown;
  camera: unknown;
}

/** The pieces of the browser the web capture touches. */
export interface WebDeps {
  /** A 2D canvas of this size to copy the picture into. */
  makeCanvas: (width: number, height: number) => WebCanvas;
  createObjectURL: (blob: Blob) => string;
}

export interface WebCanvas {
  width: number;
  height: number;
  getContext(kind: '2d'): { drawImage(image: unknown, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number): void } | null;
  toBlob(callback: (blob: Blob | null) => void, type?: string): void;
}

/** The piece of expo-gl the phone capture touches. */
export interface NativeDeps {
  takeSnapshot: (context: ExpoWebGLRenderingContext, options: GLSnapshotOptions) => Promise<GLSnapshot>;
}

export type CaptureDeps = Partial<WebDeps> & Partial<NativeDeps>;

const webDeps = (): WebDeps => ({
  makeCanvas: (width, height) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas as unknown as WebCanvas;
  },
  createObjectURL: (blob) => URL.createObjectURL(blob),
});

/** expo-gl is required when a picture is first taken on a phone, not when the app starts (and never on the web). */
const nativeDeps = (): NativeDeps => ({
  takeSnapshot: (context, options) => (require('expo-gl') as typeof import('expo-gl')).GLView.takeSnapshotAsync(context, options), // eslint-disable-line @typescript-eslint/no-require-imports
});

/** A centred strip of a width × height buffer in the wanted shape, as `glReadPixels` wants it (whole pixels, origin bottom left). */
export function cropRect(width: number, height: number, aspect: number): { x: number; y: number; width: number; height: number } {
  const wantedHeight = Math.round(width / aspect);
  if (wantedHeight <= height) return { x: 0, y: Math.floor((height - wantedHeight) / 2), width, height: wantedHeight };
  // The buffer is wider than the shape asks for: crop the sides instead.
  const wantedWidth = Math.round(height * aspect);
  return { x: Math.floor((width - wantedWidth) / 2), y: 0, width: wantedWidth, height };
}

const whole = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;

/**
 * Takes the picture of a drawn scene: the renderer's `gl`, `scene` and `camera` (what R3F's
 * `useThree` gives). Resolves to an image URI, or null when it can't be read (never throws).
 */
export async function captureFrame(target: FrameTarget, request: SnapshotRequest, deps: CaptureDeps = {}): Promise<string | null> {
  try {
    if (!whole(request.width) || !whole(request.height)) return null;
    const { gl } = target;
    if (typeof HTMLCanvasElement !== 'undefined' && gl.domElement instanceof HTMLCanvasElement) return await captureWeb(target, request, { ...webDeps(), ...deps });
    if (Platform.OS !== 'web') return await captureNative(target, request, { ...nativeDeps(), ...deps });
    return null;
  } catch {
    return null;
  }
}

/**
 * The web (see the top of this file). A 2D copy, rather than reading the WebGL canvas later, means
 * the picture doesn't depend on when a browser clears the drawing buffer.
 */
async function captureWeb({ gl, scene, camera }: FrameTarget, request: SnapshotRequest, deps: WebDeps): Promise<string | null> {
  const view = camera as FrameCamera;
  if (!view.isOrthographicCamera) return null;
  const canvas = gl.domElement as HTMLCanvasElement;

  const size = { x: 0, y: 0, set(x: number, y: number) { this.x = x; this.y = y; return this; } };
  gl.getSize(size);
  if (!whole(size.x) || !whole(size.y)) return null;
  const was = { ratio: gl.getPixelRatio(), width: size.x, height: size.y, zoom: view.zoom };

  // The drawing buffer: as wide as the picture asks, in the canvas's own shape, within the GPU's limit and a pixel budget.
  const limit = Math.max(256, Math.min(gl.capabilities?.maxTextureSize ?? 4096, 8192));
  let width = Math.min(Math.round(request.width), limit);
  let height = Math.round((width * was.height) / was.width);
  const fit = Math.min(1, Math.sqrt(MAX_PIXELS / (width * height)), limit / height);
  width = Math.max(1, Math.floor(width * fit));
  height = Math.max(1, Math.floor(height * fit));
  const crop = cropRect(width, height, request.width / request.height);
  const widen = Math.min(2, Math.max(1, request.widen ?? 1));

  const copy = deps.makeCanvas(crop.width, crop.height);
  const draw = copy.getContext('2d');
  if (!draw) return null;
  try {
    gl.setPixelRatio(1);
    gl.setSize(width, height, false);
    view.zoom = was.zoom / widen;
    view.updateProjectionMatrix();
    gl.render(scene, camera);
    draw.drawImage(canvas, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
  } finally {
    view.zoom = was.zoom;
    view.updateProjectionMatrix();
    gl.setPixelRatio(was.ratio);
    gl.setSize(was.width, was.height, false);
    // Resizing clears the canvas: draw the island back before the page paints.
    gl.render(scene, camera);
  }

  const blob = await new Promise<Blob | null>((resolve) => copy.toBlob(resolve, 'image/png'));
  copy.width = 0;
  copy.height = 0;
  return blob ? deps.createObjectURL(blob) : null;
}

/**
 * iOS and Android. Expo GL owns the buffer: the scene is drawn once more (R3F's native `render` also
 * ends the frame, so the framebuffer holds a whole picture), and `takeSnapshotAsync` reads a centred
 * strip of the default framebuffer into a PNG in the cache directory. `flip` stays off, which
 * gives an upright picture on both platforms (expo-gl reads the rows bottom-up and turns them over
 * itself). The camera is left alone, so nothing on screen changes.
 */
async function captureNative({ gl, scene, camera }: FrameTarget, request: SnapshotRequest, deps: NativeDeps): Promise<string | null> {
  const context = gl.getContext() as ExpoWebGLRenderingContext | undefined;
  if (!context || typeof context.contextId !== 'number') return null;
  const { drawingBufferWidth: bufferWidth, drawingBufferHeight: bufferHeight } = context;
  if (!whole(bufferWidth) || !whole(bufferHeight)) return null;

  gl.render(scene, camera);
  const rect = cropRect(bufferWidth, bufferHeight, request.width / request.height);
  const shot = await deps.takeSnapshot(context, { format: 'png', compress: 1, flip: false, rect });
  const uri = typeof shot.uri === 'string' ? shot.uri : shot.localUri;
  return typeof uri === 'string' && uri ? uri : null;
}
