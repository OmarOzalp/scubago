import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { FormField } from '@/components/form-field';
import { Icon } from '@/components/icon';
import { Paper } from '@/components/journal/paper';
import { OceanButton } from '@/components/ocean-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WhenReady } from '@/components/when-ready';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { announce } from '@/lib/announce';
import { formatDiveNumber, parseNumber } from '@/lib/dives';
import { leave } from '@/lib/leave';
import { useAppStore, useDivesBefore, useMyDives } from '@/lib/store';

/**
 * How many dives the diver logged before ScubaGo (in a paper log, another app, or not at all), so
 * their pages carry their real lifetime numbers. Changing it moves every page by the same amount.
 */
export default function DivesBeforeScreenRoute() {
  return (
    <WhenReady>
      <DivesBeforeScreen />
    </WhenReady>
  );
}

function DivesBeforeScreen() {
  const theme = useTheme();
  const before = useDivesBefore();
  const dives = useMyDives();
  const setDivesBefore = useAppStore((s) => s.setDivesBefore);
  const [text, setText] = useState(before ? String(before) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = parseNumber(text);
  const value = parsed === undefined ? 0 : parsed;
  const valid = Number.isInteger(value) && value >= 0 && value <= 99000;
  const delta = valid ? value - before : 0;
  const lowest = dives.reduce((min, d) => Math.min(min, d.number), Infinity);
  const top = dives.reduce((max, d) => Math.max(max, d.number), 0);
  const nextAfter = Math.max(top + delta, value) + 1;
  const tooLow = dives.length > 0 && lowest + delta < 1;

  const save = async () => {
    if (!valid || tooLow || saving) return;
    setSaving(true);
    setError(null);
    try {
      await setDivesBefore(value);
      leave('/auth');
    } catch (e: any) {
      const message = e.message ?? 'Could not save';
      setError(message);
      announce(message);
      setSaving(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: 'Dives before ScubaGo' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ThemedText>Say how many dives you logged before ScubaGo, so your pages carry your real numbers.</ThemedText>
        <FormField
          label="Dives logged before ScubaGo"
          value={text}
          onChangeText={(t) => setText(t.replace(/[^0-9]/g, ''))}
          keyboardType="number-pad"
          inputMode="numeric"
          placeholder="0"
          maxLength={5}
          hint="Leave it at 0 if ScubaGo is your first log."
        />
        <Paper tone="sand" style={styles.row}>
          <Icon name="logbook" size={20} wash={theme.sun} />
          <View style={styles.flex}>
            {!valid ? (
              <ThemedText type="small">That isn’t a number of dives.</ThemedText>
            ) : tooLow ? (
              <ThemedText type="small" themeColor="danger">
                That would number a page below No. 1. Your earliest page is {formatDiveNumber(lowest)}.
              </ThemedText>
            ) : (
              <ThemedText type="small" accessibilityLiveRegion="polite">
                {dives.length > 0 && delta !== 0
                  ? `Every page moves by ${Math.abs(delta)} (${delta > 0 ? 'up' : 'down'}): your earliest becomes ${formatDiveNumber(lowest + delta)}, and your next dive is ${formatDiveNumber(nextAfter)}.`
                  : `Your next dive is ${formatDiveNumber(nextAfter)}.`}
              </ThemedText>
            )}
          </View>
        </Paper>
        {error ? (
          <ThemedText type="small" themeColor="danger" accessibilityLiveRegion="polite">
            {error}
          </ThemedText>
        ) : null}
        <OceanButton title={saving ? 'Saving…' : 'Save'} onPress={() => void save()} disabled={saving || !valid || tooLow || delta === 0} />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.four, paddingBottom: Spacing.six, width: '100%', maxWidth: 720, alignSelf: 'center' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  flex: { flex: 1 },
});
