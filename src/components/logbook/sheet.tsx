import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { continuous } from '@/components/ui/surface';
import { Elevation, Radius } from '@/constants/theme';
import { useSchemeName, useTheme } from '@/hooks/use-theme';

const CORNER = Radius.md;
/** How far each page under this one shows past its edge. */
const EDGE_STEP = 3;

/** How many page edges to draw for the pages on one side: one for a page or two, two for a few, three for a stack. */
export function edgeCount(pages: number): number {
  return pages <= 0 ? 0 : pages <= 2 ? 1 : pages <= 9 ? 2 : 3;
}

/**
 * One leaf of the book: a sheet in the page colour with a soft shadow (a hairline at night), and the
 * edges of the pages under it showing at the side where there are more (older pages to the left, newer
 * to the right). The cover is bound in the twilight blue. The children scroll inside the sheet.
 */
export function Sheet({
  children,
  before,
  after,
  cover = false,
  style,
}: {
  children: ReactNode;
  /** Leaves to the left of this one (the cover and older pages). */
  before: number;
  /** Leaves to the right of this one (newer pages). */
  after: number;
  cover?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const scheme = useSchemeName();
  const e = Elevation[scheme];
  const paper = cover ? theme.twilight : theme.background;
  const edge = { backgroundColor: theme.backgroundElement, borderColor: theme.cardBorder };
  const edges = (side: 'left' | 'right', n: number) =>
    Array.from({ length: edgeCount(n) }, (_, i) => {
      const out = EDGE_STEP * (edgeCount(n) - i);
      return <View key={`${side}-${i}`} style={[styles.edge, edge, { [side]: -out, top: out + 2, bottom: out + 2 }]} />;
    });
  return (
    <View style={[styles.wrap, style]}>
      {/* The pages underneath: decorative, drawn first so the sheet lies on them. */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {edges('left', before)}
        {edges('right', after)}
      </View>
      <View style={[styles.sheet, { backgroundColor: paper }, e.cardBorder ? { borderWidth: 1, borderColor: theme.cardBorder } : { boxShadow: e.raised }]}>
        <View style={styles.clip}>{children}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
  },
  edge: {
    position: 'absolute',
    width: 40,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: CORNER,
    ...continuous,
  },
  sheet: {
    flex: 1,
    borderRadius: CORNER,
    ...continuous,
  },
  clip: {
    flex: 1,
    borderRadius: CORNER,
    ...continuous,
    overflow: 'hidden',
  },
});
