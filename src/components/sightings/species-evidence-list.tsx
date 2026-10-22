import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Paper } from '@/components/journal/paper';
import { evidenceParts, isIsoDate, SPECIES_SHOWN } from '@/components/sightings/format';
import { formatDate } from '@/components/sighting-row';
import { SpeciesAvatar } from '@/components/species-avatar';
import { Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { CATALOG_BY_ID } from '@/lib/catalog';
import type { SpeciesEvidence } from '@/lib/external-sightings/types';

/**
 * The catalogue animals that public records place near the site, best evidence first, ruled off like
 * a page of field notes. The first few show; the rest wait behind "Show all".
 */
export function SpeciesEvidenceList({
  species,
  onOpenSpecies,
  shown = SPECIES_SHOWN,
}: {
  species: SpeciesEvidence[];
  onOpenSpecies: (speciesId: string) => void;
  shown?: number;
}) {
  const theme = useTheme();
  const [all, setAll] = useState(false);
  const visible = all ? species : species.slice(0, shown);
  const expandable = species.length > shown;
  return (
    <Paper padded={false} style={styles.paper}>
      {visible.map((evidence, index) => (
        <SpeciesRow key={evidence.speciesId} evidence={evidence} first={index === 0} onPress={() => onOpenSpecies(evidence.speciesId)} />
      ))}
      {expandable ? (
        <Pressable
          onPress={() => setAll((value) => !value)}
          accessibilityRole="button"
          aria-expanded={all}
          accessibilityState={{ expanded: all }}
          accessibilityLabel={all ? 'Show fewer species' : `Show all ${species.length} species`}
          style={({ pressed }) => [styles.more, { borderTopColor: theme.rule, backgroundColor: pressed ? theme.backgroundSelected : 'transparent' }]}>
          <Text style={[styles.moreText, { color: theme.tint }]}>{all ? 'Show fewer' : `Show all ${species.length}`}</Text>
          <Icon name="chevronDown" size={16} color={theme.tint} weight="bold" style={all ? styles.flipped : undefined} />
        </Pressable>
      ) : null}
    </Paper>
  );
}

function SpeciesRow({ evidence, first, onPress }: { evidence: SpeciesEvidence; first: boolean; onPress: () => void }) {
  const theme = useTheme();
  const species = CATALOG_BY_ID.get(evidence.speciesId);
  if (!species) return null;
  const parts = evidenceParts(evidence);
  const newest = evidence.inaturalist?.lastObservedOn;
  const newestText = isIsoDate(newest) ? formatDate(newest) : undefined;
  const label = [species.commonName, parts.join(', '), newestText ? `newest on file ${newestText}` : null].filter(Boolean).join(', ');
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Opens the species page"
      style={({ pressed }) => [
        styles.row,
        { borderTopColor: theme.rule, borderTopWidth: first ? 0 : 1, backgroundColor: pressed ? theme.backgroundSelected : 'transparent' },
      ]}>
      <SpeciesAvatar species={species} size={56} />
      <View style={styles.body}>
        <Text numberOfLines={2} style={[styles.name, { color: theme.text }]}>
          {species.commonName}
        </Text>
        {/* One line per source, so a count never splits across two lines. */}
        {parts.map((part) => (
          <Text key={part} style={[styles.meta, { color: theme.textSecondary }]}>
            {part}
          </Text>
        ))}
        {newestText ? <Text style={[styles.meta, { color: theme.textSecondary }]}>{`Newest on file: ${newestText}`}</Text> : null}
      </View>
      <Icon name="chevronRight" size={18} color={theme.textSecondary} weight="bold" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  paper: {
    overflow: 'hidden',
  },
  row: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  body: {
    flex: 1,
    gap: 1,
  },
  name: {
    fontFamily: Type.bodyHeavy,
    fontSize: 16,
    lineHeight: 21,
  },
  meta: {
    fontFamily: Type.body,
    fontSize: 14,
    lineHeight: 19,
  },
  more: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderTopWidth: 1,
    paddingHorizontal: 14,
  },
  moreText: {
    fontFamily: Type.bodyHeavy,
    fontSize: 15,
  },
  flipped: {
    transform: [{ rotate: '180deg' }],
  },
});
