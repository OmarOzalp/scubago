import { OCEAN } from './ocean';
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

export const EXPLORER = {
  /**
   * The camera looks down at an angle, so a drag up the screen covers this much more water than the
   * same drag sideways (the water's depth is foreshortened by the view).
   */
  depthStretch: Math.hypot(12.15, 6) / 12.15,
  /** Water kept in view beyond the swimming area (units), so an animal at its edge is in full view. */
  margin: .7,
  /** How close the water surface's own edge (OCEAN.waterExtent) may come to the screen's (units). */
  edge: .3,
  /** Zoomed all the way in, the screen's shorter side spans this much water (units): a clownfish fills a fifth of it. */
  closest: 2.2,
  /** How much each zoom button press zooms (×), and a double tap. */
  step: 1.6, doubleTap: 2,
  /** How quickly an eased move (a button, a double tap) settles, and a fling's glide slows (1/s). */
  ease: 6, friction: 3.2,
  /** The screen's top and bottom fade into haze over this much of the view (clip space): far less than on the Home card. */
  haze: [.88, 1.04] as const,
};

/** The swimming area at this level (half its width and depth, units), with a margin of water. */
function area(level: number) {
  const s = oceanScale(level);
  return { x: WORLD.x * s + EXPLORER.margin, z: WORLD.z * s + EXPLORER.margin };
}
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * How far out and in the explorer zooms (points per unit). Never so far out that the screen shows
 * past the water, nor farther than it takes to show the whole swimming area; all the way in, a
 * close look at the reef.
 */
export function zoomRange({ width, height, level }: ExplorerFrame) {
  const w = Math.max(1, width), h = Math.max(1, height), k = EXPLORER.depthStretch, water = OCEAN.waterExtent - EXPLORER.edge, a = area(level);
  const cover = Math.max(w / (2 * water), h * k / (2 * water));
  const whole = Math.min(w / (2 * a.x), h * k / (2 * a.z));
  const min = Math.max(cover, whole);
  return { min, max: Math.max(min * 1.5, Math.min(w, h) / EXPLORER.closest) };
}

/** How far the middle of the view may move from the island's (x, z) at this zoom: the view's edges stay in the swimming area. */
export function panLimit(frame: ExplorerFrame, zoom: number) {
  const a = area(frame.level), water = OCEAN.waterExtent - EXPLORER.edge;
  const halfX = frame.width / (2 * zoom), halfZ = frame.height * EXPLORER.depthStretch / (2 * zoom);
  return { x: Math.max(0, Math.min(a.x, water) - halfX), z: Math.max(0, Math.min(a.z, water) - halfZ) };
}

/** The nearest view inside the explorer's limits. */
export function clampView(frame: ExplorerFrame, view: ExplorerView): ExplorerView {
  const range = zoomRange(frame), zoom = clamp(view.zoom, range.min, range.max), limit = panLimit(frame, zoom);
  return { x: clamp(view.x, -limit.x, limit.x), z: clamp(view.z, -limit.z, limit.z), zoom };
}

/** The whole ocean: zoomed all the way out over the island. */
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
 * The explorer's camera state, driven by gestures and buttons and read by the camera every frame
 * (explorer-camera.tsx). Gestures move the view at once; a fling glides on and slows; a button or a
 * double tap eases to its goal. `subscribe` hears the zoom whenever it has changed by a tenth or
 * more (and when a gesture or a move ends), so tap targets can follow it without a render per frame;
 * `watch` hears every move, so a scene that draws only on demand (reduced motion) redraws. Held
 * still (reduced motion), buttons and double taps jump to their goal and a fling doesn't glide.
 */
export function createExplorer(initial: ExplorerFrame) {
  let frame = initial, sized = false, still = false;
  let view = overview(frame), goal: ExplorerView | null = null;
  let vx = 0, vz = 0, reported = view.zoom;
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
    /** Hold the view still (reduced motion): moves jump to their goal and flings don't glide. */
    holdStill(value: boolean) {
      still = value;
      if (still && goal) head(goal);
      if (still) { vx = 0; vz = 0; }
    },
    /** A finger comes down: any glide or eased move stops where it is. */
    grab: stop,
    pan(dx: number, dy: number) { view = panBy(frame, view, dx, dy); moved(); },
    pinch(factor: number, fx: number, fy: number) { view = zoomAbout(frame, view, factor, fx, fy); report(); moved(); },
    /** The finger lifts mid-drag at (vx, vy) points per second: the view glides on. */
    fling(speedX: number, speedY: number) {
      if (!still) { vx = -speedX / view.zoom; vz = -speedY * EXPLORER.depthStretch / view.zoom; }
      report(true);
      moved();
    },
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
        } else report();
      } else if (vx !== 0 || vz !== 0) {
        view = clampView(frame, { x: view.x + vx * t, z: view.z + vz * t, zoom: view.zoom });
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
    /** Hear every move the gestures and buttons make; returns the way to stop listening. */
    watch(watcher: () => void) {
      watchers.add(watcher);
      return () => { watchers.delete(watcher); };
    },
  };
}
export type Explorer = ReturnType<typeof createExplorer>;
