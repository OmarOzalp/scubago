import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, { useAnimatedProps, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { TypeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export type ProgressRingProps = {
  fraction: number;
  /** Outer size; 64 by default. */
  size?: number;
  color?: string;
  /** In the middle (a figure), optional. */
  label?: string;
  accessibilityLabel: string;
};

/** A ring that fills to `fraction` (6 wide, round caps), drawn in once; an optional figure in the middle. */
export function ProgressRing({ fraction, size = 64, color, label, accessibilityLabel }: ProgressRingProps) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const stroke = 6;
  const r = (size - stroke) / 2;
  const length = 2 * Math.PI * r;
  const target = Math.max(0, Math.min(1, fraction));
  const drawn = useSharedValue(reduced ? target : 0);
  useEffect(() => {
    drawn.set(reduced ? target : withDelay(200, withTiming(target, { duration: 900 })));
  }, [drawn, reduced, target]);
  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: length * (1 - drawn.get()) }));
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel} style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={theme.backgroundSelected} strokeWidth={stroke} />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color ?? theme.turquoise}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${length} ${length}`}
          animatedProps={animatedProps}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {label ? <Text style={[TypeScale.headline, { color: theme.text }]}>{label}</Text> : null}
    </View>
  );
}
