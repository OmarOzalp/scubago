import { Pressable, StyleSheet, Text } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { describeRarityEvidence, describeWorldwideCounts, type RarityEntry } from '@/lib/real-rarity';

/** What the page says when the tier is only ScubaGo's own: no numbers, because there are none. */
export const OWN_ESTIMATE_TEXT = 'Rarity is ScubaGo’s own estimate for now.';

/** The caveat that goes with a real tier: it is a ranking among the catalogue, not a forecast of a dive. */
export const RANKING_CAVEAT = 'A ranking among ScubaGo’s animals, not a promise of seeing one.';

/**
 * A quiet block under the rarity chip saying where the tier comes from.
 *
 * - With an `entry` (the species has a tier worked out from encounters at dive sites): "Rare:
 *   recorded near 6 of 41 Indo-Pacific dive sites.", then, when the worldwide file has them, a second
 *   line with the worldwide counts ("2,654 iNaturalist observations worldwide."), the caveat, and a
 *   link to Data & credits.
 * - Without one: "Rarity is ScubaGo's own estimate for now." and nothing else, so a hand-assigned
 *   tier is never passed off as data.
 *
 * It takes the entry as a prop (`realRarityEntry(id)` on the species page), so both states can be
 * drawn from hand-written data.
 */
export function RaritySource({ entry, onOpenCredits }: { entry?: RarityEntry; onOpenCredits: () => void }) {
  const theme = useTheme();
  if (!entry) {
    return (
      <ThemedText type="small" themeColor="textSecondary" style={styles.plain}>
        {OWN_ESTIMATE_TEXT}
      </ThemedText>
    );
  }
  const evidence = describeRarityEvidence(entry);
  const worldwide = describeWorldwideCounts(entry);
  return (
    <Pressable
      onPress={onOpenCredits}
      accessibilityRole="link"
      accessibilityLabel={`${evidence}. ${worldwide ? `${worldwide}. ` : ''}${RANKING_CAVEAT} Data and credits`}
      accessibilityHint="Opens the data and credits page"
      style={({ pressed }) => [styles.link, pressed && { backgroundColor: theme.backgroundSelected }]}>
      <Text style={[styles.text, { color: theme.textSecondary }]}>
        {`${evidence}.\n${worldwide ? `${worldwide}.\n` : ''}${RANKING_CAVEAT} `}
        <Text style={[styles.creditLink, { color: theme.tint }]}>Data & credits</Text>
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  plain: {
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 19,
  },
  link: {
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderRadius: 8,
  },
  text: {
    fontFamily: Type.body,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  creditLink: {
    fontFamily: Type.bodyBold,
    textDecorationLine: 'underline',
  },
});
