/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function useTheme() {
  return Colors[useSchemeName()];
}

/** 'light' or 'dark', for colours that need a variant per scheme (rarity and status text). */
export function useSchemeName(): 'light' | 'dark' {
  const scheme = useColorScheme();
  return scheme === 'dark' ? 'dark' : 'light';
}
