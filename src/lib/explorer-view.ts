import { oceanScale, WORLD } from './steering';

/**
 * The island explorer's camera (src/app/explore.tsx): the island camera's angle (SCENE_CAMERA in
 * sanctuary-scene.tsx, from (0, 12, 6) looking at (0, -.15, 0)), moved over the water and zoomed in
 * and out. A view is the point on the water in the middle of the screen (x, z) and the zoom, in
 * screen points per world unit.
 */
export type ExplorerView = { x: number; z: number; zoom: number };
/** The screen the explorer fills (points) and the island's level, whose ocean is the area to explore. */
export type ExplorerFrame = { width: number; height: number; level: number };
/** A finger on the screen: its own id, and where it is (points from the middle of the screen). */
export type Finger = { id: number; x: number; y: number };

export const EXPLORER = {
  /**
   * The camera looks down at an angle, so a drag up the screen covers this much more water than the
   * same drag sideways (the water's depth is foreshortened by the view).
   */
  depthStretch: Math.hypot(12.15, 6) / 12.15,
  /**
   * How far the explorer's water reaches from the island's middle (units, each way): far enough that
   * zoomed all the way out, a tall phone at the island's last level sees water to every edge. The
   * Home card's water stops at OCEAN.waterExtent, which its view never reaches past.
   */
  reach: 18,
  /** How close the water's own edge may come to the screen's (units). */
  edge: .3,
  /** All the way out, this much water shows around the swimming area (units), so every animal is in full view. */
  frame: .6,
  /** How far past the swimming area the view may roam (units, up to the water's edge). */
  margin: 2,
  /** Zoomed all the way in, the screen's shorter side spans this much water (units): an animal up close. */
  closest: 1.6,
  /** How much each zoom button press zooms (×), and a double tap. */
  step: 1.6, doubleTap: 2,
  /** How quickly an eased move (a button, a double tap) settles, and a fling's glide slows (1/s). */
  ease: 6, friction: 4.5,
  /** A finger lifting slower than this (points per second) just stops; faster ones glide on, up to the top speed. */
  flick: 250, topSpeed: 2500,
  /** The release speed is measured over the finger's last this many milliseconds, and only if it was still moving then. */
  sample: 100,
  /**
   * Fingers closer together than this (their average distance from their middle, points) only drag:
   * real fingers are never much closer, and at that size a tiny wobble is a big change in their
   * spread, which would snap the zoom.
   */
  pinchFloor: 12,
};

/** The swimming area at this level (half its width and depth, units), with `extra` water around it. */
function area(level: number, extra: number) {
  const s = oceanScale(level);
  return { x: WORLD.x * s + extra, z: WORLD.z * s + extra };
}
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
/** Now, in milliseconds (when the fingers moved, for the release speed). */
const clock = () => (typeof performance === 'undefined' ? Date.now() : performance.now());
const water = () => EXPLORER.reach - EXPLORER.edge;

/**
 * How far out and in the explorer zooms (points per unit). All the way out is where it opens: the
 * whole swimming area in view, every animal on screen, and water to every edge. All the way in, a
 * close look at the animals and the reef.
 */
export function zoomRange({ width, height, level }: ExplorerFrame) {
  const w = Math.max(1, width), h = Math.max(1, height), k = EXPLORER.depthStretch, a = area(level, EXPLORER.frame);
  const whole = Math.min(w / (2 * a.x), h * k / (2 * a.z));
  const cover = Math.max(w / (2 * water()), h * k / (2 * water()));
  const min = Math.max(whole, cover);
  return { min, max: Math.max(min * 2, Math.min(w, h) / EXPLORER.closest) };
}

/** How far the middle of the view may move from the island's (x, z) at this zoom: the view's edges stay near the swimming area, inside the water. */
export function panLimit(frame: ExplorerFrame, zoom: number) {
  const a = area(frame.level, EXPLORER.margin);
  const halfX = frame.width / (2 * zoom), halfZ = frame.height * EXPLORER.depthStretch / (2 * zoom);
  return { x: Math.max(0, Math.min(a.x, water()) - halfX), z: Math.max(0, Math.min(a.z, water()) - halfZ) };
}

/** The nearest view inside the explorer's limits. */
export function clampView(frame: ExplorerFrame, view: ExplorerView): ExplorerView {
  const range = zoomRange(frame), zoom = clamp(view.zoom, range.min, range.max), limit = panLimit(frame, zoom);
  return { x: clamp(view.x, -limit.x, limit.x), z: clamp(view.z, -limit.z, limit.z), zoom };
}

/** The whole ocean, zoomed all the way out over the island: where the explorer opens, and goes back to. */
export const overview = (frame: ExplorerFrame): ExplorerView => clampView(frame, { x: 0, z: 0, zoom: 0 });

/** Drag the water by (dx, dy) screen points: the spot under the finger stays under it. */
export function panBy(frame: ExplorerFrame, view: ExplorerView, dx: number, dy: number): ExplorerView {
  return clampView(frame, { x: view.x - dx / view.zoom, z: view.z - dy * EXPLORER.depthStretch / view.zoom, zoom: view.zoom });
}

/** Zoom by `factor` about a point (fx, fy screen points from the middle of the view): the spot under it stays put. */
export function zoomAbout(frame: ExplorerFrame, view: ExplorerView, factor: number, fx: number, fy: number): ExplorerView {
  const range = zoomRange(frame), zoom = clamp(view.zoom * factor, range.min, range.max), shift = 1 / view.zoom - 1 / zoom;
  return clampView(frame, { x: view.x + fx * shift, z: view.z + fy * EXPLORER.depthStretch * shift, zoom });
}

/**
 * The fingers moved: their middle from `was` to `now` (screen points from the middle of the view),
 * their spread by `factor`. The view that keeps the water that was under their middle under it at the
 * new zoom, found in one go and only then kept inside the limits (moving first and zooming after, the
 * limits of the old zoom would stop a move the new zoom allows, and the water would slip).
 */
export function followFingers(frame: ExplorerFrame, view: ExplorerView, was: { x: number; y: number }, now: { x: number; y: number }, factor = 1): ExplorerView {
  const range = zoomRange(frame), zoom = clamp(view.zoom * factor, range.min, range.max), k = EXPLORER.depthStretch;
  const spot = { x: view.x + was.x / view.zoom, z: view.z + was.y * k / view.zoom };
  return clampView(frame, { x: spot.x - now.x / zoom, z: spot.z - now.y * k / zoom, zoom });
}

/** The fingers' middle and how far apart they are (their average distance from it). */
function hand(fingers: readonly Finger[]) {
  const x = fingers.reduce((sum, f) => sum + f.x, 0) / fingers.length, y = fingers.reduce((sum, f) => sum + f.y, 0) / fingers.length;
  return { x, y, spread: fingers.reduce((sum, f) => sum + Math.hypot(f.x - x, f.y - y), 0) / fingers.length };
}

/**
 * The explorer's camera state, driven by the fingers and buttons and read by the camera every frame
 * (explorer-camera.tsx). The fingers move the view directly (`touch`, every time any finger moves,
 * lands or lifts): their middle drags the water and their spread zooms about it, so the water under
 * them stays under them, with one finger or five. When a finger lands or lifts the view doesn't
 * move: it carries on from where the fingers are then. Let go of a single finger moving fast and the
 * view glides on and slows. A button or a double tap eases to its goal. `subscribe` hears the zoom
 * when a move ends (and as the mouse wheel turns), so tap targets follow it without re-drawing the
 * island mid-gesture; `watch` hears every move, so a scene that draws only on demand (reduced motion)
 * redraws. Held still (reduced motion), buttons and double taps jump to their goal and nothing glides.
 */
export function createExplorer(initial: ExplorerFrame) {
  let frame = initial, sized = false, still = false;
  let view = overview(frame), goal: ExplorerView | null = null;
  let vx = 0, vz = 0, reported = view.zoom;
  // The fingers down now, whether this touch has had two at once, and where its middle was lately (for the release speed).
  let fingers: Finger[] = [], pinched = false, trail: { t: number; x: number; y: number }[] = [];
  const listeners = new Set<(zoom: number) => void>(), watchers = new Set<() => void>();
  const report = (force = false) => {
    if (!force && Math.abs(Math.log(view.zoom / reported)) < .1) return;
    reported = view.zoom;
    listeners.forEach((listener) => listener(view.zoom));
  };
  const moved = () => watchers.forEach((watcher) => watcher());
  const stop = () => { goal = null; vx = 0; vz = 0; };
  // Ease to a view (or, held still, go straight there).
  const head = (next: ExplorerView) => {
    vx = 0; vz = 0;
    if (still) { view = next; goal = null; report(true); } else goal = next;
    moved();
  };
  // The last finger lifts at `time`: a single finger still moving fast glides on.
  const release = (time: number, glide: boolean) => {
    const recent = trail.filter((p) => time - p.t <= EXPLORER.sample);
    if (glide && !still && !pinched && recent.length >= 2) {
      const first = recent[0], last = recent[recent.length - 1];
      // Over at least a frame's worth of time (touch events can arrive bunched together), and only if it hadn't stopped.
      const dt = Math.max(last.t - first.t, 50) / 1000, sx = (last.x - first.x) / dt, sy = (last.y - first.y) / dt, speed = Math.hypot(sx, sy);
      if (time - last.t < 80 && speed > EXPLORER.flick) {
        const cap = Math.min(1, EXPLORER.topSpeed / speed);
        vx = -sx * cap / view.zoom; vz = -sy * cap * EXPLORER.depthStretch / view.zoom;
      }
    }
    fingers = []; trail = []; pinched = false;
    report(true);
    moved();
  };
  return {
    get view() { return view; },
    get frame() { return frame; },
    /** Whether the view is still moving on its own (an eased move or a glide), so the camera keeps drawing. */
    get moving() { return !!goal || vx !== 0 || vz !== 0; },
    /** The screen's size (and the island's level) changed. The first real size starts at the overview. */
    resize(next: ExplorerFrame) {
      frame = next;
      view = sized ? clampView(frame, view) : overview(frame);
      if (goal) goal = clampView(frame, goal);
      sized = true;
      report(true);
      moved();
    },
    /** Hold the view still (reduced motion): moves jump to their goal and nothing glides. */
    holdStill(value: boolean) {
      still = value;
      if (still && goal) head(goal);
      if (still) { vx = 0; vz = 0; }
    },
    /**
     * The fingers down now (none once the last lifts), at `time` (ms, now unless given). With the same
     * fingers as last time, the view follows them; when one lands or lifts, it carries on from there
     * without a jump. `cancelled`: the touch was taken away (by the system), so nothing glides.
     */
    touch(next: readonly Finger[], time = clock(), cancelled = false) {
      if (next.length === 0) { if (fingers.length > 0) release(time, !cancelled); return; }
      // A new touch stops any glide or eased move where it is.
      if (fingers.length === 0) { stop(); pinched = false; trail = []; }
      const before = new Map(fingers.map((f) => [f.id, f]));
      const same = next.length === fingers.length && next.every((f) => before.has(f.id));
      const now = hand(next);
      if (same) {
        const was = hand(next.map((f) => before.get(f.id)!));
        const pinching = next.length > 1 && was.spread >= EXPLORER.pinchFloor && now.spread >= EXPLORER.pinchFloor;
        view = followFingers(frame, view, was, now, pinching ? now.spread / was.spread : 1);
        moved();
      } else trail = [];
      if (next.length > 1) pinched = true;
      trail.push({ t: time, x: now.x, y: now.y });
      if (trail.length > 12) trail.shift();
      fingers = next.map((f) => ({ ...f }));
    },
    /** Zoom by `factor` about a point at once (the mouse wheel; screen points from the middle). */
    zoomAt(factor: number, fx: number, fy: number) { stop(); view = zoomAbout(frame, view, factor, fx, fy); report(); moved(); },
    /** Ease the zoom by `factor` about a point (screen points from the middle). */
    zoomBy(factor: number, fx = 0, fy = 0) { head(zoomAbout(frame, goal ?? view, factor, fx, fy)); },
    /** A double tap: closer in on that spot, or all the way out again once as close as it goes. */
    zoomToward(fx: number, fy: number) {
      if ((goal ?? view).zoom >= zoomRange(frame).max * .98) this.showAll();
      else this.zoomBy(EXPLORER.doubleTap, fx, fy);
    },
    /** Ease out to the whole ocean. */
    showAll() { head(overview(frame)); },
    /** Advance an eased move or a glide by `dt` seconds; the view to draw. */
    step(dt: number) {
      const t = Math.max(0, Math.min(dt, .1));
      if (goal) {
        const k = 1 - Math.exp(-EXPLORER.ease * t);
        const zoom = Math.exp(Math.log(view.zoom) + (Math.log(goal.zoom) - Math.log(view.zoom)) * k);
        view = { x: view.x + (goal.x - view.x) * k, z: view.z + (goal.z - view.z) * k, zoom };
        if (Math.abs(Math.log(goal.zoom / view.zoom)) < .002 && Math.hypot(goal.x - view.x, goal.z - view.z) < .002) {
          view = goal; goal = null;
          report(true);
        }
      } else if (vx !== 0 || vz !== 0) {
        const before = view;
        view = clampView(frame, { x: view.x + vx * t, z: view.z + vz * t, zoom: view.zoom });
        // A glide stops at the edge of the area rather than pressing against it.
        if (view.x !== before.x + vx * t) vx = 0;
        if (view.z !== before.z + vz * t) vz = 0;
        const slow = Math.exp(-EXPLORER.friction * t);
        vx *= slow; vz *= slow;
        if (Math.hypot(vx, vz) * view.zoom < 4) { vx = 0; vz = 0; }
      }
      return view;
    },
    /** Hear the zoom as it changes; returns the way to stop listening. */
    subscribe(listener: (zoom: number) => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    /** Hear every move the fingers and buttons make; returns the way to stop listening. */
    watch(watcher: () => void) {
      watchers.add(watcher);
      return () => { watchers.delete(watcher); };
    },
  };
}
export type Explorer = ReturnType<typeof createExplorer>;
