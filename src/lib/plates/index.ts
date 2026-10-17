/**
 * The engraved species plates, as the app uses them: one drawing per species, built once and kept,
 * then drawn for each size and state it is shown at. Building a plate takes a few milliseconds on
 * a desktop and several times that on a phone, so screens ask for plates through `requestPlate`,
 * which works through the queue a little at a time between frames instead of all at once.
 */
import { drawPlate, fit, PAPER, type PlateDrawing } from './render';
import { PLATES } from './registry';
import type { PlateGeom } from './types';

export { PAPER, PLATE_BOX, type PlateDrawing, type PlateShape } from './render';

const geoms = new Map<string, PlateGeom>();
const drawings = new Map<string, PlateDrawing>();
const MAX_DRAWINGS = 400;

/** Whether a species has its own plate (custom species added by divers do not). */
export const hasPlate = (id: string): boolean => id in PLATES;

export interface PlateOptions {
  /** Width it is shown at, in points: decides line weights and how much fine detail to keep. */
  width: number;
  /** false: a dashed pencil outline (a species still to find). */
  found?: boolean;
  /** The paper behind a pencil outline. Found plates are always tinted against the plate paper. */
  paper?: string;
}

const keyOf = (id: string, o: PlateOptions) => `${id}|${Math.round(o.width)}|${o.found === false ? 0 : 1}|${o.found === false ? (o.paper ?? PAPER) : ''}`;

/** A plate already drawn for these options, or undefined. */
export function cachedPlate(id: string, o: PlateOptions): PlateDrawing | undefined {
  return drawings.get(keyOf(id, o));
}

/** The plate drawn for these options (built now if need be), or null for a species without one. */
export function plateDrawing(id: string, o: PlateOptions): PlateDrawing | null {
  const def = PLATES[id];
  if (!def) return null;
  const key = keyOf(id, o);
  const hit = drawings.get(key);
  if (hit) return hit;
  let g = geoms.get(id);
  if (!g) {
    g = fit(def.build());
    geoms.set(id, g);
  }
  const d = drawPlate(g, def.palette, { width: Math.round(o.width), found: o.found !== false, paper: o.found === false ? (o.paper ?? PAPER) : PAPER });
  if (drawings.size >= MAX_DRAWINGS) drawings.delete(drawings.keys().next().value as string);
  drawings.set(key, d);
  return d;
}

// The queue: requests are drawn in turn, a few milliseconds' worth per tick.
type Job = { id: string; o: PlateOptions; done: (d: PlateDrawing | null) => void; cancelled: boolean };
const queue: Job[] = [];
let ticking = false;
const BUDGET_MS = 8;

function tick() {
  const start = Date.now();
  while (queue.length && Date.now() - start < BUDGET_MS) {
    const job = queue.shift()!;
    if (job.cancelled) continue;
    job.done(plateDrawing(job.id, job.o));
  }
  if (queue.length) setTimeout(tick, 0);
  else ticking = false;
}

/**
 * Asks for a plate without holding up the screen: `done` is called with the drawing once it is
 * ready (straight away if it already is). Returns a function that cancels the request.
 */
export function requestPlate(id: string, o: PlateOptions, done: (d: PlateDrawing | null) => void): () => void {
  const hit = cachedPlate(id, o);
  if (hit || !hasPlate(id)) {
    done(hit ?? null);
    return () => {};
  }
  const job: Job = { id, o, done, cancelled: false };
  queue.push(job);
  if (!ticking) {
    ticking = true;
    setTimeout(tick, 0);
  }
  return () => {
    job.cancelled = true;
  };
}
