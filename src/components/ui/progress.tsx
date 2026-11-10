import { View, type ViewStyle } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { Radius, Size } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ProgressBarProps = {
  /** 0 to 1. */
  fraction: number;
  /** The fill; turquoise by default. */
  color?: string;
  accessibilityLabel: string;
  /** The real figures, for screen readers (e.g. 4 of 8 species). */
  max: number;
  now: number;
};

/** A 6-high pill track (backgroundSelected) that fills in turquoise, eased in once when it appears (not under Reduce Motion). */
export function ProgressBar({ fraction, color, accessibilityLabel, max, now }: ProgressBarProps) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const width = `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%` as const;
  const grow: ViewStyle = reduced
    ? {}
    : ({
        animationName: { from: { width: '0%' } },
        animationDuration: '900ms',
        animationDelay: '200ms',
        animationTimingFunction: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
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
      style={{ height: Size.progress, borderRadius: Radius.pill, backgroundColor: theme.backgroundSelected, overflow: 'hidden' }}>
      <Animated.View style={[{ height: '100%', width, borderRadius: Radius.pill, backgroundColor: color ?? theme.turquoise }, grow]} />
    </View>
  );
}

