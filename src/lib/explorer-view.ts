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
  /**
   * Zoomed all the way in, the screen's shorter side spans this much water (units): close enough to
   * find the reef's small life (macro-life.ts), a nudibranch a sixth of a phone's width.
   */
  closest: 1.1,
  /** How much each zoom button press zooms (×), and a double tap. */
  step: 1.6, doubleTap: 2,
  /**
   * A tap is one finger, down no longer than `tapTime` (ms) and moving no farther than `tapSlop`
   * (points); a double tap is two taps at most `tapGap` ms apart and `tapNear` points from each
   * other. Fingers that pinch, drag or linger are never a tap, however quick.
   */
  tapTime: 300, tapSlop: 10, tapGap: 300, tapNear: 40,
  /**
   * How far past the zoom limits a pinch stretches (×, at most; out past the min, no farther than
   * the water still fills the screen). The zoom gives more slowly the farther past, and springs back
   * to the limit when the fingers lift.
   */
  stretch: 1.25,
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
  return { min, max: Math.max(min * 2, Math.min(w, h) / EXPLORER.closest), cover };
}

// Past a limit by `over` (log units), the zoom gives this much: as much at first, then less and less, never `most`; and back.
const give = (over: number, most: number) => most * over / (over + most);
const take = (given: number, most: number) => most * given / Math.max(1e-12, most - given);
/** How far a pinch may stretch past each end of the zoom range (log units). */
function stretchRoom(frame: ExplorerFrame) {
  const range = zoomRange(frame);
  return { range, over: Math.log(EXPLORER.stretch), under: Math.log(range.min / Math.max(range.min / EXPLORER.stretch, range.cover)) };
}

/**
 * The zoom shown for fingers that ask for `zoom` (points per unit, their spread with no limits): the
 * same inside the zoom range; past either end, stretching on with more and more resistance (to the
 * `stretch` at most), to spring back once they lift.
 */
export function stretchZoom(frame: ExplorerFrame, zoom: number) {
  const { range, over, under } = stretchRoom(frame);
  if (zoom > range.max) return range.max * Math.exp(give(Math.log(zoom / range.max), over));
  if (zoom < range.min) return range.min / Math.exp(give(Math.log(range.min / zoom), under));
  return zoom;
}

/** The zoom fingers ask for to see `zoom` (stretchZoom backwards): for a touch landing as the view springs back. */
function askedFor(frame: ExplorerFrame, zoom: number) {
  const { range, over, under } = stretchRoom(frame);
  if (zoom > range.max) return range.max * Math.exp(take(Math.log(zoom / range.max), over));
  if (zoom < range.min) return range.min / Math.exp(take(Math.log(range.min / zoom), under));
  return zoom;
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
 * to be seen at `zoom` (from their spread, stretched past the limits by stretchZoom). The view that
 * keeps the water that was under their middle under it at the new zoom, found in one go and only
 * then kept inside the limits for that zoom (moving first and zooming after, the limits of the old
 * zoom would stop a move the new zoom allows, and the water would slip).
 */
export function followFingers(frame: ExplorerFrame, view: ExplorerView, was: { x: number; y: number }, now: { x: number; y: number }, zoom = view.zoom): ExplorerView {
  const k = EXPLORER.depthStretch, limit = panLimit(frame, zoom);
  const spot = { x: view.x + was.x / view.zoom, z: view.z + was.y * k / view.zoom };
  return { x: clamp(spot.x - now.x / zoom, -limit.x, limit.x), z: clamp(spot.z - now.y * k / zoom, -limit.z, limit.z), zoom };
}

/** The fingers' middle and how far apart they are (their average distance from it). */
function hand(fingers: readonly Finger[]) {
  const x = fingers.reduce((sum, f) => sum + f.x, 0) / fingers.length, y = fingers.reduce((sum, f) => sum + f.y, 0) / fingers.length;
  return { x, y, spread: fingers.reduce((sum, f) => sum + Math.hypot(f.x - x, f.y - y), 0) / fingers.length };
}

/** A tap: where (points from the middle of the screen) and when (ms). */
type Tap = { t: number; x: number; y: number };

/**
 * The explorer's camera state, driven by the fingers and buttons and read by the camera every frame
 * (explorer-camera.tsx). The fingers move the view directly (`touch`, every time any finger moves,
 * lands or lifts): their middle drags the water and their spread zooms about it, so the water under
 * them stays under them, with one finger or five. Moves wait for the view to be read (by the next
 * frame), so fingers moved one at a time count as one move: on the web each finger's move comes as
 * an event of its own, and moved one at a time they could meet a limit halfway that moving them
 * together would not. When a finger lands or lifts the view doesn't move: it carries on from where
 * the fingers are then. Between the zoom limits the zoom is whatever the fingers make it; pinched
 * past one it stretches (stretchZoom) and springs back once they lift. Let go of a single finger
 * moving fast and the view glides on and slows. A double tap (two quick one-finger taps, told
 * apart from quick pinches here) zooms closer in on that spot. A button or a double tap eases to
 * its goal. `subscribe` hears the zoom when a move ends (and as the mouse wheel turns), so tap
 * targets follow it without re-drawing the island mid-gesture; `watch` hears every move, so a
 * scene that draws only on demand (reduced motion) redraws. Held still (reduced motion), buttons,
 * double taps and spring backs jump to their goal and nothing glides.
 */
export function createExplorer(initial: ExplorerFrame) {
  let frame = initial, sized = false, still = false;
  let view = overview(frame), goal: ExplorerView | null = null;
  let vx = 0, vz = 0, reported = view.zoom;
  // The fingers down now, whether this touch has had two at once, and where its middle was lately (for the release speed).
  let fingers: Finger[] = [], pinched = false, trail: { t: number; x: number; y: number }[] = [];
  // Where the same fingers have moved since the view was last read, and the zoom their spread asks for (with no limits).
  let pending: Finger[] | null = null, asked = view.zoom;
  // This touch as a tap (one finger that has barely moved: where and when it landed), and the last tap (where, and when it lifted).
  let tap: Tap | null = null, lastTap: Tap | null = null;
  const listeners = new Set<(zoom: number) => void>(), watchers = new Set<() => void>();
  const report = (force = false) => {
    if (!force && Math.abs(Math.log(view.zoom / reported)) < .1) return;
    reported = view.zoom;
    listeners.forEach((listener) => listener(view.zoom));
  };
  const moved = () => watchers.forEach((watcher) => watcher());
  const stop = () => { goal = null; vx = 0; vz = 0; };
  // Follow the fingers' moves since the view was last read, all at once.
  const settle = () => {
    if (!pending) return;
    const next = pending, before = new Map(fingers.map((f) => [f.id, f]));
    pending = null;
    const was = hand(next.map((f) => before.get(f.id)!)), now = hand(next);
    const pinching = next.length > 1 && was.spread >= EXPLORER.pinchFloor && now.spread >= EXPLORER.pinchFloor;
    if (pinching) asked *= now.spread / was.spread;
    view = followFingers(frame, view, was, now, pinching ? stretchZoom(frame, asked) : view.zoom);
    fingers = next;
  };
  // Ease to a view (or, held still, go straight there).
  const head = (next: ExplorerView) => {
    settle();
    vx = 0; vz = 0;
    if (still) { view = next; goal = null; report(true); } else goal = next;
    moved();
  };
  // A double tap: closer in on that spot, or all the way out again once as close as it goes.
  const toward = (fx: number, fy: number) => {
    settle();
    if ((goal ?? view).zoom >= zoomRange(frame).max * .98) head(overview(frame));
    else head(zoomAbout(frame, goal ?? view, EXPLORER.doubleTap, fx, fy));
  };
  // The last finger lifts at `time` (`lifted`: rather than the touch being taken away). A single finger still
  // moving fast glides on; pinched past a zoom limit, the view springs back to it; a second quick tap zooms in.
  const release = (time: number, lifted: boolean) => {
    const recent = trail.filter((p) => time - p.t <= EXPLORER.sample), end = trail[trail.length - 1];
    if (lifted && !still && !pinched && recent.length >= 2) {
      const first = recent[0], last = recent[recent.length - 1];
      // Over at least a frame's worth of time (touch events can arrive bunched together), and only if it hadn't stopped.
      const dt = Math.max(last.t - first.t, 50) / 1000, sx = (last.x - first.x) / dt, sy = (last.y - first.y) / dt, speed = Math.hypot(sx, sy);
      if (time - last.t < 80 && speed > EXPLORER.flick) {
        const cap = Math.min(1, EXPLORER.topSpeed / speed);
        vx = -sx * cap / view.zoom; vz = -sy * cap * EXPLORER.depthStretch / view.zoom;
      }
    }
    const tapped = lifted && tap && time - tap.t <= EXPLORER.tapTime ? tap : null, range = zoomRange(frame);
    fingers = []; trail = []; pinched = false; tap = null;
    // About the fingers' middle as they lifted, so what was between them stays put.
    if (view.zoom > range.max || view.zoom < range.min) head(zoomAbout(frame, view, 1, end?.x ?? 0, end?.y ?? 0));
    else { report(true); moved(); }
    if (!tapped) lastTap = null;
    else if (lastTap && tapped.t - lastTap.t <= EXPLORER.tapGap && Math.hypot(tapped.x - lastTap.x, tapped.y - lastTap.y) <= EXPLORER.tapNear) {
      toward(lastTap.x, lastTap.y);
      lastTap = null;
    } else lastTap = { t: time, x: tapped.x, y: tapped.y };
  };
  return {
    get view() { settle(); return view; },
    get frame() { return frame; },
    /** Whether the view is still moving on its own (an eased move or a glide), so the camera keeps drawing. */
    get moving() { return !!goal || vx !== 0 || vz !== 0; },
    /** The screen's size (and the island's level) changed. The first real size starts at the overview. */
    resize(next: ExplorerFrame) {
      settle();
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
      const ids = new Set(fingers.map((f) => f.id));
      if (fingers.length > 0 && next.length === fingers.length && next.every((f) => ids.has(f.id))) {
        // The same fingers moved: followed when the view is next read.
        pending = next.map((f) => ({ ...f }));
        if (tap && Math.hypot(next[0].x - tap.x, next[0].y - tap.y) > EXPLORER.tapSlop) tap = null;
        const now = hand(next);
        trail.push({ t: time, x: now.x, y: now.y });
        if (trail.length > 12) trail.shift();
        moved();
        return;
      }
      settle();
      if (next.length === 0) { if (fingers.length > 0) release(time, !cancelled); return; }
      // A new touch stops any glide or eased move (a spring back too) where it is.
      if (fingers.length === 0) {
        stop(); pinched = false; asked = askedFor(frame, view.zoom);
        tap = next.length === 1 ? { t: time, x: next[0].x, y: next[0].y } : null;
      } else tap = null;
      // A finger landed or lifted: the view carries on from here.
      if (next.length > 1) pinched = true;
      const now = hand(next);
      trail = [{ t: time, x: now.x, y: now.y }];
      fingers = next.map((f) => ({ ...f }));
    },
    /** Zoom by `factor` about a point at once (the mouse wheel; screen points from the middle). */
    zoomAt(factor: number, fx: number, fy: number) { settle(); stop(); view = zoomAbout(frame, view, factor, fx, fy); report(); moved(); },
    /** Ease the zoom by `factor` about a point (screen points from the middle). */
    zoomBy(factor: number, fx = 0, fy = 0) { settle(); head(zoomAbout(frame, goal ?? view, factor, fx, fy)); },
    /** As a double tap there: closer in on that spot, or all the way out again once as close as it goes. */
    zoomToward(fx: number, fy: number) { toward(fx, fy); },
    /** Ease out to the whole ocean. */
    showAll() { head(overview(frame)); },
    /** Ease over to a point on the water (x, z) and in to at least `zoom` (a reef creature's home tapped from afar). */
    focus(x: number, z: number, zoom: number) { settle(); head(clampView(frame, { x, z, zoom: Math.max(zoom, (goal ?? view).zoom) })); },
    /** Advance an eased move or a glide by `dt` seconds; the view to draw. */
    step(dt: number) {
      settle();
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
