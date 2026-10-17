import type { ReactNode } from 'react';
import { Pressable, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { Radius, Shadow } from '@/constants/theme';
import { useSchemeName, useTheme } from '@/hooks/use-theme';

type Tone = 'card' | 'sand' | 'twilight' | 'deep';

const SAND = { light: '#FFF3D1', dark: '#2B2A22' };

function toneStyle(tone: Tone, theme: ReturnType<typeof useTheme>, scheme: 'light' | 'dark'): ViewStyle {
  switch (tone) {
    case 'sand':
      return { backgroundColor: SAND[scheme], borderColor: scheme === 'light' ? '#EED9AE' : '#3D3A2C' };
    case 'twilight':
      return { backgroundColor: theme.twilight, borderColor: theme.twilight };
    case 'deep':
      return { backgroundColor: theme.deep, borderColor: theme.deep };
    default:
      return { backgroundColor: theme.backgroundElement, borderColor: theme.cardBorder };
  }
}

/** A sheet of paper laid on the page: the app's card. */
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
  return (
    <View
      style={[
        {
          borderRadius: Radius.lg,
          borderWidth: 1,
          padding: padded ? 16 : 0,
          boxShadow: tone === 'card' || tone === 'sand' ? Shadow[scheme][raised ? 'raised' : 'card'] : undefined,
        },
        toneStyle(tone, theme, scheme),
        style,
      ]}>
      {children}
    </View>
  );
}

/** A card you can tap: sinks slightly and darkens while pressed. */
export function PaperButton({
  children,
  style,
  ...props
}: Omit<PressableProps, 'style' | 'children'> & { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  const scheme = useSchemeName();
  return (
    <Pressable
      accessibilityRole="button"
      {...props}
      style={({ pressed }) => [
        {
          borderRadius: Radius.lg,
          borderWidth: 1,
          borderColor: theme.cardBorder,
          backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement,
          boxShadow: Shadow[scheme].card,
          transform: [{ translateY: pressed ? 1 : 0 }],
        },
        style,
      ]}>
      {children}
    </Pressable>
  );
}
