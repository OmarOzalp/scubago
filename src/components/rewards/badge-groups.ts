import type { BadgeKind, BadgeResult } from '@/lib/rewards';

/** A ladder's rungs, easiest first, or a badge that stands alone. */
export type BadgeItem = { type: 'ladder'; key: string; rungs: BadgeResult[] } | { type: 'single'; badge: BadgeResult };

export const KIND_ORDER: readonly BadgeKind[] = ['first', 'milestone', 'place', 'collection'];

export const KIND_TITLE: Record<BadgeKind, string> = {
  first: 'Firsts',
  milestone: 'Milestones',
  place: 'Places',
  collection: 'Collections',
};

/**
 * The badges of one kind, in the engine's order, with each ladder gathered into a single item at
 * the place its first rung appears.
 */
export function itemsOfKind(badges: readonly BadgeResult[], kind: BadgeKind): BadgeItem[] {
  const items: BadgeItem[] = [];
  const ladders = new Map<string, BadgeResult[]>();
  for (const badge of badges) {
    if (badge.kind !== kind) continue;
    if (!badge.ladder) {
      items.push({ type: 'single', badge });
      continue;
    }
    const rungs = ladders.get(badge.ladder);
    if (rungs) rungs.push(badge);
    else {
      const created = [badge];
      ladders.set(badge.ladder, created);
      items.push({ type: 'ladder', key: badge.ladder, rungs: created });
    }
  }
  return items;
}

/** The rungs of the ladder a badge is on (itself included), or just the badge. */
export function ladderOf(badges: readonly BadgeResult[], badge: BadgeResult): BadgeResult[] {
  return badge.ladder ? badges.filter((b) => b.ladder === badge.ladder) : [badge];
}

/** The badges earned most recently first (ties: the one listed later, which is the harder one). */
export function latestEarned(badges: readonly BadgeResult[], count: number): BadgeResult[] {
  return badges
    .map((badge, index) => ({ badge, index }))
    .filter(({ badge }) => badge.earned && badge.earnedOn)
    .sort((a, b) => b.badge.earnedOn!.localeCompare(a.badge.earnedOn!) || b.index - a.index)
    .slice(0, count)
    .map(({ badge }) => badge);
}

export function countEarned(badges: readonly BadgeResult[]): number {
  return badges.reduce((n, b) => n + (b.earned ? 1 : 0), 0);
}
