import type { ReactNode } from 'react';
import { Pressable, View, type AccessibilityRole, type AccessibilityState, type StyleProp, type ViewStyle } from 'react-native';

import { Space } from '@/constants/theme';
import { usePressScale } from '@/components/ui/press';
import { useSurface } from '@/components/ui/surface';

export type CardProps = {
  children: ReactNode;
  /** 16 inside (default), or none (a list, a picture to the edge). */
  padded?: boolean;
  /** `raised` only for what floats over other content (a sheet, a card over a map). */
  level?: 'card' | 'raised';
  /** Makes the whole card one button: it scales to 0.98 while pressed. */
  onPress?: () => void;
  accessibilityRole?: AccessibilityRole;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityState?: AccessibilityState;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

/** The one card: backgroundElement, radius lg, a soft shadow (dark: a hairline), padding 16. */
export function Card({ children, padded = true, level = 'card', onPress, accessibilityRole, accessibilityLabel, accessibilityHint, accessibilityState, testID, style }: CardProps) {
  const surface = useSurface(level);
  const scale = usePressScale();
  const box: ViewStyle = { ...surface, padding: padded ? Space.s4 : 0 };
  if (!onPress) {
    return (
      <View testID={testID} accessibilityLabel={accessibilityLabel} accessibilityRole={accessibilityRole} style={[box, style]}>
        {children}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      accessibilityRole={accessibilityRole ?? 'button'}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={accessibilityState}
      style={({ pressed }) => [box, scale(pressed), style]}>
      {children}
    </Pressable>
  );
}
