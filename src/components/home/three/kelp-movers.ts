import { createContext } from 'react';
import { Vector4 } from 'three';

/** How many animals at once the kelp makes way for. */
export const KELP_MOVERS = 12;
/**
 * The animals swimming through the kelp, as a shader uniform: each one's body as a capsule along its
 * heading, in two entries: its middle (x, y, z, in the island's frame) and girth (w, units; 0 for an
 * unused slot), then which way it points (x, z, a unit vector) and half its length. The island's
 * swimmers write it every frame (marine-swimmers.tsx); the kelp is pushed just clear of each body,
 * so a long whale parts it along its length rather than shoving everything round its middle
 * (kelp-forest.tsx).
 */
export type KelpMovers = { value: Vector4[] };
export const createKelpMovers = (): KelpMovers => ({ value: Array.from({ length: KELP_MOVERS * 2 }, (_, i) => new Vector4(0, i % 2 ? 0 : -100, 0, 0)) });
/** One animal in a slot: its middle, heading (radians, as its pose's), half its length and its girth (0 empties the slot). */
export function setKelpMover(movers: KelpMovers, slot: number, x: number, y: number, z: number, heading: number, halfLength: number, girth: number) {
  movers.value[slot * 2].set(x, y, z, girth);
  movers.value[slot * 2 + 1].set(Math.sin(heading), Math.cos(heading), halfLength, 0);
}
/** The Kelp Forest island's movers, for its kelp and its swimmers; null at islands without kelp. */
export const KelpMoversContext = createContext<KelpMovers | null>(null);
