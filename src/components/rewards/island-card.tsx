import { Pressable, StyleSheet, Text, View } from 'react-native';

import { IslandArt } from '@/components/home/island-art';
import { Icon } from '@/components/icon';
import { Paper } from '@/components/journal/paper';
import { ProgressBar } from '@/components/journal/progress-bar';
import { Tag } from '@/components/journal/tag';
import { longDate, plural, stampDate } from '@/components/rewards/format';
import { RarityChip } from '@/components/rarity-chip';
import { SpeciesArt } from '@/components/species-art';
import { ThemedText } from '@/components/themed-text';
import { Radius, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ISLANDS } from '@/lib/archipelago';
import { CATALOG_BY_ID } from '@/lib/catalog';
import { HABITATS } from '@/lib/home';
import type { IslandResult } from '@/lib/rewards';

/** What a screen reader says for an island card. */
export function islandLabel(island: IslandResult): string {
  const residents = `${island.residentsFound} of ${island.residentsTotal} residents found`;
  if (!island.unlocked) return `${island.name}, locked. ${island.requirement ?? ''} ${residents}.`.replace(/\s+/g, ' ');
  return `${island.name}, ${island.unlockedOn ? `raised ${longDate(island.unlockedOn)}` : 'your home island'}. ${residents}.`;
}

/**
 * One island of the archipelago: its picture (under mist while locked), how many residents are found,
 * and who to look for next. A raised island's picture and name open the island itself (`onOpen`); a
 * locked one has nothing to open yet.
 */
export function IslandCard({
  island,
  onOpen,
  onOpenSpecies,
}: {
  island: IslandResult;
  onOpen?: (islandId: IslandResult['id']) => void;
  onOpenSpecies?: (speciesId: string) => void;
}) {
  const theme = useTheme();
  const habitat = HABITATS.find((h) => h.id === ISLANDS[island.id])!;
  const raisedBy = island.raisedBy ? CATALOG_BY_ID.get(island.raisedBy)?.commonName : undefined;
  const open = island.unlocked ? onOpen : undefined;
  const head = (
    <>
      <View style={[styles.art, { backgroundColor: habitat.water }]}>
        <View style={styles.zoom}>
          <IslandArt habitat={habitat.id} level={1} />
        </View>
        {island.unlocked ? null : (
          <View style={[StyleSheet.absoluteFill, styles.mist, { backgroundColor: theme.backgroundElement }]}>
            <View style={[styles.lock, { borderColor: theme.textSecondary, backgroundColor: theme.backgroundElement }]}>
              <Icon name="lock" size={22} color={theme.text} />
            </View>
          </View>
        )}
      </View>
      <View style={styles.info}>
        <View style={styles.nameRow}>
          <View aria-hidden style={[styles.dot, { backgroundColor: island.color }]} />
          <Text style={[styles.name, { color: theme.text }]}>{island.name}</Text>
          {open ? <Icon name="chevronRight" size={18} color={theme.textSecondary} weight="bold" /> : null}
        </View>
        {island.unlocked ? (
          <Tag
            label={island.unlockedOn ? `Raised ${stampDate(island.unlockedOn)}` : 'Your home island'}
            color={theme.turquoise}
            text={theme.text}
            small
          />
        ) : (
          <Tag label="Locked" dashed small />
        )}
        <ThemedText type="small" themeColor="textSecondary">
          {island.unlocked ? (raisedBy ? `Rose when you logged ${raisedBy}.` : 'Where every animal not at another island swims.') : (island.requirement ?? '')}
        </ThemedText>
      </View>
    </>
  );
  const body = (
    <>
      {open ? (
        <Pressable
          onPress={() => open(island.id)}
          accessibilityRole="link"
          accessibilityLabel={islandLabel(island)}
          accessibilityHint="Opens the island full screen"
          style={({ pressed }) => [styles.top, { opacity: pressed ? 0.7 : 1 }]}>
          {head}
        </Pressable>
      ) : (
        <View style={styles.top} accessible accessibilityLabel={islandLabel(island)}>
          {head}
        </View>
      )}
      <ThemedText type="caption" themeColor="textSecondary">
        {island.blurb}
      </ThemedText>
      <View style={styles.residents}>
        <Text style={[styles.count, { color: theme.text }]}>
          {island.residentsFound}
          <Text style={{ fontFamily: Type.body, color: theme.textSecondary }}> of {plural(island.residentsTotal, 'resident')} found</Text>
        </Text>
        <ProgressBar
          fraction={island.residentsTotal > 0 ? island.residentsFound / island.residentsTotal : 0}
          max={island.residentsTotal}
          now={island.residentsFound}
          accessibilityLabel={`${island.residentsFound} of ${island.residentsTotal} residents found`}
        />
      </View>
      {island.next.length > 0 ? (
        <View style={styles.lookFor}>
          <ThemedText type="label">Look for</ThemedText>
          <View style={styles.targets}>
            {island.next.map((target) => {
              const species = CATALOG_BY_ID.get(target.speciesId);
              if (!species) return null;
              return (
                <Pressable
                  key={target.speciesId}
                  onPress={onOpenSpecies ? () => onOpenSpecies(target.speciesId) : undefined}
                  disabled={!onOpenSpecies}
                  accessibilityRole={onOpenSpecies ? 'link' : undefined}
                  accessibilityLabel={`${target.name}, ${target.rarity}, not seen yet`}
                  style={({ pressed }) => [styles.target, { borderColor: theme.rule, opacity: pressed ? 0.65 : 1 }]}>
                  <SpeciesArt species={species} width={78} found={false} paper={theme.backgroundElement} />
                  <Text numberOfLines={2} style={[styles.targetName, { color: theme.text }]}>
                    {target.name}
                  </Text>
                  <RarityChip rarity={target.rarity} small />
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : (
        <ThemedText type="caption" themeColor="textSecondary">
          Every resident found.
        </ThemedText>
      )}
    </>
  );
  // A locked island is a pencil outline on the page; a raised one is a sheet of paper.
  return island.unlocked ? (
    <Paper style={styles.card}>{body}</Paper>
  ) : (
    <View style={[styles.card, styles.locked, { borderColor: theme.textSecondary }]}>{body}</View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 14,
  },
  locked: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: Radius.lg,
    padding: 16,
  },
  top: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'flex-start',
  },
  art: {
    width: 118,
    height: 110,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  zoom: {
    flex: 1,
    transform: [{ scale: 1.5 }],
  },
  mist: {
    opacity: 0.74,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lock: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    gap: 6,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 11,
    height: 11,
    borderRadius: 6,
  },
  name: {
    flex: 1,
    fontFamily: Type.display,
    fontSize: 21,
    lineHeight: 26,
  },
  residents: {
    gap: 6,
  },
  count: {
    fontFamily: Type.bodyHeavy,
    fontSize: 15,
    lineHeight: 20,
  },
  lookFor: {
    gap: 8,
  },
  targets: {
    flexDirection: 'row',
    gap: 8,
  },
  target: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: Radius.md,
    paddingVertical: 8,
    paddingHorizontal: 4,
    minHeight: 44,
  },
  targetName: {
    fontFamily: Type.bodyHeavy,
    fontSize: 13,
    lineHeight: 16,
    textAlign: 'center',
    minHeight: 32,
  },
});
