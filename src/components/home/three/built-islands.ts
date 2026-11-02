/**
 * The islands this app session has already built to the end (the coast, and what grows on and round it), by shores, level and quality tier. What an
 * island is made of is cached once built (geometry-cache.ts), so mounting one of them again costs next to nothing: it is simply there, all of it, where
 * an island new to the session is built in steps and shown whole (staging.tsx). Kept in memory for the session only: after a restart, the first
 * visit to each island is a new one again.
 */
const built = new Set<string>();

export const builtKey = (shores: string, level: number, quality: string) => `${shores}|${level}|${quality}`;
export const wasBuilt = (key: string) => built.has(key);
export const markBuilt = (key: string) => { built.add(key); };
/** Forget them all (the tests). */
export const forgetBuilt = () => built.clear();
