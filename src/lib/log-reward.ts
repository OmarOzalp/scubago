import { HOME_STAGES, levelForCount } from '@/lib/home';
import { RARITY_LABEL } from '@/lib/rarity';
import type { Rarity } from '@/lib/types';

/** "Rare find": the rarity, said once the animals are in the log (the picker shows it only as a coloured edge). */
export function rarityFind(rarity: Rarity): string {
  return `${RARITY_LABEL[rarity]} find`;
}

/**
 * How the island grew when a log took the collection from `before` to `after` species, from the same
 * stages Home draws it with (HOME_STAGES). `fraction` is how far along the way to the next stage it now
 * is (1 at the last stage). Null when nothing new joined: the island is the size it was.
 */
export function islandGrowth(before: number, after: number): { text: string; unlock?: string; bar: boolean; from: number; fraction: number; levelUp: boolean } | null {
  if (after <= before) return null;
  const level = levelForCount(after);
  const stage = HOME_STAGES[level - 1];
  const next = HOME_STAGES[level] ?? null;
  const levelUp = level > levelForCount(before);
  const fraction = next ? (after - stage.at) / (next.at - stage.at) : 1;
  // Where the bar starts: where it stood, or empty at the start of a new level.
  const from = levelUp ? 0 : next ? (before - stage.at) / (next.at - stage.at) : 1;
  if (levelUp) return { text: `Your island grew to level ${level}`, unlock: stage.reward, bar: false, from, fraction, levelUp };
  if (!next) return { text: 'Your island grew', bar: false, from, fraction, levelUp };
  const remaining = next.at - after;
  return { text: `Your island grew: ${remaining} more ${remaining === 1 ? 'animal' : 'animals'} to the next level`, bar: true, from, fraction, levelUp };
}

/** "Whale Shark", "Whale Shark and Reef Manta Ray", "A, B and C", "A, B and 2 more". */
export function nameList(names: readonly string[]): string {
  if (names.length <= 1) return names.join('');
  if (names.length <= 3) return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
}
