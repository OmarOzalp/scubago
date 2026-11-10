import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { evidenceParts, isIsoDate, SPECIES_SHOWN } from '@/components/sightings/format';
import { ShowAllRow } from '@/components/sightings/parts';
import { formatDate } from '@/components/sighting-row';
import { SpeciesAvatar } from '@/components/species-avatar';
import { List, ListRow } from '@/components/ui/list';
import { Size, TypeScale } from '@/constants/theme';
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
  const [all, setAll] = useState(false);
  const visible = all ? species : species.slice(0, shown);
  const expandable = species.length > shown;
  return (
    <List>
      {visible.map((evidence, index) => (
        <SpeciesRow key={evidence.speciesId} evidence={evidence} first={index === 0} onPress={() => onOpenSpecies(evidence.speciesId)} />
      ))}
      {expandable ? (
        <ShowAllRow expanded={all} label={all ? 'Show fewer' : `Show all ${species.length}`} accessibilityLabel={all ? 'Show fewer species' : `Show all ${species.length} species`} onPress={() => setAll((value) => !value)} />
      ) : null}
    </List>
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
    <ListRow
      title={species.commonName}
      titleLines={2}
      leading={<SpeciesAvatar species={species} size={Size.thumb} />}
      // One line per source, so a count never splits across two lines.
      below={
        <View style={styles.meta}>
          {parts.map((part) => (
            <Text key={part} style={[TypeScale.subhead, { color: theme.textSecondary }]}>
              {part}
            </Text>
          ))}
          {newestText ? <Text style={[TypeScale.subhead, { color: theme.textSecondary }]}>{`Newest on file: ${newestText}`}</Text> : null}
        </View>
      }
      accessibilityLabel={label}
      accessibilityHint="Opens the species page"
      separator={!first}
      inGroup
      onPress={onPress}
    />
  );
}

const styles = StyleSheet.create({
  meta: {
    gap: 0,
  },
});
