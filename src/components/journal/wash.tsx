import { useMemo } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { washPath } from '@/lib/wash';

interface Props {
  width: number;
  height: number;
  color: string;
  /** Same seed, same shape. */
  seed?: number;
  /** Overall strength (0–1). */
  opacity?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * A watercolour wash: two overlapping irregular layers and a slightly darker edge where the pigment
 * pools, like paint dried on paper. Decorative.
 */
export function Wash({ width, height, color, seed = 1, opacity = 1, style }: Props) {
  const [outer, inner] = useMemo(
    () => [washPath(seed, width, height, { inset: 1 }), washPath(seed + 7, width, height, { inset: width * 0.12, wobble: 0.2 })],
    [seed, width, height],
  );
  return (
    <Svg width={width} height={height} style={style} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path d={outer} fill={color} opacity={0.7 * opacity} />
      <Path d={inner} fill={color} opacity={0.35 * opacity} />
      <Path d={outer} fill="none" stroke={color} strokeWidth={1.4} opacity={0.5 * opacity} />
    </Svg>
  );
}
