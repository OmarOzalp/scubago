import type { ReactNode } from 'react';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { Icon } from '@/components/icon';
import { Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * The thunk of a rubber stamp: it drops in large, overshoots a little and settles at its angle.
 * Nothing moves under Reduce Motion.
 */
export function useStampIn(rotate: number, delay = 0): ViewStyle {
  const reduced = useReducedMotion();
  const turn = `${rotate}deg`;
  if (reduced) return { transform: [{ rotate: turn }] };
  return {
    transform: [{ rotate: turn }],
    animationName: {
      '0%': { opacity: 0, transform: [{ scale: 1.7 }, { rotate: turn }] },
      '60%': { opacity: 1, transform: [{ scale: 0.94 }, { rotate: turn }] },
      '100%': { opacity: 1, transform: [{ scale: 1 }, { rotate: turn }] },
    },
    animationDuration: '550ms',
    animationDelay: `${delay}ms`,
    animationTimingFunction: 'ease-out',
    animationFillMode: 'both',
  } as ViewStyle;
}

interface StampProps {
  /** Short, upper-case lines; the first is set large. */
  lines: string[];
  shape?: 'rect' | 'round';
  /** Defaults to the theme's stamp red. */
  color?: string;
  rotate?: number;
  /** Stamp it in when it first appears. */
  animate?: boolean;
  delay?: number;
  size?: number;
  /** What a screen reader says; without it the stamp is decorative. */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/** A rubber stamp: double ruled border, typewriter letters, at a slight angle. */
export function Stamp({ lines, shape = 'rect', color, rotate = -8, animate = false, delay = 0, size, accessibilityLabel, style }: StampProps) {
  const theme = useTheme();
  const ink = color ?? theme.stamp;
  const motion = useStampIn(rotate, delay);
  const round = shape === 'round';
  const box: ViewStyle = round
    ? { width: size ?? 76, height: size ?? 76, borderRadius: (size ?? 76) / 2 }
    : { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 };
  const [first, ...rest] = lines;
  return (
    <Animated.View
      accessible={!!accessibilityLabel}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityElementsHidden={!accessibilityLabel}
      importantForAccessibility={accessibilityLabel ? 'yes' : 'no-hide-descendants'}
      style={[
        { borderWidth: 2, borderColor: ink, padding: 2, alignSelf: 'flex-start' },
        box,
        animate ? motion : { transform: [{ rotate: `${rotate}deg` }] },
        style,
      ]}>
      <View
        style={[
          { flex: round ? 1 : undefined, borderWidth: 1, borderColor: ink, alignItems: 'center', justifyContent: 'center' },
          round ? { borderRadius: 999 } : { borderRadius: 5, paddingHorizontal: 8, paddingVertical: 4 },
        ]}>
        <Text style={{ fontFamily: round ? Type.display : Type.label, fontSize: round ? 22 : 13, lineHeight: round ? 24 : 16, color: ink, letterSpacing: round ? 0 : 1 }}>
          {first}
        </Text>
        {rest.map((line) => (
          <Text key={line} style={{ fontFamily: Type.label, fontSize: 12, lineHeight: 14, color: ink, letterSpacing: 1 }}>
            {line}
          </Text>
        ))}
      </View>
    </Animated.View>
  );
}

/** The round seal on a signed or buddy-verified dive. */
export function Seal({ label = 'Verified', color, rotate = 10, animate = false, delay = 0, size = 72 }: { label?: string; color?: string; rotate?: number; animate?: boolean; delay?: number; size?: number }) {
  const theme = useTheme();
  const ink = color ?? theme.tint;
  const motion = useStampIn(rotate, delay);
  return (
    <Animated.View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={[
        { width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: ink, padding: 2 },
        animate ? motion : { transform: [{ rotate: `${rotate}deg` }] },
      ]}>
      <View style={{ flex: 1, borderRadius: 999, borderWidth: 1, borderColor: ink, alignItems: 'center', justifyContent: 'center', gap: 1 }}>
        <Icon name="check" size={size * 0.26} color={ink} weight="bold" />
        <Text style={{ fontFamily: Type.bodyHeavy, fontSize: 12, letterSpacing: 0.6, color: ink }}>{label.toUpperCase()}</Text>
      </View>
    </Animated.View>
  );
}

/** A small "NEW" ribbon for things the diver hasn't had before. */
export function NewBadge({ label = 'New', style }: { label?: string; style?: StyleProp<ViewStyle> }): ReactNode {
  const theme = useTheme();
  return (
    <View style={[{ backgroundColor: theme.sun, borderColor: theme.text, borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 1 }, style]}>
      <Text style={{ fontFamily: Type.bodyHeavy, fontSize: 12, lineHeight: 16, color: '#1D2B45', letterSpacing: 0.5 }}>{label.toUpperCase()}</Text>
    </View>
  );
}
