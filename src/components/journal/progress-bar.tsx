import { View, type ViewStyle } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { useTheme } from '@/hooks/use-theme';

/** A thick rounded bar that fills to `fraction`, drawn in once when it appears. */
export function ProgressBar({
  fraction,
  color,
  accessibilityLabel,
  max,
  now,
}: {
  fraction: number;
  color?: string;
  accessibilityLabel: string;
  /** The real figures, for screen readers (e.g. 4 of 8 species). */
  max: number;
  now: number;
}) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const width = `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%` as const;
  const grow: ViewStyle = reduced
    ? {}
    : ({
        animationName: { from: { width: '0%' } },
        animationDuration: '1200ms',
        animationDelay: '300ms',
        animationTimingFunction: 'ease-out',
        animationFillMode: 'backwards',
      } as ViewStyle);
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max, now }}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={now}
      style={{ height: 12, borderRadius: 999, backgroundColor: theme.backgroundSelected, overflow: 'hidden' }}>
      <Animated.View style={[{ height: '100%', width, borderRadius: 999, backgroundColor: color ?? theme.turquoise }, grow]} />
    </View>
  );
}
