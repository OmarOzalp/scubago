import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { OceanButton } from '@/components/ocean-button';
import { Segmented } from '@/components/segmented';
import { SightingRow } from '@/components/sighting-row';
import { SpeciesAvatar } from '@/components/species-avatar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { CATALOG, CATALOG_BY_ID } from '@/lib/catalog';
import { deriveDex } from '@/lib/dex';
import { CATEGORY_LABEL, CATEGORY_ORDER, RARITY_COLOR, RARITY_LABEL, rarityRank } from '@/lib/rarity';
import { useAllSites, useAppStore, useMySightings } from '@/lib/store';
import type { Category, DexEntry, Species } from '@/lib/types';

type Mode = 'sightings' | 'species';

export default function LogbookScreen() {
  const insets = useSafeAreaInsets();
  const user = useAppStore((s) => s.user);
  const backendEnabled = useAppStore((s) => s.backendEnabled);
  const [mode, setMode] = useState<Mode>('sightings');
  const mySightings = useMySightings();
  const sites = useAllSites();
  const sitesById = useMemo(() => new Map(sites.map((s) => [s.id, s])), [sites]);

  const dex = useMemo(() => deriveDex(mySightings, CATALOG_BY_ID), [mySightings]);
  const dexById = useMemo(() => new Map(dex.map((d) => [d.species.id, d])), [dex]);
  const rarest = dex[0];

  const sorted = useMemo(
    () =>
      [...mySightings].sort((a, b) =>
        b.sightedOn === a.sightedOn
          ? b.createdAt.localeCompare(a.createdAt)
          : b.sightedOn.localeCompare(a.sightedOn),
      ),
    [mySightings],
  );

  const byCategory = useMemo(() => {
    const groups = new Map<Category, Species[]>();
    for (const cat of CATEGORY_ORDER) groups.set(cat, []);
    for (const s of CATALOG) groups.get(s.category)?.push(s);
    for (const list of groups.values()) {
      list.sort((a, b) => rarityRank(a.rarity) - rarityRank(b.rarity));
    }
    return groups;
  }, []);

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + Spacing.three, paddingBottom: BottomTabInset + Spacing.six },
        ]}>
        <View style={styles.titleRow}>
          <ThemedText type="subtitle">My Log</ThemedText>
          {backendEnabled ? (
            <Pressable onPress={() => router.push('/auth')} hitSlop={8}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                {user ? `@${user.username}` : 'Sign in to sync'}
              </ThemedText>
            </Pressable>
          ) : null}
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <Stat value={dex.length} label={`of ${CATALOG.length} species`} />
          <Stat value={mySightings.length} label="sightings" />
          {rarest ? (
            <View style={styles.stat}>
              <ThemedText
                type="smallBold"
                style={{ color: RARITY_COLOR[rarest.species.rarity], fontSize: 18 }}
                numberOfLines={1}>
                {rarest.species.commonName}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                rarest find ({RARITY_LABEL[rarest.species.rarity].toLowerCase()})
              </ThemedText>
            </View>
          ) : null}
        </View>

        <Segmented<Mode>
          options={[
            { value: 'sightings', label: 'Sightings' },
            { value: 'species', label: `Species ${dex.length}/${CATALOG.length}` },
          ]}
          value={mode}
          onChange={setMode}
        />

        {mode === 'sightings' ? (
          sorted.length === 0 ? (
            <EmptyState />
          ) : (
            <View style={styles.list}>
              {sorted.map((s) => {
                const species = CATALOG_BY_ID.get(s.speciesId);
                if (!species) return null;
                return (
                  <SightingRow
                    key={s.id}
                    sighting={s}
                    species={species}
                    site={sitesById.get(s.siteId)}
                    onPress={() => router.push(`/species/${species.id}`)}
                  />
                );
              })}
            </View>
          )
        ) : (
          <View style={styles.dex}>
            {CATEGORY_ORDER.map((cat) => {
              const speciesList = byCategory.get(cat) ?? [];
              if (speciesList.length === 0) return null;
              const seenCount = speciesList.filter((s) => dexById.has(s.id)).length;
              return (
                <View key={cat} style={styles.dexSection}>
                  <View style={styles.dexHeader}>
                    <ThemedText type="smallBold">{CATEGORY_LABEL[cat]}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {seenCount}/{speciesList.length}
                    </ThemedText>
                  </View>
                  <View style={styles.dexGrid}>
                    {speciesList.map((s) => (
                      <DexCell key={s.id} species={s} entry={dexById.get(s.id)} />
                    ))}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </ThemedView>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <ThemedText type="smallBold" style={{ fontSize: 18 }}>
        {value}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </View>
  );
}

function EmptyState() {
  return (
    <View style={styles.empty}>
      <ThemedText style={{ fontSize: 44 }}>🤿</ThemedText>
      <ThemedText type="smallBold">Nothing logged yet</ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
        Log your first sighting and start your collection.
      </ThemedText>
      <OceanButton title="Log a sighting" onPress={() => router.push('/log/new')} />
    </View>
  );
}

function DexCell({ species, entry }: { species: Species; entry?: DexEntry }) {
  const seen = !!entry;
  return (
    <Pressable onPress={() => router.push(`/species/${species.id}`)} style={styles.dexCell}>
      <View>
        <SpeciesAvatar species={species} size={60} showRarityRing muted={!seen} />
        {seen && entry.count > 1 ? (
          <View style={[styles.countBadge, { backgroundColor: RARITY_COLOR[species.rarity] }]}>
            <ThemedText type="small" style={styles.countBadgeText}>
              ×{entry.count}
            </ThemedText>
          </View>
        ) : null}
      </View>
      <ThemedText
        type="small"
        themeColor={seen ? 'text' : 'textSecondary'}
        style={[styles.dexName, !seen && { opacity: 0.6 }]}
        numberOfLines={2}>
        {species.commonName}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.three,
    gap: Spacing.three,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.four,
  },
  stat: {
    gap: 1,
    flexShrink: 1,
  },
  list: {
    gap: Spacing.two,
  },
  empty: {
    alignItems: 'center',
    gap: Spacing.two + 2,
    paddingVertical: Spacing.six,
    paddingHorizontal: Spacing.four,
  },
  dex: {
    gap: Spacing.four,
  },
  dexSection: {
    gap: Spacing.two,
  },
  dexHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  dexGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  dexCell: {
    width: '22.5%',
    alignItems: 'center',
    gap: 4,
  },
  dexName: {
    textAlign: 'center',
    fontSize: 11,
    lineHeight: 14,
  },
  countBadge: {
    position: 'absolute',
    right: -4,
    top: -4,
    borderRadius: 999,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  countBadgeText: {
    color: '#fff',
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
  },
});
