import type { Category, Rarity } from '@/lib/types';

/** Rarity tiers ordered from most to least common. */
export const RARITY_ORDER: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

export const RARITY_LABEL: Record<Rarity, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
};

/** Tier accent colors for rings and fills (work on light and dark backgrounds); not for text. */
export const RARITY_COLOR: Record<Rarity, string> = {
  common: '#8E9AA6',
  uncommon: '#3BA55D',
  rare: '#3B82F6',
  epic: '#A855F7',
  legendary: '#F59E0B',
};

/** Tier colors for text, at least 4.5:1 on the app's backgrounds and on a tinted chip. */
export const RARITY_TEXT: Record<'light' | 'dark', Record<Rarity, string>> = {
  light: { common: '#4B5563', uncommon: '#166534', rare: '#1D4ED8', epic: '#7E22CE', legendary: '#92400E' },
  dark: { common: '#C3CAD2', uncommon: '#86EFAC', rare: '#93C5FD', epic: '#D8B4FE', legendary: '#FCD34D' },
};

export function rarityRank(rarity: Rarity): number {
  return RARITY_ORDER.indexOf(rarity);
}

export const CATEGORY_LABEL: Record<Category, string> = {
  shark: 'Sharks',
  ray: 'Rays',
  turtle: 'Turtles',
  mammal: 'Mammals',
  fish: 'Fish',
  cephalopod: 'Cephalopods',
  macro: 'Macro',
  reptile: 'Reptiles',
  other: 'Other',
};

export const CATEGORY_EMOJI: Record<Category, string> = {
  shark: '🦈',
  ray: '🐟',
  turtle: '🐢',
  mammal: '🐬',
  fish: '🐠',
  cephalopod: '🐙',
  macro: '🦐',
  reptile: '🦎',
  other: '🪼',
};

export const CATEGORY_ORDER: Category[] = [
  'shark',
  'ray',
  'turtle',
  'mammal',
  'fish',
  'cephalopod',
  'macro',
  'reptile',
  'other',
];
