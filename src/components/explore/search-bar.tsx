import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { usePressScale } from '@/components/ui/press';
import { continuous } from '@/components/ui/surface';
import { SearchField } from '@/components/ui/text-field';
import { Radius, Size, Space, TypeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** What the bar says before anything is typed, and what the field is called to a screen reader. */
export const SEARCH_PLACEHOLDER = 'Search dive sites or animals';

/**
 * Explore's one search bar: a button that opens the search while it is closed, and the text field
 * (with Cancel) while it is open. Return picks the top result (`onSubmit`); Escape on the web closes it.
 * Both are the design system's SearchField.
 */
export function SearchBar({
  searching,
  query,
  onQueryChange,
  onOpen,
  onCancel,
  onSubmit,
}: {
  searching: boolean;
  query: string;
  onQueryChange: (query: string) => void;
  onOpen: () => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  if (!searching) {
    return (
      <SearchField
        value=""
        placeholder={SEARCH_PLACEHOLDER}
        accessibilityHint="Find a dive site or a place, or where to see an animal"
        onPress={onOpen}
      />
    );
  }
  // Return picks a result and closes the search; with nothing to pick the keyboard stays.
  return <SearchField autoFocus value={query} onChangeText={onQueryChange} placeholder={SEARCH_PLACEHOLDER} onSubmit={onSubmit} onCancel={onCancel} />;
}

/**
 * The filter the map or list is showing, edged in coral like the pins it lights up: an animal's
 * sites, or a place's. Tapping it clears the filter.
 */
export function FilterChip({
  leading,
  title,
  subtitle,
  accessibilityLabel,
  onClear,
}: {
  leading: ReactNode;
  title: string;
  subtitle: string;
  accessibilityLabel: string;
  onClear: () => void;
}) {
  const theme = useTheme();
  const scale = usePressScale();
  return (
    <Pressable
      onPress={onClear}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.filter, { backgroundColor: theme.backgroundElement, borderColor: theme.coral }, scale(pressed)]}>
      {leading}
      <View style={styles.filterText}>
        <Text numberOfLines={1} style={[TypeScale.bodyStrong, { color: theme.text }]}>
          {title}
        </Text>
        <Text numberOfLines={1} style={[TypeScale.footnote, { color: theme.textSecondary }]}>
          {subtitle}
        </Text>
      </View>
      <View style={[styles.closeDot, { backgroundColor: theme.backgroundSelected }]}>
        <Icon name="close" size={14} color={theme.textSecondary} weight="bold" />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // A line in the colour it filters by, and no shadow with it.
  filter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s3,
    minHeight: Size.rowMin,
    borderRadius: Radius.md,
    ...continuous,
    borderWidth: 1.5,
    paddingLeft: Space.s2,
    paddingRight: Space.s3,
    paddingVertical: Space.s2,
  },
  filterText: {
    flex: 1,
  },
  closeDot: {
    width: 28,
    height: 28,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
