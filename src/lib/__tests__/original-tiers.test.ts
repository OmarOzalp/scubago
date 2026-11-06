/**
 * Adding animals must never move one that already has a tier: people have seen "Epic" or "Rare" on those cards
 * and earned badges from them. The tiers are placed against cutoffs frozen from the original catalogue
 * (src/data/encounter-rarity.cutoffs.json; docs/real-rarity.md, "Frozen cutoffs").
 */
import { describe, expect, it } from '@jest/globals';

import cutoffsFile from '@/data/encounter-rarity.cutoffs.json';
import encounterRarity from '@/data/encounter-rarity.json';
import original from '@/data/__tests__/original-tiers.json';
import { SPECIES_BY_ID } from '@/data/species';
import { REAL_RARITY } from '@/lib/real-rarity';
import { tiersFromCutoffs, type TierCutoffs } from '@/lib/encounter-rarity';

const file = encounterRarity as { species: Record<string, { tier: string; share: number }>; unresolved: { id: string }[] };
const tiered = original.tiered as Record<string, { tier: string; share: number }>;
const unresolved = original.unresolved as Record<string, string>;

describe('the original 120 animals keep their tier', () => {
  it('in the checked-in file: every tiered one has the same share and tier', () => {
    expect(Object.keys(tiered)).toHaveLength(106);
    for (const [id, was] of Object.entries(tiered)) expect({ id, tier: file.species[id]?.tier, share: file.species[id]?.share }).toEqual({ id, ...was });
  });

  it('as the app shows it, and the other fourteen keep the catalogue tier they had', () => {
    for (const [id, was] of Object.entries(tiered)) expect({ id, tier: REAL_RARITY.get(id) }).toEqual({ id, tier: was.tier });
    for (const [id, rarity] of Object.entries(unresolved)) {
      expect(file.unresolved.some((u) => u.id === id)).toBe(true);
      expect({ id, tier: SPECIES_BY_ID.get(id)?.rarity }).toEqual({ id, tier: rarity });
    }
    expect(Object.keys(unresolved)).toHaveLength(14);
  });

  it('and the frozen cutoffs give every one of them its tier again, whoever else is added', () => {
    const cutoffs = cutoffsFile.cutoffs as TierCutoffs;
    const shares = new Map(Object.entries(tiered).map(([id, e]) => [id, e.share] as const));
    const without = tiersFromCutoffs(shares, cutoffs);
    for (const [id, was] of Object.entries(tiered)) expect({ id, tier: without.get(id) }).toEqual({ id, tier: was.tier });
    // Twenty newcomers at any shares leave them where they were.
    const more = new Map(shares);
    for (let i = 0; i < 20; i++) more.set(`new-${i}`, i / 19);
    const withNew = tiersFromCutoffs(more, cutoffs);
    for (const [id, was] of Object.entries(tiered)) expect(withNew.get(id)).toBe(was.tier);
  });

  it('place a newcomer by its share against the cutoffs', () => {
    const cutoffs = cutoffsFile.cutoffs as TierCutoffs;
    const at = (share: number) => tiersFromCutoffs(new Map([['x', share]]), cutoffs).get('x');
    expect([at(0.9), at(cutoffs.common), at(0.3), at(cutoffs.uncommon), at(0.15), at(cutoffs.rare), at(0.05), at(cutoffs.epic), at(0.02), at(0)])
      .toEqual(['common', 'common', 'uncommon', 'uncommon', 'rare', 'rare', 'epic', 'epic', 'legendary', 'legendary']);
  });
});
