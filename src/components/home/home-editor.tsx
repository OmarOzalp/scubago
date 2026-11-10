import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FormField } from '@/components/form-field';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { ScreenTitle } from '@/components/ui/screen';
import { Space, TypeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { DEFAULT_HOME, HOME_NAME_MAX, type HomePreferences } from '@/lib/home';

/** "Name your island": its name, on a paper sheet. (Its islands are the archipelago's, raised by the diver's discoveries.) */
export function HomeEditor({ preferences, saving, error, onSave, onClose }: {
  preferences: HomePreferences; saving: boolean; error: string;
  onSave: (value: HomePreferences) => Promise<boolean>; onClose: () => void;
}) {
  const theme = useTheme();
  const [draft, setDraft] = useState(preferences);
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const cannotSave = saving || !draft.name.trim();
  const atLimit = draft.name.length >= HOME_NAME_MAX;
  return <Modal visible animationType={reduceMotion ? 'none' : 'slide'} presentationStyle="pageSheet" onRequestClose={() => { if (!saving) onClose(); }}>
    <ScrollView keyboardShouldPersistTaps="handled" style={{ backgroundColor: theme.background }} contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top, 28), paddingBottom: insets.bottom + 32 }]}>
      {/* The sheet is one field, so it is named by its title alone (a screen reader hears what opened it). */}
      <ScreenTitle title="Name your island" actions={<Button title="Cancel" variant="plain" size="md" onPress={onClose} disabled={saving} style={styles.cancel} />} />

      <View style={styles.nameField}>
        <FormField label="Island name" value={draft.name} onChangeText={(name) => setDraft((s) => ({ ...s, name }))} maxLength={HOME_NAME_MAX} placeholder={DEFAULT_HOME.name} selectionColor={theme.tint} style={styles.nameInput} />
        {/* The field stops typing at the limit without a word; this says how far along the name is, and (read aloud, too) when it can be no longer. */}
        <ThemedText type="footnote" themeColor={atLimit ? 'tint' : 'textSecondary'} style={styles.count} accessibilityLiveRegion={atLimit ? 'polite' : 'none'}>
          {atLimit ? `${HOME_NAME_MAX} of ${HOME_NAME_MAX} · that is as long as a name can be` : `${draft.name.length} of ${HOME_NAME_MAX}`}
        </ThemedText>
      </View>

      {!!error && <ThemedText type="subhead" themeColor="danger" accessibilityRole="alert" accessibilityLiveRegion="polite">{error}</ThemedText>}
      {/* The primary button, with its spinner while the save is on its way. */}
      <Button title="Save" loading={saving} disabled={!saving && cannotSave} onPress={async () => { if (await onSave(draft)) onClose(); }} style={styles.save} />
    </ScrollView>
  </Modal>;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: Space.s4, gap: Space.s4, width: '100%', maxWidth: 600, alignSelf: 'center' },
  cancel: { marginRight: -Space.s3 },
  nameField: { gap: 6 },
  nameInput: { ...TypeScale.body },
  count: { textAlign: 'right' },
  save: { marginTop: Space.s2 },
});
