import { variation } from './steering';
import type { MarineModel } from './swimming';

/**
 * Species that swim together on the island: the fewest and most that come as one group (each visit
 * picks a number in between). One species is still one discovery, one tap destination and one of
 * the animated species (MAX_ANIMATED): the extra members are drawn from a budget of their own.
 * Chosen from what the species do: bottlenose and spinner dolphins travel in pods; scalloped
 * hammerheads school, so now and then a second one swims along (great hammerheads are solitary and
 * stay alone); chevron barracuda school, giant trevally hunt in packs, bumphead parrotfish move in
 * herds and raccoon butterflyfish go about in pairs.
 */
export const GROUP_SIZES: Readonly<Record<string, readonly [number, number]>> = {
  'bottlenose-dolphin': [2, 3],
  'spinner-dolphin': [2, 3],
  'scalloped-hammerhead': [1, 2],
  'chevron-barracuda': [3, 5],
  'giant-trevally': [2, 3],
  'bumphead-parrotfish': [2, 3],
  'raccoon-butterflyfish': [2, 2],
};

/**
 * How a group swims, by model: the leader steers for all of them (see marine-motion.ts), and each
 * follower keeps a loose place of its own beside and behind it.
 */
export type GroupStyle = {
  /** Places for followers 1, 2, …: how far to the leader's side (units, positive to its left) and behind it (units). */
  places: readonly (readonly [number, number])[];
  /** How far each place wanders (units) and over how long (s), so no two members move quite alike. */
  wander: number; wanderPeriod: number;
  /** Average seconds between two members trading places, one passing beneath the other (0 = never), and how long a trade takes (s). */
  swapEvery: number; swapTime: number;
  /** How much deeper a member swims while passing beneath another (units), and the depth differences between members (units). */
  dip: number; depthSpread: number;
  /** Air-breathers: seconds between members' breaths, and the chance that a third member stays under for one. */
  stagger: number; skip: number;
};
export const GROUP_STYLES: Partial<Record<MarineModel, GroupStyle>> = {
  // A loose, staggered pod that now and then trades places, one dolphin sliding under another.
  'bottlenose-dolphin': {
    places: [[.62, .55], [-.6, 1.15]], wander: .16, wanderPeriod: 13, swapEvery: 38, swapTime: 4.5, dip: .32, depthSpread: .08, stagger: 2.4, skip: .4,
  },
  // Two large sharks swimming loosely together, each still its own animal: well apart, wandering more.
  'scalloped-hammerhead': {
    places: [[1.05, 1.25]], wander: .35, wanderPeriod: 27, swapEvery: 80, swapTime: 7, dip: .38, depthSpread: .16, stagger: 0, skip: 0,
  },
  // A small shoal: close together, busier, trading places more often.
  'reef-fish': {
    places: [[.34, .4], [-.32, .55], [.1, .92], [-.38, 1.08]], wander: .14, wanderPeriod: 7, swapEvery: 16, swapTime: 2.6, dip: .16, depthSpread: .07, stagger: 0, skip: 0,
  },
};

/** Extra group members drawn at most, on top of the animated species: fewer where the GPU is emulated. */
export const GROUP_BUDGET = { full: 6, lite: 3 };

/** Which groups get members first when the budget runs short: the dolphins' pods, then hammerheads, then shoals. */
const PRIORITY: Partial<Record<MarineModel, number>> = { 'bottlenose-dolphin': 0, 'scalloped-hammerhead': 1, 'reef-fish': 2 };

const hash = (id: string) => { let h = 7; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 100003; return h; };

/**
 * How many animals each species shows as (1 = alone), in the order given. The size is picked per
 * visit (`seed`, 0..1) within the species' range, then trimmed to the budget of extra members.
 * Deterministic: the same species, seed and budget always give the same groups.
 */
export function groupSizes(species: readonly { id: string; model: MarineModel }[], budget: number, seed = 0): number[] {
  const wanted = species.map(({ id, model }) => {
    const range = Object.hasOwn(GROUP_SIZES, id) ? GROUP_SIZES[id] : null;
    if (!range || !GROUP_STYLES[model]) return 1;
    const [least, most] = range;
    return Math.min(most, least + Math.floor(variation(hash(id), seed * 97 + 3) * (most - least + 1)), 1 + GROUP_STYLES[model]!.places.length);
  });
  const sizes = wanted.map(() => 1);
  let left = Math.max(0, Math.floor(budget));
  const order = species.map((_, i) => i).sort((a, b) => (PRIORITY[species[a].model] ?? 9) - (PRIORITY[species[b].model] ?? 9) || a - b);
  for (const i of order) {
    const extra = Math.min(wanted[i] - 1, left);
    sizes[i] += extra;
    left -= extra;
  }
  return sizes;
}
