import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { IslandArt } from '@/components/home/island-art';
import { Icon } from '@/components/icon';
import { longDate, plural, stampDate } from '@/components/rewards/format';
import { CARD_GAP, cardWidthFor, onGridLayout, SpeciesCard } from '@/components/species-card';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { usePressScale } from '@/components/ui/press';
import { ProgressBar } from '@/components/ui/progress';
import { Tag } from '@/components/ui/tag';
import { Radius, Size, Space, TypeScale } from '@/constants/theme';
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

/** The gap between the animals to look for. */
const TARGET_GAP = CARD_GAP;

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
  const scale = usePressScale();
  // The row of animals to look for: three across, as in a grid, measured (a phone's width to begin with).
  const [inner, setInner] = useState(310);
  const targetWidth = cardWidthFor(inner, 3);
  const habitat = HABITATS.find((h) => h.id === ISLANDS[island.id])!;
  const raisedBy = island.raisedBy ? CATALOG_BY_ID.get(island.raisedBy)?.commonName : undefined;
  const open = island.unlocked ? onOpen : undefined;
  // One line under the tag: what raised it, or what will. Home's island needs none ("Your home island" is its tag).
  const line = island.unlocked ? (raisedBy ? `Rose with your ${raisedBy}.` : null) : (island.requirement ?? null);
  const head = (
    <>
      <View style={[styles.art, { backgroundColor: habitat.water }]}>
        <View style={styles.zoom}>
          <IslandArt habitat={habitat.id} level={1} />
        </View>
        {island.unlocked ? null : (
          <View style={[StyleSheet.absoluteFill, styles.mist, { backgroundColor: theme.backgroundElement }]}>
            <View style={[styles.lock, { backgroundColor: theme.backgroundElement }]}>
              <Icon name="lock" size={Size.icon} color={theme.text} />
            </View>
          </View>
        )}
      </View>
      <View style={styles.info}>
        <View style={styles.nameRow}>
          <View aria-hidden style={[styles.dot, { backgroundColor: island.color }]} />
          <Text style={[TypeScale.headline, styles.name, { color: theme.text }]}>{island.name}</Text>
          {open ? <Icon name="chevronRight" size={16} color={theme.textTertiary} weight="bold" /> : null}
        </View>
        {island.unlocked ? (
          <Tag label={island.unlockedOn ? `Raised ${stampDate(island.unlockedOn)}` : 'Your home island'} tone="lagoon" />
        ) : (
          <Tag label="Locked" dashed />
        )}
        {line ? (
          <ThemedText type="subhead" themeColor="textSecondary">
            {line}
          </ThemedText>
        ) : null}
      </View>
    </>
  );
  return (
    <Card style={styles.card}>
      {open ? (
        <Pressable
          onPress={() => open(island.id)}
          accessibilityRole="link"
          accessibilityLabel={islandLabel(island)}
          accessibilityHint="Opens the island full screen"
          style={({ pressed }) => [styles.top, scale(pressed)]}>
          {head}
        </Pressable>
      ) : (
        <View style={styles.top} accessible accessibilityLabel={islandLabel(island)}>
          {head}
        </View>
      )}
      <View style={styles.residents}>
        <Text style={[TypeScale.subhead, { color: theme.textSecondary }]}>
          <Text style={[TypeScale.subheadStrong, { color: theme.text }]}>{island.residentsFound}</Text> of {plural(island.residentsTotal, 'resident')} found
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
          <ThemedText type="footnoteStrong" themeColor="textSecondary">
            Look for
          </ThemedText>
          <View style={styles.targets} onLayout={onGridLayout(setInner)}>
            {island.next.map((target) => {
              const species = CATALOG_BY_ID.get(target.speciesId);
              if (!species) return null;
              return <SpeciesCard key={target.speciesId} species={species} width={targetWidth} count={0} nameLines={3} onPress={() => onOpenSpecies?.(target.speciesId)} />;
            })}
          </View>
        </View>
      ) : (
        <ThemedText type="subhead" themeColor="textSecondary">
          Every resident found.
        </ThemedText>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Space.s4,
  },
  top: {
    flexDirection: 'row',
    gap: Space.s4,
    alignItems: 'flex-start',
  },
  art: {
    width: 112,
    height: 112,
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
    width: Size.hit,
    height: Size.hit,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    gap: Space.s2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s2,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: Radius.pill,
  },
  name: {
    flex: 1,
  },
  residents: {
    gap: Space.s2,
  },
  lookFor: {
    gap: Space.s2,
  },
  targets: {
    flexDirection: 'row',
    gap: TARGET_GAP,
  },
});
