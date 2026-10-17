import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { PaperButton } from '@/components/journal/paper';
import { formatDate } from '@/components/sighting-row';
import { SpeciesAvatar } from '@/components/species-avatar';
import { ThemedText } from '@/components/themed-text';
import { Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDepth, formatMinutes, milestoneAt, signaturesOf } from '@/lib/dives';
import type { Dive, Species } from '@/lib/types';

/**
 * One page in the logbook's index: its number in the margin, the site and date, the depth and
 * time, the animals on it, and marks for a signature, a centre's stamp and a milestone.
 */
export function DiveRow({ dive, siteName, species, pending = false, onPress }: { dive: Dive; siteName: string; species: Species[]; pending?: boolean; onPress: () => void }) {
  const theme = useTheme();
  const signed = signaturesOf(dive).length > 0;
  const milestone = milestoneAt(dive.number);
  const facts = [formatDate(dive.divedOn), dive.maxDepthM !== undefined ? formatDepth(dive.maxDepthM) : null, dive.bottomTimeMin ? formatMinutes(dive.bottomTimeMin) : null].filter(Boolean).join(' · ');
  const shown = species.slice(0, 4);
  const label = [
    `Dive ${dive.number}, ${siteName}`,
    facts,
    species.length ? `${species.length} ${species.length === 1 ? 'species' : 'species'} seen` : null,
    signed ? 'signed' : null,
    dive.centreName ? `stamp from ${dive.centreName}` : null,
    milestone ? 'milestone' : null,
    pending ? 'waiting to sync' : null,
  ].filter(Boolean).join(', ');
  return (
    <PaperButton onPress={onPress} accessibilityLabel={label} style={styles.row}>
      <View style={[styles.margin, { borderRightColor: theme.rule }]}>
        <Text style={[styles.no, { color: theme.textSecondary }]}>NO.</Text>
        <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.number, { color: theme.text }]}>
          {dive.number.toLocaleString('en')}
        </Text>
        {milestone ? <Icon name="medal" size={16} wash={theme.sun} washOpacity={0.9} /> : null}
      </View>
      <View style={styles.body}>
        <Text numberOfLines={2} style={[styles.site, { color: theme.text }]}>
          {siteName}
        </Text>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {facts}
        </ThemedText>
        {shown.length > 0 ? (
          <View style={styles.species}>
            {shown.map((s, i) => (
              <View key={`${s.id}-${i}`} style={[styles.avatar, i > 0 && styles.overlap, { borderColor: theme.backgroundElement }]}>
                <SpeciesAvatar species={s} size={26} />
              </View>
            ))}
            {species.length > shown.length ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.more}>
                +{species.length - shown.length}
              </ThemedText>
            ) : null}
          </View>
        ) : null}
      </View>
      <View style={styles.marks}>
        {signed ? <Icon name="signature" size={18} color={theme.textSecondary} wash={theme.textSecondary} washOpacity={0.2} /> : null}
        {dive.centreName ? <Icon name="stamp" size={18} color={theme.stamp} wash={theme.stamp} washOpacity={0.15} /> : null}
        {pending ? <Icon name="sync" size={16} color={theme.textSecondary} /> : null}
      </View>
      <Icon name="chevronRight" size={16} color={theme.textSecondary} weight="bold" />
    </PaperButton>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingLeft: 4, paddingRight: 12, minHeight: 72 },
  margin: { width: 60, alignItems: 'center', alignSelf: 'stretch', justifyContent: 'center', borderRightWidth: 1, paddingRight: 4 },
  no: { fontFamily: Type.label, fontSize: 12, letterSpacing: 1 },
  number: { fontFamily: Type.display, fontSize: 24, lineHeight: 28 },
  body: { flex: 1, gap: 2 },
  site: { fontFamily: Type.bodyHeavy, fontSize: 15, lineHeight: 20 },
  species: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  avatar: { borderWidth: 2, borderRadius: 16 },
  overlap: { marginLeft: -8 },
  more: { marginLeft: 6 },
  marks: { gap: 6, alignItems: 'center' },
});
