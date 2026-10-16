import { Text, View } from 'react-native';
import Animated, { useAnimatedProps, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { useEffect } from 'react';

import { Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** A ring that fills to `fraction`, inked in once when it appears. The number sits in the middle. */
export function ProgressRing({ fraction, size = 66, color, accessibilityLabel }: { fraction: number; size?: number; color?: string; accessibilityLabel: string }) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const stroke = 7;
  const r = (size - stroke) / 2;
  const length = 2 * Math.PI * r;
  const target = Math.max(0, Math.min(1, fraction));
  const drawn = useSharedValue(reduced ? target : 0);
  useEffect(() => {
    drawn.set(reduced ? target : withDelay(200, withTiming(target, { duration: 1200 })));
  }, [drawn, reduced, target]);
  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: length * (1 - drawn.get()) }));
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel} style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
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
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontFamily: Type.display, fontSize: size * 0.26, color: theme.text }}>{Math.round(target * 100)}%</Text>
      </View>
    </View>
  );
}
