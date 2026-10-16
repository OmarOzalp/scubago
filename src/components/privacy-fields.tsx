import { StyleSheet, View } from 'react-native';

import { Segmented } from '@/components/segmented';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { privacyExplanation, type PrivacySettings } from '@/lib/privacy-choice';
import type { Visibility } from '@/lib/types';

const OPTIONS: { value: Visibility; label: string }[] = [
  { value: 'public', label: 'Everyone' },
  { value: 'private', label: 'Only me' },
];

/**
 * "Who can see this": the sighting, its notes and its photo, each Everyone or Only me. A private
 * sighting keeps everything private, so the notes and photo choices only show for a shared one.
 */
export function PrivacyFields({
  value,
  onChange,
  photo,
  count = 1,
}: {
  value: PrivacySettings;
  onChange: (value: PrivacySettings) => void;
  /** The sighting can carry a photo (a single-species log). */
  photo: boolean;
  /** How many sightings this applies to. */
  count?: number;
}) {
  const shared = value.visibility === 'public';
  return (
    <View style={styles.section}>
      <ThemedText type="label" accessibilityRole="header">
        Who can see this
      </ThemedText>
      <Choice label={count > 1 ? 'Sightings' : 'Sighting'}>
        <Segmented
          kind="choice"
          accessibilityLabel={`Who can see ${count > 1 ? 'these sightings' : 'this sighting'}`}
          options={OPTIONS}
          value={value.visibility}
          onChange={(visibility) => onChange({ ...value, visibility })}
        />
      </Choice>
      {shared ? (
        <>
          <Choice label="Notes">
            <Segmented
              kind="choice"
              accessibilityLabel="Who can see your notes"
              options={OPTIONS}
              value={value.notesPrivate ? 'private' : 'public'}
              onChange={(v) => onChange({ ...value, notesPrivate: v === 'private' })}
            />
          </Choice>
          {photo ? (
            <Choice label="Photo">
              <Segmented
                kind="choice"
                accessibilityLabel="Who can see your photo"
                options={OPTIONS}
                value={value.photoPrivate ? 'private' : 'public'}
                onChange={(v) => onChange({ ...value, photoPrivate: v === 'private' })}
              />
            </Choice>
          ) : null}
        </>
      ) : null}
      <ThemedText type="caption" themeColor="textSecondary" accessibilityLiveRegion="polite">
        {privacyExplanation(value, { photo, count })}
      </ThemedText>
    </View>
  );
}

function Choice({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.choice}>
      <ThemedText type="smallBold" style={styles.label} importantForAccessibility="no" accessibilityElementsHidden>
        {label}
      </ThemedText>
      <View style={styles.control}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.two + 2 },
  choice: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: Spacing.two },
  label: { minWidth: 72 },
  control: { flex: 1, minWidth: 200 },
});
