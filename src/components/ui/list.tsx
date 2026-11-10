import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, Text, View, type AccessibilityState, type StyleProp, type ViewStyle } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { pressColorTransition } from '@/components/ui/press';
import { continuous, useSurface } from '@/components/ui/surface';
import { Radius, Size, Space, TypeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Where a row sits in its group: a virtualized list (FlatList) draws the group's corners row by row. */
export type RowPosition = 'only' | 'first' | 'middle' | 'last';

export type ListProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/**
 * One grouped card of rows, hairlines between them. Put ListRows in it; anything else is laid in as it is.
 * (A long, windowed list can't be wrapped in one card: give each ListRow its `position` instead.)
 */
export function List({ children, style }: ListProps) {
  const surface = useSurface();
  const rows = Children.toArray(children).filter(isValidElement) as ReactElement<ListRowProps>[];
  return (
    <View style={[surface, styles.list, style]}>
      {rows.map((row, index) => (isRow(row) ? cloneElement(row, { separator: index > 0, inGroup: true }) : row))}
    </View>
  );
}

/** A component that draws a ListRow inside (a sighting row) says so with `groupRow = true`, and a List hands it its place. */
function isRow(element: ReactElement<ListRowProps>): boolean {
  return element.type === ListRow || (element.type as { groupRow?: boolean }).groupRow === true;
}

export type ListRowProps = {
  title: string;
  /** The title wraps to two lines where it must (a long name, a link's title); one by default. */
  titleLines?: 1 | 2;
  /** One or two lines under the title (subhead, secondary); up to four for a row that explains something (the help page). */
  subtitle?: string;
  subtitleLines?: 1 | 2 | 3 | 4;
  /** A further short line in a colour of its own (a passport stamp's date, in stamp red). */
  meta?: { text: string; color: string };
  /** An icon tile (40) by icon name, or your own node (a 44 thumbnail). */
  leading?: IconName | ReactNode;
  /** A chevron (default for a row that goes somewhere), a short value, a switch, or nothing. */
  trailing?: 'chevron' | 'none' | ReactNode;
  /** A value on the right ("3 stamps"), before the chevron. */
  value?: string;
  /** The row is a switch: the whole row toggles it, and the switch only shows its state. */
  switchValue?: boolean;
  /** Something under the subtitle (tags saying where a sighting stands). */
  below?: ReactNode;
  onPress?: () => void;
  accessibilityRole?: 'button' | 'link' | 'switch' | 'checkbox' | 'radio';
  /** Defaults to "Title. Subtitle". */
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityState?: AccessibilityState;
  /** The row opens and closes something under it (a disclosure): read as expanded or collapsed. */
  expanded?: boolean;
  /** Edged in the tint colour (the site whose card is open). */
  selected?: boolean;
  testID?: string;
  /** Set by List: draws the inset hairline above the row. */
  separator?: boolean;
  /** Set by List. */
  inGroup?: boolean;
  /** For a row of a windowed list, outside a List: its place in the group, so it draws the group's corners. */
  position?: RowPosition;
};

/** The one row: leading tile, title (bodyStrong, one line), subtitle, trailing chevron, value or switch. 56 tall at least. */
export function ListRow({
  title,
  titleLines = 1,
  subtitle,
  subtitleLines = 1,
  below,
  meta,
  leading,
  trailing,
  value,
  switchValue,
  onPress,
  accessibilityRole,
  accessibilityLabel,
  accessibilityHint,
  accessibilityState,
  expanded,
  selected = false,
  testID,
  separator = false,
  inGroup = false,
  position,
}: ListRowProps) {
  const theme = useTheme();
  const isSwitch = switchValue !== undefined;
  const tile = typeof leading === 'string' ? <IconTile icon={leading as IconName} /> : (leading ?? null);
  // One slot as wide as a thumbnail (44), so the titles of rows with a tile and rows with a thumbnail line up.
  const lead = tile ? <View style={styles.lead}>{tile}</View> : null;
  const end = isSwitch ? (
    <View pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <Switch value={switchValue} onValueChange={onPress} trackColor={{ true: theme.lagoon, false: theme.backgroundSelected }} />
    </View>
  ) : trailing === 'none' ? null : trailing === undefined || trailing === 'chevron' ? (
    onPress ? <Icon name="chevronRight" size={16} color={theme.textTertiary} weight="bold" /> : null
  ) : (
    trailing
  );
  // The hairline starts where the text does: after the gutter, and after the leading tile when there is one.
  const inset = Space.s4 + (lead ? Size.thumb + Space.s3 : 0);
  const grouped = !inGroup && position ? groupStyle(position) : null;
  const showSeparator = separator || position === 'middle' || position === 'last';
  const body = (
    <>
      {showSeparator ? <View style={[styles.hairline, { left: inset, backgroundColor: theme.rule }]} /> : null}
      {lead}
      <View style={styles.text}>
        <Text numberOfLines={titleLines} maxFontSizeMultiplier={1.6} style={[styles.title, { color: theme.text }]}>
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={subtitleLines} maxFontSizeMultiplier={1.6} style={[styles.subtitle, { color: theme.textSecondary }]}>
            {subtitle}
          </Text>
        ) : null}
        {meta ? (
          <Text numberOfLines={1} maxFontSizeMultiplier={1.6} style={[styles.subtitle, { color: meta.color }]}>
            {meta.text}
          </Text>
        ) : null}
        {below}
      </View>
      {value ? (
        <Text numberOfLines={1} style={[styles.value, { color: theme.textSecondary }]}>
          {value}
        </Text>
      ) : null}
      {end}
      {selected ? <View pointerEvents="none" style={[styles.selected, grouped, { borderColor: theme.tint }]} /> : null}
    </>
  );
  const label = accessibilityLabel ?? (subtitle ? `${title}. ${subtitle}` : title);
  if (!onPress) {
    return (
      <View testID={testID} accessible accessibilityLabel={label} style={[styles.row, grouped && [rowFill(theme), grouped]]}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      accessibilityRole={isSwitch ? 'switch' : (accessibilityRole ?? 'button')}
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      aria-checked={accessibilityRole === 'checkbox' || accessibilityRole === 'radio' ? selected : undefined}
      aria-expanded={expanded}
      accessibilityState={isSwitch ? { checked: switchValue, ...accessibilityState } : { ...(selected ? { selected: true } : null), ...(expanded !== undefined ? { expanded } : null), ...accessibilityState }}
      style={({ pressed }) => [
        styles.row,
        grouped && [rowFill(theme), grouped],
        pressColorTransition,
        { backgroundColor: pressed ? theme.backgroundSelected : grouped ? theme.backgroundElement : 'transparent' },
      ]}>
      {body}
    </Pressable>
  );
}

// A row of a windowed group: the surface's colour (no shadow, since it would fall between rows).
function rowFill(theme: ReturnType<typeof useTheme>): ViewStyle {
  return { backgroundColor: theme.backgroundElement };
}

function groupStyle(position: RowPosition): ViewStyle {
  const top = position === 'only' || position === 'first' ? Radius.lg : 0;
  const bottom = position === 'only' || position === 'last' ? Radius.lg : 0;
  return { borderTopLeftRadius: top, borderTopRightRadius: top, borderBottomLeftRadius: bottom, borderBottomRightRadius: bottom, ...continuous };
}

/** The 40 tile at the start of a row: a soft lagoon square with the icon in tint. */
export function IconTile({ icon, tone = 'lagoon', size = Size.iconTile }: { icon: IconName; tone?: 'lagoon' | 'coral' | 'sun' | 'neutral'; size?: number }) {
  const theme = useTheme();
  const fill = tone === 'coral' ? theme.coralSoft : tone === 'sun' ? theme.sunSoft : tone === 'neutral' ? theme.backgroundSelected : theme.lagoonSoft;
  const ink = tone === 'coral' ? theme.stamp : tone === 'neutral' ? theme.textSecondary : tone === 'sun' ? theme.text : theme.tint;
  return (
    <View aria-hidden style={[styles.tile, { width: size, height: size, backgroundColor: fill }]}>
      <Icon name={icon} size={Math.round(size * 0.55)} color={ink} />
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s3,
    minHeight: Size.rowMin,
    paddingVertical: Space.s3,
    paddingHorizontal: Space.s4,
  },
  hairline: {
    position: 'absolute',
    top: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...TypeScale.bodyStrong,
  },
  subtitle: {
    ...TypeScale.subhead,
  },
  value: {
    ...TypeScale.subhead,
    flexShrink: 0,
  },
  selected: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 2,
  },
  lead: {
    width: Size.thumb,
    alignItems: 'flex-start',
  },
  tile: {
    borderRadius: Radius.sm,
    ...continuous,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
