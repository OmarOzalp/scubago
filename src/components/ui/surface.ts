import { Platform, type ViewStyle } from 'react-native';

import { Elevation, Radius } from '@/constants/theme';
import { useSchemeName, useTheme } from '@/hooks/use-theme';

/** iOS draws continuous ("squircle") corners when asked; other platforms ignore it. */
export const continuous: ViewStyle = Platform.OS === 'ios' ? { borderCurve: 'continuous' } : {};

/**
 * A surface laid on the page (a card, a grouped list, a search result panel): backgroundElement, radius lg,
 * and either a soft shadow (light) or a hairline (dark). Never a border and a shadow together.
 */
export function useSurface(level: 'card' | 'raised' = 'card', radius: number = Radius.lg): ViewStyle {
  const theme = useTheme();
  const scheme = useSchemeName();
  const e = Elevation[scheme];
  const shadow = level === 'raised' ? e.raised : e.card;
  return {
    backgroundColor: theme.backgroundElement,
    borderRadius: radius,
    ...continuous,
    ...(shadow ? { boxShadow: shadow } : null),
    ...(e.cardBorder && level === 'card' ? { borderWidth: 1, borderColor: theme.cardBorder } : null),
  };
}
