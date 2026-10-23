import { countEarned } from '@/components/rewards/badge-groups';
import { plural } from '@/components/rewards/format';
import type { Rewards } from '@/lib/rewards';

/** The headline numbers of a diver's rewards, as the entry points on other screens quote them. */
export function summarize({ badges, collections, passport, islands }: Pick<Rewards, 'badges' | 'collections' | 'passport' | 'islands'>) {
  return {
    earned: countEarned(badges),
    badges: badges.length,
    complete: collections.filter((c) => c.completed).length,
    collections: collections.length,
    stamps: passport.reduce((n, g) => n + g.stamps.length, 0),
    places: passport.length,
    raised: islands.filter((i) => i.unlocked).length,
    islands: islands.length,
  };
}

export type RewardsSummary = ReturnType<typeof summarize>;

/** The Logbook's line under "Badges & collections": "6 of 48 badges · 3 site stamps". */
export function badgesLine(s: RewardsSummary): string {
  if (s.earned === 0 && s.stamps === 0) return 'Badges and site stamps start with your first dive';
  return `${s.earned} of ${s.badges} badges · ${plural(s.stamps, 'site stamp')}`;
}

/** The Field guide's line under "Collections": "2 of 17 complete", or what there is to fill. */
export function collectionsLine(s: RewardsSummary): string {
  return s.complete > 0 ? `${s.complete} of ${s.collections} complete` : `${s.collections} sets to fill, from sharks to shipwrecks`;
}
