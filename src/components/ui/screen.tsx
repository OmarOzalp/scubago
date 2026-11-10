import type { ReactNode } from 'react';
import type { Ref } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type ScrollViewInstance, type ScrollViewProps, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { MaxContentWidth, Size, Space, TabBarOverhang, TypeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ScreenProps = Omit<ScrollViewProps, 'contentContainerStyle' | 'children'> & {
  children: ReactNode;
  /**
   * tab: a tab screen (no stack bar): pads for the status bar, and leaves room for the tab bar's raised Log
   * button. pushed (default): a page under the stack's bar; its ScreenTitle sits 8 under the bar. modal: a
   * sheet under its bar title.
   */
  kind?: 'tab' | 'pushed' | 'modal';
  /** false: the children fill the screen without scrolling (a map, a FlatList of their own). */
  scroll?: boolean;
  /** Extra layout for the column (the gutter, the 16 between blocks and the bottom room stay). */
  contentStyle?: StyleProp<ViewStyle>;
  /** The scroll view itself, for a form that scrolls to a field. */
  scrollRef?: Ref<ScrollViewInstance>;
};

/**
 * The page: the page colour, safe areas, a centred column 720 wide at most with the 16 gutter, and 16
 * between blocks (a Section adds 16 more above itself, so sections are 32 apart).
 */
export function Screen({ children, kind = 'pushed', scroll = true, contentStyle, scrollRef, ...scrollProps }: ScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const top = kind === 'tab' ? insets.top + Space.s3 : kind === 'pushed' ? Space.s2 : Space.s4;
  const bottom = kind === 'tab' ? TabBarOverhang + Space.s6 : insets.bottom + Space.s8;
  const column = [styles.column, { paddingTop: top, paddingBottom: bottom }, contentStyle];
  if (!scroll) return <View style={[styles.fill, { backgroundColor: theme.background }, column]}>{children}</View>;
  return (
    <ScrollView ref={scrollRef} keyboardShouldPersistTaps="handled" {...scrollProps} style={[styles.fill, { backgroundColor: theme.background }, scrollProps.style]} contentContainerStyle={column}>
      {children}
    </ScrollView>
  );
}

export type ScreenTitleProps = {
  title: string;
  /** One line under the title (footnote, secondary). */
  subtitle?: string;
  /** IconButtons (or one small Button) on the right, centred on the title's first line. */
  actions?: ReactNode;
  /** Something that belongs to the title itself, right after it (Home's rename pencil). */
  accessory?: ReactNode;
  numberOfLines?: number;
};

/** A screen's title in `display`, read as a header, with optional actions on the right. */
export function ScreenTitle({ title, subtitle, actions, accessory, numberOfLines = 2 }: ScreenTitleProps) {
  const theme = useTheme();
  return (
    <View style={styles.titleRow}>
      <View style={styles.titleText}>
        <View style={styles.titleLine}>
          <Text accessibilityRole="header" numberOfLines={numberOfLines} style={[TypeScale.display, styles.shrink, { color: theme.text }]}>
            {title}
          </Text>
          {accessory}
        </View>
        {subtitle ? <Text style={[TypeScale.footnote, { color: theme.textSecondary }]}>{subtitle}</Text> : null}
      </View>
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  );
}

export type SectionProps = {
  title: string;
  /** A plain tint link on the right ("Field guide ›"). */
  action?: { label: string; onPress: () => void; accessibilityLabel?: string; role?: 'link' | 'button' };
  /** Or anything else on the right (a count). */
  accessory?: ReactNode;
  children?: ReactNode;
  /** No 16 above (the first block under a title, or a section in a grid of its own). */
  flush?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** A headline over its content, 12 above it; 32 from the block before it. */
export function Section({ title, action, accessory, children, flush = false, style }: SectionProps) {
  const theme = useTheme();
  return (
    <View style={[styles.section, !flush && styles.sectionGap, style]}>
      <View style={styles.sectionHeader}>
        <Text accessibilityRole="header" numberOfLines={1} style={[TypeScale.headline, styles.shrink, styles.grow, { color: theme.text }]}>
          {title}
        </Text>
        {accessory}
        {action ? <SectionLink {...action} /> : null}
      </View>
      {children}
    </View>
  );
}

/** "Field guide ›": a tint label and a small chevron, 44 to hit without making the header taller. */
export function SectionLink({ label, onPress, accessibilityLabel, role = 'link' }: { label: string; onPress: () => void; accessibilityLabel?: string; role?: 'link' | 'button' }) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole={role} accessibilityLabel={accessibilityLabel ?? label} style={({ pressed }) => [styles.link, { opacity: pressed ? 0.6 : 1 }]}>
      <Text style={[TypeScale.subheadStrong, { color: theme.tint }]}>{label}</Text>
      <Icon name="chevronRight" size={14} color={theme.tint} weight="bold" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  column: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Space.s4,
    gap: Space.s4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.s3,
    minHeight: Size.hit,
  },
  titleText: {
    flex: 1,
    gap: 2,
  },
  titleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s1,
  },
  shrink: {
    flexShrink: 1,
  },
  grow: {
    flexGrow: 1,
  },
  // Centred on the title's first line (36), whatever is under it.
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s2,
    height: TypeScale.display.lineHeight,
  },
  section: {
    gap: Space.s3,
  },
  sectionGap: {
    marginTop: Space.s4,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s3,
    minHeight: 22,
  },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minHeight: Size.hit,
    marginVertical: -11,
    paddingLeft: Space.s2,
  },
});
