import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FormField } from '@/components/form-field';
import { ThemedText } from '@/components/themed-text';
import { OnFill, Radius, Spacing, Type } from '@/constants/theme';
import { useSchemeName, useTheme } from '@/hooks/use-theme';
import type { HomePreferences } from '@/lib/home';

/** "Customize your home": its name, on a paper sheet. (Its islands are the archipelago's, raised by the diver's discoveries.) */
export function HomeEditor({ preferences, saving, error, onSave, onClose }: {
  preferences: HomePreferences; saving: boolean; error: string;
  onSave: (value: HomePreferences) => Promise<boolean>; onClose: () => void;
}) {
  const theme = useTheme();
  const scheme = useSchemeName();
  const [draft, setDraft] = useState(preferences);
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const cannotSave = saving || !draft.name.trim();
  return <Modal visible animationType={reduceMotion ? 'none' : 'slide'} presentationStyle="pageSheet" onRequestClose={() => { if (!saving) onClose(); }}>
    <ScrollView keyboardShouldPersistTaps="handled" style={{ backgroundColor: theme.background }} contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top, 28), paddingBottom: insets.bottom + 32 }]}>
      <View style={styles.header}>
        <View style={styles.titles}>
          <ThemedText type="label">Customize your home</ThemedText>
          <ThemedText type="display" accessibilityRole="header">Make it yours</ThemedText>
        </View>
        <Pressable accessibilityRole="button" onPress={onClose} disabled={saving} style={({ pressed }) => [styles.cancel, { opacity: saving ? 0.45 : pressed ? 0.6 : 1 }]}>
          <ThemedText type="smallBold" themeColor="tint" style={styles.cancelText}>Cancel</ThemedText>
        </Pressable>
      </View>
      <ThemedText type="caption" themeColor="textSecondary" style={styles.lead}>A little corner of the ocean, just for you. Its islands rise with the animals you log.</ThemedText>

      <FormField label="Home name" value={draft.name} onChangeText={(name) => setDraft((s) => ({ ...s, name }))} maxLength={32} placeholder="My little island" selectionColor={theme.tint} style={styles.nameInput} />

      {!!error && <ThemedText type="small" themeColor="danger" accessibilityRole="alert" accessibilityLiveRegion="polite">{error}</ThemedText>}
      {/* Drawn like the primary OceanButton, with room for a spinner while the save is on its way. */}
      <Pressable accessibilityRole="button" disabled={cannotSave} aria-disabled={cannotSave} onPress={async () => { if (await onSave(draft)) onClose(); }}
        style={({ pressed }) => [styles.save, { backgroundColor: theme.lagoon, opacity: cannotSave ? 0.45 : 1, transform: [{ translateY: pressed && !cannotSave ? 2 : 0 }] }]}>
        {saving ? <ActivityIndicator color={OnFill[scheme].lagoon} /> : <Text style={[styles.saveText, { color: OnFill[scheme].lagoon }]}>Save my home</Text>}
      </Pressable>
    </ScrollView>
  </Modal>;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: Spacing.four, gap: 14, width: '100%', maxWidth: 600, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  titles: { flex: 1, gap: 2 },
  cancel: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'flex-end', paddingLeft: Spacing.two },
  cancelText: { fontSize: 15 },
  lead: { marginTop: -6, marginBottom: 6 },
  nameInput: { fontSize: 17 },
  save: { minHeight: 52, borderRadius: Radius.md, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  saveText: { fontFamily: Type.bodyHeavy, fontSize: 16, textAlign: 'center' },
});
