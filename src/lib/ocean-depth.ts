/** World height the animals swim around while up in the water (their motion adds each one's own offset). */
export const SWIM_LEVEL = -.92;
/** How much deeper the bottom of a dive is (units). */
const DIVE_DEPTH = 1.65;

/** Seconds from one dive to the next. */
export const DIVE_CYCLE = 38;
/** How each lane's dive cycle is offset from the others' (a fraction of the cycle per lane). */
const LANE_OFFSET = .61803398875;

/**
 * The shift of an animal's dive clock (seconds, subtracted from the time it dives on) that starts a
 * full stretch at the surface at `time`: an animal that has just arrived doesn't dive straight away.
 */
export function surfaceShift(time: number, lane: number) {
  const offset = lane * LANE_OFFSET;
  return time + DIVE_CYCLE * (offset - Math.floor(offset));
}

/** Surface visits are staggered so a growing collection leaves quiet water between animals. */
export function sampleDive(time: number, lane: number, population: number) {
  const crowding = Math.max(0, Math.min(1, (population - 2) / 6));
  const surfaceShare = .62 - crowding * .27;
  const transition = .13;
  const phase = ((time / DIVE_CYCLE + lane * LANE_OFFSET) % 1 + 1) % 1;
  const smooth = (value: number) => {
    const t = Math.max(0, Math.min(1, value));
    return t * t * (3 - 2 * t);
  };
  const depth = phase < surfaceShare ? 0
    : phase < surfaceShare + transition ? smooth((phase - surfaceShare) / transition)
      : phase < 1 - transition ? 1
        : 1 - smooth((phase - (1 - transition)) / transition);
  return {
    // Even the tallest fin remains under the surface during the shallow phase.
    depth,
    surfacing: phase >= 1 - transition,
    y: SWIM_LEVEL - depth * DIVE_DEPTH,
    opacity: 1 - smooth(depth),
    visible: depth < .995,
  };
}
