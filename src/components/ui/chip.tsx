import { useId, type ReactNode, type Ref } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent, type ScrollViewInstance, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { usePressScale } from '@/components/ui/press';
import { OnFill, Radius, Size, Space, TypeScale } from '@/constants/theme';
import { useSchemeName, useTheme } from '@/hooks/use-theme';

export type ChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  /** A count after the label ("Coral Reef 8"). */
  count?: number;
  /** A small dot before the label, in this colour (an island's habitat). */
  dot?: string;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
  onLayout?: (event: LayoutChangeEvent) => void;
};

/**
 * The one chip: a 36 pill (44 to hit). Off: the surface colour with a hairline; on: filled with the ink
 * colour (navy in light, pale in dark) and the label reversed out of it.
 */
export function Chip({ label, selected, onPress, count, dot, accessibilityLabel, accessibilityHint, testID, onLayout }: ChipProps) {
  const theme = useTheme();
  const scheme = useSchemeName();
  const scale = usePressScale();
  const ink = selected ? OnFill[scheme].ink : theme.text;
  return (
    <Pressable
      onPress={onPress}
      onLayout={onLayout}
      testID={testID}
      accessibilityRole="button"
      aria-selected={selected}
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [styles.hit, scale(pressed)]}>
      <View
        style={[
          styles.pill,
          selected
            ? { backgroundColor: theme.text, borderColor: theme.text }
            : { backgroundColor: theme.backgroundElement, borderColor: theme.cardBorder },
        ]}>
        {dot ? <View style={[styles.dot, { backgroundColor: dot }]} /> : null}
        <Text numberOfLines={1} maxFontSizeMultiplier={1.4} style={[styles.label, { color: ink }]}>
          {label}
        </Text>
        {count !== undefined ? (
          <Text maxFontSizeMultiplier={1.4} style={[styles.count, { color: selected ? ink : theme.textSecondary }]}>
            {count}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export type ChipRowProps = {
  children: ReactNode;
  /** What the row filters, read before the chips ("Filter animals"). */
  accessibilityLabel?: string;
  /** The colour behind the row, for the soft fade at its edges (the page's by default); `false` for none. */
  fade?: string | false;
  /** Lay the chips out from the middle when they don't fill the row (Home's islands). */
  centered?: boolean;
  onLayout?: (event: LayoutChangeEvent) => void;
  style?: StyleProp<ViewStyle>;
  /** The row's scroll view (to bring a chip into view). */
  ref?: Ref<ScrollViewInstance>;
};

/**
 * Chips in one row that scrolls sideways, reaching to the screen's edges with the 16 gutter inside it and a
 * soft fade at each end. Put it straight in a Screen (it bleeds over the gutter itself).
 */
export function ChipRow({ children, accessibilityLabel, fade, centered = false, onLayout, style, ref }: ChipRowProps) {
  const theme = useTheme();
  const edge = fade === false ? null : (fade ?? theme.background);
  return (
    <View style={[styles.rowWrap, style]} onLayout={onLayout}>
      <ScrollView
        ref={ref}
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityLabel={accessibilityLabel}
        style={styles.rowScroll}
        contentContainerStyle={[styles.row, centered && styles.centered]}>
        {children}
      </ScrollView>
      {edge ? (
        <>
          <Fade color={edge} side="left" />
          <Fade color={edge} side="right" />
        </>
      ) : null}
    </View>
  );
}

/** A 16-wide gradient from `color` to clear, over one end of the row: nothing to tap, nothing to read. */
function Fade({ color, side }: { color: string; side: 'left' | 'right' }) {
  const id = `fade-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <View aria-hidden pointerEvents="none" style={[styles.fade, side === 'left' ? { left: 0 } : { right: 0 }]}>
      <Svg width={Space.s4} height="100%">
        <Defs>
          <LinearGradient id={id} x1={side === 'left' ? '0' : '1'} y1="0" x2={side === 'left' ? '1' : '0'} y2="0">
            <Stop offset="0" stopColor={color} stopOpacity={1} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width={Space.s4} height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  // The pill is 36; the 4 above and below make it 44 to hit without looking bigger.
  hit: {
    minHeight: Size.hit,
    justifyContent: 'center',
  },
  pill: {
    height: Size.chip,
    borderRadius: Radius.pill,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    ...TypeScale.footnoteStrong,
  },
  count: {
    ...TypeScale.footnote,
  },
  rowWrap: {
    marginHorizontal: -Space.s4,
  },
  rowScroll: {
    flexGrow: 0,
  },
  row: {
    gap: Space.s2,
    paddingHorizontal: Space.s4,
  },
  centered: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  fade: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: Space.s4,
  },
});
