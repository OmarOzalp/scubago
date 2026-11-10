import type { ReactNode } from 'react';
import { Pressable, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { usePressScale } from '@/components/ui/press';
import { useSurface } from '@/components/ui/surface';
import { Radius } from '@/constants/theme';
import { useSchemeName, useTheme } from '@/hooks/use-theme';

type Tone = 'card' | 'sand' | 'twilight' | 'deep';

function toneStyle(tone: Tone, theme: ReturnType<typeof useTheme>, scheme: 'light' | 'dark'): ViewStyle {
  switch (tone) {
    case 'sand':
      return { backgroundColor: theme.sunSoft, borderRadius: Radius.lg };
    case 'twilight':
      return { backgroundColor: theme.twilight, borderRadius: Radius.lg };
    case 'deep':
      return { backgroundColor: theme.deep, borderRadius: Radius.lg };
    default:
      return {};
  }
}

/**
 * The old card, drawn as the design system's surface (src/components/ui/card.tsx): no border with the
 * shadow. `sand` is the notice fill; `twilight` and `deep` are dark panels. New code uses Card.
 */
export function Paper({
  children,
  tone = 'card',
  padded = true,
  raised = false,
  style,
}: {
  children: ReactNode;
  tone?: Tone;
  /** Inner padding of 16 (default) or none. */
  padded?: boolean;
  /** A deeper shadow, for the one card a screen is about. */
  raised?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const scheme = useSchemeName();
  const surface = useSurface(raised ? 'raised' : 'card');
  return (
    <View style={[tone === 'card' ? surface : null, { padding: padded ? 16 : 0 }, toneStyle(tone, theme, scheme), style]}>
      {children}
    </View>
  );
}

/** A card you can tap: the surface, scaling to 0.98 while pressed. New code uses Card with onPress. */
export function PaperButton({
  children,
  style,
  ...props
}: Omit<PressableProps, 'style' | 'children'> & { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const surface = useSurface();
  const scale = usePressScale();
  return (
    <Pressable accessibilityRole="button" {...props} style={({ pressed }) => [surface, scale(pressed), style]}>
      {children}
    </Pressable>
  );
}
