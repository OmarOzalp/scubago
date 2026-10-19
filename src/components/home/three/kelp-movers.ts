import { createContext } from 'react';
import { Vector4 } from 'three';

/** How many animals at once the kelp makes way for. */
export const KELP_MOVERS = 12;
/**
 * The animals swimming through the kelp, as a shader uniform: each one's middle (world x, y, z) and
 * how far round it the kelp makes way (w, units; 0 for an unused slot). The island's swimmers write it
 * every frame (marine-swimmers.tsx); the kelp bends away from them (kelp-forest.tsx).
 */
export type KelpMovers = { value: Vector4[] };
export const createKelpMovers = (): KelpMovers => ({ value: Array.from({ length: KELP_MOVERS }, () => new Vector4(0, -100, 0, 0)) });
/** The Kelp Forest island's movers, for its kelp and its swimmers; null at islands without kelp. */
export const KelpMoversContext = createContext<KelpMovers | null>(null);
