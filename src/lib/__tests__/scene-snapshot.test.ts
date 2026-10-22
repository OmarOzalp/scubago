import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import {
  CAPTURE_TIMEOUT_MS,
  captureFrame,
  captureScene,
  cropRect,
  hasScene,
  HERO_SNAPSHOT,
  registerSceneCapture,
  releaseSnapshot,
  type FrameTarget,
  type NativeDeps,
  type WebCanvas,
  type WebDeps,
} from '../scene-snapshot';

const mockTakeSnapshotAsync = jest.fn();
jest.mock('expo-gl', () => ({ GLView: { takeSnapshotAsync: (...args: unknown[]) => mockTakeSnapshotAsync(...args) } }));

const request = { width: 1736, height: 812 };
const unregister: (() => void)[] = [];
const register = (key: string, capture: Parameters<typeof registerSceneCapture>[1]) => {
  const off = registerSceneCapture(key, capture);
  unregister.push(off);
  return off;
};
afterEach(() => {
  while (unregister.length) unregister.pop()!();
  jest.useRealTimers();
  jest.restoreAllMocks();
  mockTakeSnapshotAsync.mockReset();
});

describe('the scene registry', () => {
  it('asks the registered scene for its picture, with the size wanted', async () => {
    const capture = jest.fn(async () => 'file:///cache/GLView/a.png');
    register('home', capture);
    expect(hasScene('home')).toBe(true);
    expect(await captureScene('home', request)).toBe('file:///cache/GLView/a.png');
    expect(capture).toHaveBeenCalledWith(request);
  });

  it('takes blob: and data: pictures too, and a plain (not async) capture', async () => {
    register('a', () => 'blob:http://localhost/1234');
    register('b', () => 'data:image/png;base64,AAAA');
    expect(await captureScene('a', request)).toBe('blob:http://localhost/1234');
    expect(await captureScene('b', request)).toBe('data:image/png;base64,AAAA');
  });

  it('stops answering once the scene unregisters (it unmounted)', async () => {
    const off = register('home', async () => 'file:///a.png');
    off();
    expect(hasScene('home')).toBe(false);
    expect(await captureScene('home', request)).toBeNull();
  });

  it('answers null when no scene was ever registered under that name', async () => {
    expect(await captureScene('nowhere', request)).toBeNull();
  });

  it('leaves a newer scene alone when an older one unregisters late', async () => {
    const first = register('home', async () => 'file:///first.png');
    register('home', async () => 'file:///second.png');
    first();
    expect(await captureScene('home', request)).toBe('file:///second.png');
  });

  it('answers null, not an error, when the scene throws or rejects', async () => {
    register('sync', () => {
      throw new Error('context lost');
    });
    register('async', async () => {
      throw new Error('read failed');
    });
    expect(await captureScene('sync', request)).toBeNull();
    expect(await captureScene('async', request)).toBeNull();
  });

  it.each([[''], ['https://example.com/a.png'], ['/tmp/a.png'], [null], [undefined], [42]])('answers null for something that is not an image URI (%p)', async (value) => {
    register('odd', (async () => value) as never);
    expect(await captureScene('odd', request)).toBeNull();
  });

  it('answers null after the timeout, and lets go of a picture that arrives too late', async () => {
    jest.useFakeTimers();
    const revoke = jest.fn();
    Object.assign(URL, { revokeObjectURL: revoke });
    let finish: (uri: string) => void = () => {};
    register('slow', () => new Promise<string>((resolve) => (finish = resolve)));
    const result = captureScene('slow', request);
    await jest.advanceTimersByTimeAsync(CAPTURE_TIMEOUT_MS - 1);
    let settled = false;
    void result.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    expect(await result).toBeNull();
    // The scene finishes after Share gave up: nobody will show it, so it is released.
    finish('blob:http://localhost/late');
    await jest.advanceTimersByTimeAsync(0);
    expect(revoke).toHaveBeenCalledWith('blob:http://localhost/late');
  });

  it('waits at most as long as it is told', async () => {
    jest.useFakeTimers();
    register('slow', () => new Promise<string>(() => {}));
    const result = captureScene('slow', request, 250);
    await jest.advanceTimersByTimeAsync(250);
    expect(await result).toBeNull();
  });

  it('does not time out a scene that answers in time (and leaves no timer behind)', async () => {
    jest.useFakeTimers();
    register('quick', async () => 'file:///quick.png');
    expect(await captureScene('quick', request)).toBe('file:///quick.png');
    expect(jest.getTimerCount()).toBe(0);
  });

  it('asks for twice the share card’s hero frame, in its shape', () => {
    expect(HERO_SNAPSHOT.width / HERO_SNAPSHOT.height).toBeCloseTo(868 / 406, 1);
    expect(HERO_SNAPSHOT.width).toBeGreaterThanOrEqual(1736);
  });
});

describe('releaseSnapshot', () => {
  it('revokes a blob: URL and leaves other pictures (files, nothing) alone', () => {
    const revoke = jest.fn();
    Object.assign(URL, { revokeObjectURL: revoke });
    releaseSnapshot('blob:http://localhost/1');
    releaseSnapshot('file:///cache/a.png');
    releaseSnapshot(undefined);
    releaseSnapshot(null);
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith('blob:http://localhost/1');
  });

  it('never throws', () => {
    Object.assign(URL, {
      revokeObjectURL: () => {
        throw new Error('nope');
      },
    });
    expect(() => releaseSnapshot('blob:http://localhost/1')).not.toThrow();
  });
});

describe('cropRect', () => {
  it('cuts a centred strip in the wanted shape out of a taller buffer', () => {
    // 840×780 (a Home card at 2×) for a 2.14:1 hero: the whole width, 393 rows from the middle.
    expect(cropRect(840, 780, 1736 / 812)).toEqual({ x: 0, y: 193, width: 840, height: 393 });
  });

  it('cuts the sides instead when the buffer is wider than the shape', () => {
    expect(cropRect(1000, 200, 2)).toEqual({ x: 300, y: 0, width: 400, height: 200 });
  });

  it('keeps a buffer that already has the shape', () => {
    expect(cropRect(800, 400, 2)).toEqual({ x: 0, y: 0, width: 800, height: 400 });
  });
});

// ── Taking the picture ───────────────────────────────────────────────────────────────────────────

describe('on iOS and Android', () => {
  const context = { contextId: 7, drawingBufferWidth: 840, drawingBufferHeight: 780 };
  const native = (over: Partial<FrameTarget['gl']> = {}) => {
    const calls: string[] = [];
    const gl = {
      domElement: {}, // R3F's native canvas is a plain object, not a DOM canvas
      render: jest.fn(() => void calls.push('render')),
      getContext: () => context,
      getSize: jest.fn(),
      getPixelRatio: () => 3,
      setPixelRatio: jest.fn(),
      setSize: jest.fn(),
      ...over,
    } as unknown as FrameTarget['gl'];
    const deps: NativeDeps = {
      takeSnapshot: jest.fn(async () => {
        calls.push('snapshot');
        return { uri: 'file:///cache/GLView/abc.png', localUri: 'file:///cache/GLView/abc.png', width: 840, height: 393 };
      }),
    };
    return { target: { gl, scene: {}, camera: {} } as FrameTarget, deps, calls, gl };
  };

  it('draws the scene once, then reads a centred strip of the GL framebuffer as a PNG file', async () => {
    const { target, deps, calls } = native();
    expect(await captureFrame(target, request, deps)).toBe('file:///cache/GLView/abc.png');
    // The frame is drawn right before it is read, so the buffer holds a whole picture.
    expect(calls).toEqual(['render', 'snapshot']);
    expect(deps.takeSnapshot).toHaveBeenCalledWith(context, {
      format: 'png',
      compress: 1,
      flip: false,
      rect: { x: 0, y: 193, width: 840, height: 393 },
    });
  });

  it('leaves the camera and the renderer’s size alone (nothing on screen changes)', async () => {
    const { target, deps, gl } = native();
    await captureFrame(target, { ...request, widen: 1.25 }, deps);
    expect(gl.setSize).not.toHaveBeenCalled();
    expect(gl.setPixelRatio).not.toHaveBeenCalled();
    expect(gl.render).toHaveBeenCalledTimes(1);
  });

  it('answers null when the GL context has no id or no drawing buffer yet', async () => {
    const noId = native({ getContext: () => ({ drawingBufferWidth: 10, drawingBufferHeight: 10 }) as never });
    expect(await captureFrame(noId.target, request, noId.deps)).toBeNull();
    const empty = native({ getContext: () => ({ contextId: 1, drawingBufferWidth: 0, drawingBufferHeight: 0 }) as never });
    expect(await captureFrame(empty.target, request, empty.deps)).toBeNull();
    expect(empty.deps.takeSnapshot).not.toHaveBeenCalled();
  });

  it('answers null when expo-gl fails, or returns no file', async () => {
    const failing = native();
    (failing.deps.takeSnapshot as jest.Mock).mockImplementation(async () => {
      throw new Error('E_GL_NO_FRAMEBUFFER');
    });
    expect(await captureFrame(failing.target, request, failing.deps)).toBeNull();
    const empty = native();
    (empty.deps.takeSnapshot as jest.Mock).mockImplementation(async () => ({ uri: null, localUri: '', width: 1, height: 1 }));
    expect(await captureFrame(empty.target, request, empty.deps)).toBeNull();
  });

  it('answers null for a size that is not one', async () => {
    const { target, deps } = native();
    expect(await captureFrame(target, { width: 0, height: 812 }, deps)).toBeNull();
    expect(await captureFrame(target, { width: 1736, height: Number.NaN }, deps)).toBeNull();
  });

  it('uses expo-gl’s GLView.takeSnapshotAsync, loaded when first needed', async () => {
    mockTakeSnapshotAsync.mockImplementation(async () => ({ uri: 'file:///cache/GLView/real.png' }));
    const { target } = native();
    expect(await captureFrame(target, request)).toBe('file:///cache/GLView/real.png');
    expect(mockTakeSnapshotAsync).toHaveBeenCalledWith(context, expect.objectContaining({ format: 'png', flip: false }));
  });
});

describe('on the web', () => {
  // The jest environment has no DOM: a stand-in canvas class is enough for the "is this a canvas?" test.
  class FakeCanvas {}
  beforeEach(() => {
    Object.assign(globalThis, { HTMLCanvasElement: FakeCanvas });
  });
  afterEach(() => {
    delete (globalThis as { HTMLCanvasElement?: unknown }).HTMLCanvasElement;
  });

  /** A renderer 332×308 at pixel ratio 1.25 whose canvas content is whatever was last drawn. */
  const web = (over: { camera?: Record<string, unknown>; render?: () => void; maxTextureSize?: number } = {}) => {
    const log: string[] = [];
    const state = { width: 332, height: 308, ratio: 1.25 };
    const camera = { isOrthographicCamera: true, zoom: 31, updateProjectionMatrix: jest.fn(() => void log.push(`projection zoom=${camera.zoom}`)), ...over.camera };
    const dom = new FakeCanvas();
    const gl = {
      domElement: dom,
      render: jest.fn(() => {
        log.push(`render ${state.width}x${state.height}@${state.ratio} zoom=${camera.zoom}`);
        over.render?.();
      }),
      getContext: () => ({}),
      getSize: (target: { set(x: number, y: number): unknown }) => target.set(state.width, state.height),
      getPixelRatio: () => state.ratio,
      setPixelRatio: jest.fn((ratio: number) => void (state.ratio = ratio)),
      setSize: jest.fn((width: number, height: number, updateStyle?: boolean) => {
        log.push(`size ${width}x${height} style=${updateStyle}`);
        state.width = width;
        state.height = height;
      }),
      capabilities: { maxTextureSize: over.maxTextureSize ?? 16384 },
    };
    const drawn: unknown[][] = [];
    const copy = {
      width: 0,
      height: 0,
      getContext: jest.fn(() => ({ drawImage: (...args: unknown[]) => void drawn.push(args) })),
      toBlob: jest.fn((callback: (blob: Blob | null) => void) => callback({ size: 1234 } as Blob)),
    };
    const deps: WebDeps = {
      makeCanvas: jest.fn((width: number, height: number) => {
        copy.width = width;
        copy.height = height;
        return copy as unknown as WebCanvas;
      }),
      createObjectURL: jest.fn(() => 'blob:http://localhost/shot'),
    };
    return { target: { gl, scene: {}, camera } as unknown as FrameTarget, deps, log, gl, camera, copy, drawn, state };
  };

  it('draws the scene once at the picture’s width in the canvas’s own shape, copies a centred strip, and puts everything back', async () => {
    const { target, deps, log, drawn, copy, state, camera } = web();
    expect(await captureFrame(target, { width: 1736, height: 812 }, deps)).toBe('blob:http://localhost/shot');
    // 1736 wide and as tall as the 332×308 canvas is for its width (1611); the strip is 1736×812 from the middle (399 down).
    expect(log).toEqual([
      'size 1736x1611 style=false',
      'projection zoom=31',
      'render 1736x1611@1 zoom=31',
      'projection zoom=31',
      'size 332x308 style=false',
      'render 332x308@1.25 zoom=31',
    ]);
    expect(drawn).toEqual([[expect.any(FakeCanvas), 0, 399, 1736, 812, 0, 0, 1736, 812]]);
    expect(deps.makeCanvas).toHaveBeenCalledWith(1736, 812);
    // Back as it was: the pixel ratio, the size, the zoom; the 2D copy let go.
    expect(state).toEqual({ width: 332, height: 308, ratio: 1.25 });
    expect(camera.zoom).toBe(31);
    expect(copy.width).toBe(0);
    expect(deps.createObjectURL).toHaveBeenCalledWith({ size: 1234 });
  });

  it('asks the encoder for a PNG', async () => {
    const { target, deps, copy } = web();
    await captureFrame(target, request, deps);
    expect(copy.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png');
  });

  it('zooms out for the one drawing when it is asked to widen, and zooms back', async () => {
    const zooms: number[] = [];
    const h = web();
    h.gl.render.mockImplementation(() => void zooms.push(h.camera.zoom));
    await captureFrame(h.target, { ...request, widen: 1.25 }, h.deps);
    // The picture is drawn at 31 ÷ 1.25; the island is drawn back at its own zoom.
    expect(zooms).toEqual([24.8, 31]);
    expect(h.camera.zoom).toBe(31);
  });

  it('never zooms in, nor out past twice the view', async () => {
    const zooms: number[] = [];
    const h = web();
    h.gl.render.mockImplementation(() => void zooms.push(h.camera.zoom));
    await captureFrame(h.target, { ...request, widen: 0.5 }, h.deps);
    await captureFrame(h.target, { ...request, widen: 9 }, h.deps);
    expect(zooms).toEqual([31, 31, 15.5, 31]);
  });

  it('stays within the GPU’s texture limit and a pixel budget', async () => {
    const small = web({ maxTextureSize: 1024 });
    await captureFrame(small.target, request, small.deps);
    expect(small.gl.setSize.mock.calls[0]).toEqual([1024, 950, false]);
    expect(small.deps.makeCanvas).toHaveBeenCalledWith(1024, 479);

    const wide = web();
    await captureFrame(wide.target, { width: 6000, height: 2800 }, wide.deps);
    const [w, h] = wide.gl.setSize.mock.calls[0] as number[];
    expect(w * h).toBeLessThanOrEqual(4_000_000);
    expect(w / h).toBeCloseTo(332 / 308, 1);
  });

  it('puts the renderer back even when drawing throws, and answers null', async () => {
    const { target, deps, state, camera, gl } = web({
      render: (() => {
        let first = true;
        return () => {
          if (first) {
            first = false;
            throw new Error('context lost');
          }
        };
      })(),
    });
    expect(await captureFrame(target, request, deps)).toBeNull();
    expect(state).toEqual({ width: 332, height: 308, ratio: 1.25 });
    expect(camera.zoom).toBe(31);
    // The failed drawing, and the island drawn back.
    expect(gl.render).toHaveBeenCalledTimes(2);
  });

  it('answers null for a camera it can’t frame (not orthographic), without touching the renderer', async () => {
    const { target, deps, gl } = web({ camera: { isOrthographicCamera: false } });
    expect(await captureFrame(target, request, deps)).toBeNull();
    expect(gl.setSize).not.toHaveBeenCalled();
    expect(gl.render).not.toHaveBeenCalled();
  });

  it('answers null when the browser has no 2D canvas to copy into, or the encoder gives nothing', async () => {
    const none = web();
    (none.deps.makeCanvas as jest.Mock).mockImplementation(() => ({ width: 0, height: 0, getContext: () => null, toBlob: jest.fn() }));
    expect(await captureFrame(none.target, request, none.deps)).toBeNull();
    expect(none.gl.setSize).not.toHaveBeenCalled();

    const empty = web();
    empty.copy.toBlob.mockImplementation((callback: (blob: Blob | null) => void) => callback(null));
    expect(await captureFrame(empty.target, request, empty.deps)).toBeNull();
    expect(empty.deps.createObjectURL).not.toHaveBeenCalled();
  });
});

describe('where there is nothing to read', () => {
  it('answers null for a renderer that is neither a DOM canvas nor a phone’s GL view', async () => {
    const gl = { domElement: undefined, render: jest.fn(), getContext: () => undefined } as unknown as FrameTarget['gl'];
    expect(await captureFrame({ gl, scene: {}, camera: {} }, request, {})).toBeNull();
  });

  it('never throws, whatever it is given', async () => {
    expect(await captureFrame({ gl: null as never, scene: null, camera: null }, request)).toBeNull();
  });
});
