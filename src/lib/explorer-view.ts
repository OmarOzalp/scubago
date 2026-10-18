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

/**
 * How much water the Home card shows across its shorter side at the first level (units): the
 * swimming area and a little more. SceneCamera frames the card with it; the explorer opens the same.
 */
export const CARD_SPAN = 10.8;

export const EXPLORER = {
  /**
   * The camera looks down at an angle, so a drag up the screen covers this much more water than the
   * same drag sideways (the water's depth is foreshortened by the view).
   */
  depthStretch: Math.hypot(12.15, 6) / 12.15,
  /**
   * How far past the swimming area the view may roam (units, up to the water's own edge): an animal
   * at its edge is in full view, and a tall screen zoomed in a little can still move up and down.
   */
  margin: 2,
  /** How close the water surface's own edge (OCEAN.waterExtent) may come to the screen's sides (units). */
  edge: .3,
  /** All the way out, this much of the Home card's zoom: a little more ocean around the island than the card shows. */
  furthest: .7,
  /** Zoomed all the way in, the screen's shorter side spans this much water (units): a clownfish fills a fifth of it. */
  closest: 2.2,
  /** How much each zoom button press zooms (×), and a double tap. */
  step: 1.6, doubleTap: 2,
  /** How quickly an eased move (a button, a double tap) settles, and a fling's glide slows (1/s). */
  ease: 6, friction: 4.5,
  /** A finger lifting slower than this (points per second) just stops; faster ones glide on, up to the top speed. */
  flick: 250, topSpeed: 2500,
  /**
   * The screen's top and bottom fade into haze over this much of the view (clip space): far less than
   * on the Home card. Zoomed out, a tall screen sees past the water's near and far edges, and the
   * haze comes in to meet them (hazeFor).
   */
  haze: [.88, 1.04] as const,
};

/** The swimming area at this level (half its width and depth, units), with a margin of water. */
function area(level: number) {
  const s = oceanScale(level);
  return { x: WORLD.x * s + EXPLORER.margin, z: WORLD.z * s + EXPLORER.margin };
}
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * How far out and in the explorer zooms (points per unit), and where it starts. It starts as the
 * Home card frames the island (the swimming area across the shorter side), so opening it doesn't
 * jump; it zooms out a little further (never so far the sides show past the water), and all the way
 * in, to a close look at the reef.
 */
export function zoomRange({ width, height, level }: ExplorerFrame) {
  const w = Math.max(1, width), h = Math.max(1, height), water = OCEAN.waterExtent - EXPLORER.edge;
  const card = Math.min(w, h) / (CARD_SPAN * oceanScale(level));
  const min = Math.max(w / (2 * water), card * EXPLORER.furthest);
  const start = Math.max(min, card);
  return { min, start, max: Math.max(start * 1.5, Math.min(w, h) / EXPLORER.closest) };
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

/** The whole ocean, as the Home card shows it: where the explorer opens, and goes back to. */
export const overview = (frame: ExplorerFrame): ExplorerView => clampView(frame, { x: 0, z: 0, zoom: zoomRange(frame).start });

/**
 * Where the screen's top and bottom haze begins and ends (clip space) at this view: thin, unless
 * the water's near or far edge is on screen, when the haze is complete just before it, so the view
 * fades into the Home card's water color (the scene's background) rather than ending in a line.
 */
export function hazeFor({ height }: ExplorerFrame, view: ExplorerView): readonly [number, number] {
  const edge = (OCEAN.waterExtent - Math.abs(view.z)) * view.zoom / EXPLORER.depthStretch / (Math.max(1, height) / 2);
  const [from, to] = EXPLORER.haze, end = Math.min(to, edge - .04);
  // The nearer the edge comes, the wider the fade (from the usual band to .3 of the view's half), never with a jump.
  const width = (to - from) + (.3 - (to - from)) * clamp((to - end) / .2, 0, 1);
  return [Math.min(from, end - width), end];
}

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
 * (explorer-camera.tsx). One finger drags the view (`pan`) and, let go fast, glides on and slows;
 * two fingers pinch (`pinchStart`, `pinch`, `pinchEnd`), which both zooms about them and moves with
 * them, so the two never fight; a button or a double tap eases to its goal. `subscribe` hears the
 * zoom whenever it has changed by a tenth or more (and when a gesture or a move ends), so tap
 * targets can follow it without a render per frame; `watch` hears every move, so a scene that draws
 * only on demand (reduced motion) redraws. Held still (reduced motion), buttons and double taps jump
 * to their goal and a fling doesn't glide.
 */
export function createExplorer(initial: ExplorerFrame) {
  let frame = initial, sized = false, still = false;
  let view = overview(frame), goal: ExplorerView | null = null;
  let vx = 0, vz = 0, reported = view.zoom;
  // The pinch under way: where the fingers' middle was and how many fingers, and whether this touch pinched at all.
  let pinching = false, pinched = false, focal: readonly [number, number] | null = null, fingers = 0, skip = false;
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
    /** A finger comes down: any glide or eased move stops where it is, and the touch starts afresh. */
    grab() { stop(); pinched = false; skip = false; },
    /** One finger drags the water by (dx, dy) points. While two fingers pinch, the pinch moves the view instead. */
    pan(dx: number, dy: number) {
      if (pinching) return;
      // Just after a pinch, the finger left down may jump as the other lifts: start again from it.
      if (skip) { skip = false; return; }
      view = panBy(frame, view, dx, dy);
      moved();
    },
    /** The drag ends with the finger moving at (vx, vy) points per second: fast, the view glides on; slow, or after a pinch, it stays. */
    fling(speedX: number, speedY: number) {
      const speed = Math.hypot(speedX, speedY);
      if (!still && !pinched && !pinching && speed > EXPLORER.flick) {
        const cap = Math.min(1, EXPLORER.topSpeed / speed);
        vx = -speedX * cap / view.zoom; vz = -speedY * cap * EXPLORER.depthStretch / view.zoom;
      }
      pinched = false;
      report(true);
      moved();
    },
    /** Two fingers start to pinch. */
    pinchStart() { stop(); pinching = true; pinched = true; focal = null; },
    /**
     * The pinch goes on: the fingers have spread by `factor` (shrunk, under 1), their middle now
     * (fx, fy) points from the screen's. The view moves with the middle and zooms about it, so the
     * water under the fingers stays under them. When a finger comes or goes the middle jumps, so the
     * move starts again from there.
     */
    pinch(factor: number, fx: number, fy: number, pointers = 2) {
      if (focal && pointers === fingers) view = panBy(frame, view, fx - focal[0], fy - focal[1]);
      focal = [fx, fy]; fingers = pointers;
      view = zoomAbout(frame, view, factor, fx, fy);
      report();
      moved();
    },
    pinchEnd() {
      if (pinching) skip = true;
      pinching = false; focal = null;
      report(true);
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
        } else report();
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
    /** Hear every move the gestures and buttons make; returns the way to stop listening. */
    watch(watcher: () => void) {
      watchers.add(watcher);
      return () => { watchers.delete(watcher); };
    },
  };
}
export type Explorer = ReturnType<typeof createExplorer>;
