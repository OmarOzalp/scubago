/**
 * A dolphin's leap clear of the water (see docs/marine-navigation.md): a run-up from its usual
 * depth that dips a little, then sweeps steeply up to the surface; a compact ballistic arc
 * through the air with its heading fixed; and a nose-first plunge that carries it below its depth
 * before it eases back up and slows to its cruise. Rare, and only where there is room for all of
 * it. Heights are above the swimming level (see ocean-depth.ts), as the motion's are.
 */
export const DOLPHIN_BREACH = {
  /**
   * Share of eligible breaths that become a leap, rolled once as the breath begins (never per frame).
   * A breath that rolls a leap takes it as soon as there is room in its first `window` seconds.
   */
  chance: .2, window: 2.5,
  /** No leap for this long after the last one of the same pod (s). */
  cooldown: 60,
  /** The run-up (s): speeding up and diving slightly, then climbing steeply to the surface. */
  build: 1.6,
  /** Share of the run-up after which its heading is fixed and the whole leap is checked a last time. */
  lock: .7,
  /** The leap: its apex above the calm surface and its length over the water (units), and its time in the air (s). */
  apex: .6, length: 1.3, air: 1.05,
  /** How far past the landing the plunge carries it before it can turn again (units): part of the room a leap needs. */
  runOut: .8,
  /** The plunge back under and the return to its depth and cruising pace (s). */
  reentry: 2.8,
  /** When a run-up is called off at the last check, how long it takes to blend into an ordinary breath (s). */
  settle: 1.5,
  /**
   * The room a leap needs: this far (units) beyond the island clearance, inside this much of the
   * frame, and in the clear middle of the view (this share of its half-height from the center),
   * short of the haze at the top and bottom, so it is always seen well.
   */
  islandMargin: .2, frameEdge: 1, view: .64,
  /**
   * Clear water (units) between the leap's path and any other animal's footprint (its pod swims close,
   * so less for them), and, as it decides, between its own footprint and any other large animal's.
   */
  animalGap: .45, podGap: .25, crowd: .8,
  /** Splash strength (0..1) as it leaves the water and as it plunges back in. */
  splash: { exit: .7, reentry: 1 },
};
export type BreachConfig = typeof DOLPHIN_BREACH;

/** The leap's motion: vertical speed leaving the water (units/s), gravity (units/s²) and speed over the ground (units/s). */
export function breachFlight(config: BreachConfig = DOLPHIN_BREACH) {
  return { rise: 4 * config.apex / config.air, gravity: 8 * config.apex / config.air ** 2, speed: config.length / config.air };
}
/** Seconds from the start of the run-up to the end of the plunge. */
export const breachDuration = (config: BreachConfig = DOLPHIN_BREACH) => config.build + config.air + config.reentry;

/** Cubic Hermite curve from (y0, slope m0) to (y1, slope m1), slopes per unit of s (0..1): value and slope at s. */
export function hermite(y0: number, m0: number, y1: number, m1: number, s: number): [number, number] {
  const s2 = s * s, s3 = s2 * s;
  return [
    (2 * s3 - 3 * s2 + 1) * y0 + (s3 - 2 * s2 + s) * m0 + (3 * s2 - 2 * s3) * y1 + (s3 - s2) * m1,
    (6 * s2 - 6 * s) * y0 + (3 * s2 - 4 * s + 1) * m0 + (6 * s - 6 * s2) * y1 + (3 * s2 - 2 * s) * m1,
  ];
}

export type BreachStage = 'build' | 'air' | 'reentry';
/**
 * Height (above the swimming level) and vertical speed at `t` seconds into a stage. `level` is the
 * depth it leaves from and returns to; `surface` the calm surface. The stages meet with matching
 * heights and speeds, so the leap has no kinks: the run-up reaches the surface at the leap's rising
 * speed, the arc returns to it falling as fast, and the plunge starts at that speed and ends at rest.
 */
export function breachHeight(stage: BreachStage, t: number, level: number, surface: number, config: BreachConfig = DOLPHIN_BREACH,
  /** Where the run-up starts, if not at rest at `level`: its height and vertical speed (a breath already rising). */
  start?: { y: number; speed: number }): [number, number] {
  const { rise, gravity } = breachFlight(config);
  if (stage === 'air') return [surface + rise * t - gravity * t * t / 2, rise - gravity * t];
  const duration = stage === 'build' ? config.build : config.reentry, s = Math.min(1, Math.max(0, t / duration));
  const [y, slope] = stage === 'build'
    ? hermite(start?.y ?? level, (start?.speed ?? 0) * duration, surface, rise * duration, s)
    : hermite(surface, -rise * duration, level, 0, s);
  return [y, slope / duration];
}
