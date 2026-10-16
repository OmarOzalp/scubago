import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { FormField } from '@/components/form-field';
import { Icon } from '@/components/icon';
import { PaperButton } from '@/components/journal/paper';
import { OceanButton } from '@/components/ocean-button';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { siteAddedBy } from '@/lib/site-details';
import { searchSites } from '@/lib/text-search';
import type { DiveSite } from '@/lib/types';

/**
 * Choosing the dive site: a search, the diver's recent sites, then every site, and a way to add one
 * that isn't listed (it comes back through onSiteAdded in lib/site-added).
 */
export function SitePicker({
  sites,
  recentSiteIds,
  userId,
  onPick,
}: {
  sites: DiveSite[];
  recentSiteIds: string[];
  userId: string | undefined;
  onPick: (site: DiveSite) => void;
}) {
  const [query, setQuery] = useState('');
  const searching = query.trim().length > 0;

  const recent = recentSiteIds.map((id) => sites.find((s) => s.id === id)).filter((s): s is DiveSite => !!s);
  const listed = useMemo(
    () => (searching ? searchSites(sites, query) : [...sites].sort((a, b) => a.name.localeCompare(b.name))),
    [sites, query, searching],
  );

  return (
    <ScrollView contentContainerStyle={styles.picker} keyboardShouldPersistTaps="handled">
      <FormField
        label="Where did you dive?"
        value={query}
        onChangeText={setQuery}
        placeholder="Search sites, regions, countries…"
        autoCorrect={false}
        returnKeyType="search"
      />
      {!searching && recent.length > 0 ? (
        <>
          <ThemedText type="label" accessibilityRole="header" style={styles.groupLabel}>
            Recent
          </ThemedText>
          {recent.map((s) => (
            <SiteRow key={`recent-${s.id}`} site={s} userId={userId} recent onPress={() => onPick(s)} />
          ))}
          <ThemedText type="label" accessibilityRole="header" style={styles.groupLabel}>
            All sites
          </ThemedText>
        </>
      ) : null}
      {listed.map((s) => (
        <SiteRow key={s.id} site={s} userId={userId} onPress={() => onPick(s)} />
      ))}
      {searching && listed.length === 0 ? (
        <ThemedText type="caption" themeColor="textSecondary" accessibilityLiveRegion="polite">
          No site matches “{query.trim()}”.
        </ThemedText>
      ) : null}
      <OceanButton
        title="Can’t find it? Add a dive site"
        icon="addSite"
        variant="secondary"
        onPress={() => router.push({ pathname: '/add-site', params: { then: 'log', name: query.trim() } })}
        style={{ marginTop: Spacing.two }}
      />
    </ScrollView>
  );
}

function SiteRow({ site, userId, recent = false, onPress }: { site: DiveSite; userId: string | undefined; recent?: boolean; onPress: () => void }) {
  const theme = useTheme();
  const addedBy = siteAddedBy(site, userId);
  const where = `${site.region}, ${site.country}${addedBy ? ` · added by ${addedBy}` : ''}`;
  return (
    <PaperButton onPress={onPress} accessibilityLabel={`${site.name}, ${where}`} style={styles.row}>
      <View style={[styles.rowIcon, { backgroundColor: recent ? `${theme.wash}66` : theme.backgroundSelected }]}>
        <Icon name={recent ? 'clock' : 'pin'} size={20} />
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Text numberOfLines={2} style={[styles.rowTitle, { color: theme.text }]}>
          {site.name}
        </Text>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
          {where}
        </ThemedText>
      </View>
      <Icon name="chevronRight" size={16} color={theme.textSecondary} weight="bold" />
    </PaperButton>
  );
}

const styles = StyleSheet.create({
  picker: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.three, gap: Spacing.two + 2 },
  groupLabel: { marginTop: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: Radius.md,
    padding: 10,
    paddingRight: 12,
    minHeight: 64,
  },
  rowIcon: { width: 40, height: 40, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontFamily: Type.bodyHeavy, fontSize: 15, lineHeight: 20 },
});
