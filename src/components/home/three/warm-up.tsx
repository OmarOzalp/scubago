import { useLayoutEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { Camera, Group, Scene, Texture, WebGLRenderer } from 'three';
import type { Habitat } from '@/lib/home';
import { OCEAN_REGIONS } from '@/lib/seabed-depth';
import type { OceanUniforms } from './ocean-mesh';
import type { SceneQuality } from './scene-quality';
import { kindsFor, type WarmKind } from './warm-kinds';
import { buildSpecimens, offscreen } from './warm-specimens';

export { kindsFor, type WarmKind };

/** What a warm-up is told about the scene it is for (see `warmUp`). */
export type WarmUpOptions = {
  /** The scene's water uniforms (the OceanContext's): shared with the stand-ins. Defaults to a fresh set (the programs are the same). */
  ocean?: OceanUniforms;
  /** The quality the scene draws at (scene-quality.ts): full unless the scene runs on an emulated GPU. */
  quality?: SceneQuality;
  /**
   * How many waters the ocean's depth field blends (`field.habitats.length`: 1 on Home's card, one for each different shore in the explorer). Defaults to the
   * number of different `habitats` (the explorer's); give 1 for Home's card even when warming every habitat there, as the card's ocean has one island's water.
   */
  waters?: number;
  /** The islands' shores the scene will have (what each needs differs): all of them if the scene may show any. */
  habitats?: readonly Habitat[];
  /** Whether the tuna school swims here. */
  school?: boolean;
  /** Exactly these kinds, instead of those the habitats bring. */
  kinds?: readonly WarmKind[];
  /**
   * Also draw every stand-in once now, outside the view, so that a driver that only finishes a program when it first draws with it (an emulated or a
   * tile-based GPU often does) has done so. Default no: drawing makes three.js ask the driver how each program went (JavaScript waits for the GL thread
   * until it has built it), so this call would wait for every program; `drawWarmed` does one kind at a time instead (the `<WarmUp />` component, by default,
   * one for each frame). Nothing is cleared and everything is clipped away, so no pixel changes.
   */
  draw?: boolean;
};

export type WarmUpResult = {
  /** The kinds linked by this call (those a call before it did are not done again). */
  kinds: WarmKind[];
  /** Programs the renderer holds after this call, and how many this call added. */
  programs: number; added: number;
  /** Textures handed to the GL context (those of the ocean uniforms that already exist). */
  textures: number;
  /** JavaScript time this call took (the GL thread's linking is not in it). */
  ms: number;
};

/** What a renderer has been warmed with: the kinds, the stand-ins (which must stay alive to keep their programs), and those not drawn yet. */
const warmed = new WeakMap<WebGLRenderer, { kinds: Set<WarmKind>; keep: Group[]; pending: { kind: WarmKind; group: Group }[] }>();

/** Which kinds have been warmed on this renderer. */
export const warmedKinds = (renderer: WebGLRenderer): ReadonlySet<WarmKind> => warmed.get(renderer)?.kinds ?? new Set();

/**
 * Uploads to the GL context every texture among the ocean's uniforms (the depth map, the regions, the lite map) that has been made, so the
 * first frame that samples them does not. Textures made later are left to the first draw (call again once they exist).
 */
export function warmTextures(renderer: WebGLRenderer, ocean: OceanUniforms): number {
  let uploaded = 0;
  for (const uniform of Object.values(ocean) as { value?: unknown }[]) {
    const value = uniform?.value as Texture | null | undefined;
    if (value && (value as { isTexture?: boolean }).isTexture) { renderer.initTexture(value); uploaded++; }
  }
  return uploaded;
}

/**
 * Warm-up: links the shader programs a scene is about to need, and uploads its textures, before the first frame that draws them.
 *
 * three.js links a program the first time something that needs it is drawn, and (on a phone, where GL runs on its own thread and
 * JavaScript waits for it to answer) the frame that does it stops until the program is built: the animals' and the coasts' are the biggest
 * shaders in the app, tens to hundreds of milliseconds each on the GL thread, and a scene that is built in steps meets one with nearly every
 * step: a new island's coast, the forest, the first animal. `warmUp` hands them all to the GL thread in one go and returns at once: it does
 * not wait for them, so what the scene does next (building its islands, in JavaScript) goes on while the GL thread links, and by the time
 * something is drawn its program is there and the frame does not stop. A driver that only finishes a program at its first draw (an emulated
 * or tile-based GPU often does: this machine's software GL, in a browser, is one) is helped by drawing each stand-in once outside the view: the
 * `<WarmUp />` component does that, a kind a frame (each draw waits for its program, so not all in one go); `draw: true` does them all now.
 *
 * What it links is made with the scene's own material code (warm-specimens.ts), each kind once for the life of the renderer, and kept for
 * as long as the renderer lives so the scene's own materials find their programs ready. A program is found by its code and its settings
 * (the number of lights, the renderer's colour space, whether it is skinned, flat-shaded, two-sided...), so call it with the scene the lights
 * are in, once its lights have mounted (a layout effect of the canvas's children is late enough), and with the quality the scene draws.
 *
 * Where to call it: in each canvas that will draw islands, as it mounts: `<WarmUp habitats={...} />` inside the `<Canvas>` (after the
 * environment, so its lights are in the scene). Home's canvas keeps its programs across islands (ProgramKeeper), so there it needs to run once, at
 * start, with every habitat the collection has (and `waters={1}`): a first visit to an island then links nothing (measured on the web: the two programs
 * of a first visit to the Kelp Forest, 0.4-0.9 s of the main thread waiting, are gone). The explorer's canvas is a GL context of its own (programs are
 * not shared between contexts), so it links its programs afresh at every open: start there as early as the canvas exists (under the picture that
 * stands in for the scene), but with the habitats of the islands in view only. Every kind is a program to build, and one the opening view does not
 * need (the kelp's, the steam's) only delays the ones it does (measured in a browser's software GL, warming all five islands' kinds at the open took
 * longer to settle than not warming): warm the others when the scene is built and idle, by calling it again with more habitats (it does only the kinds not
 * done yet).
 *
 * It never throws: a scene that cannot warm up just links its programs when it draws, as it always did.
 */
export function warmUp(renderer: WebGLRenderer, scene: Scene, camera: Camera, options: WarmUpOptions = {}): WarmUpResult {
  const started = performance.now();
  const before = renderer.info.programs?.length ?? 0;
  const record = warmed.get(renderer) ?? { kinds: new Set<WarmKind>(), keep: [], pending: [] };
  warmed.set(renderer, record);
  const wanted = options.kinds ?? kindsFor(options.habitats ?? [], options.school);
  const todo = wanted.filter((kind) => !record.kinds.has(kind));
  let textures = 0;
  try {
    if (todo.length > 0) {
      const groups = buildSpecimens(todo, { ocean: options.ocean, lite: options.quality === 'lite', waters: options.waters ?? Math.min(OCEAN_REGIONS, new Set(options.habitats ?? []).size) });
      for (const [kind, group] of groups) {
        // (the stand-ins' materials are kept: a program is freed with the last material that uses it)
        record.keep.push(group);
        renderer.compile(group, camera, scene);
        record.kinds.add(kind);
        record.pending.push({ kind, group });
      }
      if (options.draw) while (drawWarmed(renderer, scene, camera) !== null);
    }
    if (options.ocean) textures = warmTextures(renderer, options.ocean);
  } catch {
    // A scene that cannot warm up links its programs as it draws.
  }
  return { kinds: todo.filter((kind) => record.kinds.has(kind)), programs: renderer.info.programs?.length ?? 0, added: (renderer.info.programs?.length ?? 0) - before, textures, ms: performance.now() - started };
}

/**
 * Draws the next kind of stand-in that has been compiled but not yet drawn, once, outside the view (nothing is cleared; everything is clipped away): for a
 * driver that finishes a program only when it first draws with it. One kind takes one program's wait at most (the others are already building on the
 * GL thread), so call it once a frame rather than all at once. Returns the kind drawn, or null when none is left.
 */
export function drawWarmed(renderer: WebGLRenderer, scene: Scene, camera: Camera): WarmKind | null {
  const record = warmed.get(renderer), next = record?.pending.shift();
  if (!next) return null;
  const held = renderer.autoClear;
  renderer.autoClear = false;
  try { renderer.render(offscreen(scene, next.group), camera); } catch { /* it will be drawn for real when its turn comes */ } finally { renderer.autoClear = held; }
  return next.kind;
}

/**
 * The next kind the options' habitats bring that has not been done on this renderer, linked and drawn now (one kind, so no frame has more than one program to
 * wait for); null when there is none left. What a paced `<WarmUp />` does each frame.
 */
export function warmNext(renderer: WebGLRenderer, scene: Scene, camera: Camera, options: WarmUpOptions = {}): WarmKind | null {
  const done = warmedKinds(renderer), next = kindsFor(options.habitats ?? [], options.school).find((kind) => !done.has(kind));
  if (!next) return null;
  warmUp(renderer, scene, camera, { ...options, kinds: [next] });
  drawWarmed(renderer, scene, camera);
  return next;
}

/**
 * Inside a `<Canvas>`: warms the renderer up (see `warmUp`) once, as the canvas mounts, with the canvas's own renderer, scene and camera. Put it
 * after the scene's lights in the tree. Renders nothing.
 */
export function WarmUp({ spread = true, paced = false, paused, ...options }: WarmUpOptions & {
  /** Draw the stand-ins one kind a frame, after the programs are queued (default), so a driver that builds a program at its first draw has done so before the scene needs it. */
  spread?: boolean;
  /**
   * Do everything a kind a frame, queueing as well as drawing (default: queue them all as the canvas mounts, draw a kind a frame): each frame links the next kind
   * the habitats bring that has not been done, so no frame has more than one program to wait for.
   */
  paced?: boolean;
  /** (paced) Whether to leave it for now (a finger is down, the camera is easing): nothing is linked in a frame it answers true. */
  paused?: () => boolean;
}) {
  const gl = useThree((state) => state.gl), scene = useThree((state) => state.scene), camera = useThree((state) => state.camera);
  // (once for the canvas: the options are read as it mounts; warmUp itself does nothing for kinds it has already done)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => { if (!paced) warmUp(gl, scene, camera, options); }, [gl, scene, camera]);
  // Before the frame's own drawing (never a positive priority: that would take the drawing over): the next kind, if any is waiting.
  useFrame(() => {
    if (paced) {
      if (paused?.()) return;
      warmNext(gl, scene, camera, options);
      return;
    }
    if (spread) drawWarmed(gl, scene, camera);
  }, -500);
  return null;
}
