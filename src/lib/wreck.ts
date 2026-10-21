/**
 * The Shipwreck's wreck, as plain data for the scene (wreck-coast.tsx) and the tests: an old steamer
 * run aground in the bight of the cay's crescent, her bow up on the sand of its inner shore and her
 * stern settled in deeper, clear water, listing to seaward. Island units (before the level's scale),
 * x to the right and z toward the viewer, heights in the scene's (the water's surface at OCEAN's).
 */
export const WRECK = {
  /** Where her stern and her bow lie (the keel's ends), and her keel's height under each. */
  stern: [-.95, 1.47] as const, bow: [.98, .65] as const, keel: [-.74, -.27] as const,
  /** Her beam and the height of her hull from keel to deck at midships (the bow's sheer rises higher). */
  beam: .34, depth: .29, sheer: .07,
  /** How far she lists to seaward (radians, rolled about her length). */
  list: .2,
  /** Her back is broken (0 at the stern, 1 at the bow): aft of it she has sunk lower (units at the stern), twisted aside and lists harder (radians). */
  broken: { at: .54, drop: .08, twist: .14, list: .14 },
  /**
   * Where along her (0 at the stern, 1 at the bow) her deckhouse, funnel and masts stand, and how
   * tall: the funnel leans aft, the mainmast is broken off short.
   */
  house: { at: .44, length: .22, height: .11 }, funnel: { at: .36, height: .22, radius: .045, lean: .2 },
  foremast: { at: .78, height: .46 }, mainmast: { at: .18, height: .13 },
};

/** Her length (island units). */
export const wreckLength = () => Math.hypot(WRECK.bow[0] - WRECK.stern[0], WRECK.bow[1] - WRECK.stern[1]);
/** The point along her keel at `t` (0 stern, 1 bow): its place (x, z) and the keel's height there. */
export function alongWreck(t: number) {
  const { stern, bow, keel } = WRECK;
  return { x: stern[0] + (bow[0] - stern[0]) * t, z: stern[1] + (bow[1] - stern[1]) * t, y: keel[0] + (keel[1] - keel[0]) * t };
}
