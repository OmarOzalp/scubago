import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FormField } from '@/components/form-field';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { OnFill, Radius, Shadow, Spacing, Type } from '@/constants/theme';
import { useSchemeName, useTheme } from '@/hooks/use-theme';
import { HABITATS, type HomePreferences } from '@/lib/home';
import { IslandArt } from './island-art';

/** "Customize your home": the island's name and its shores, on a paper sheet. */
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
      <ThemedText type="caption" themeColor="textSecondary" style={styles.lead}>A little corner of the ocean, just for you.</ThemedText>

      <FormField label="Home name" value={draft.name} onChangeText={(name) => setDraft((s) => ({ ...s, name }))} maxLength={32} placeholder="My little island" selectionColor={theme.tint} style={styles.nameInput} />

      <ThemedText type="label" style={styles.section}>Choose your shores</ThemedText>
      {HABITATS.map((habitat) => {
        const selected = draft.habitat === habitat.id;
        return <Pressable key={habitat.id} accessibilityRole="radio" aria-checked={selected} accessibilityLabel={habitat.name} onPress={() => setDraft((s) => ({ ...s, habitat: habitat.id }))}
          style={({ pressed }) => [styles.option, {
            backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement,
            // The chosen shore takes a lagoon edge and a tick, so it isn't told by colour alone.
            borderColor: selected ? theme.tint : theme.cardBorder,
            borderWidth: selected ? 2 : 1,
            margin: selected ? 0 : 1,
            boxShadow: Shadow[scheme][selected ? 'raised' : 'card'],
            transform: [{ translateY: pressed ? 1 : 0 }],
          }]}>
          {/* The water is the island's own colour, the same in both schemes. */}
          <View style={[styles.preview, { backgroundColor: habitat.water, borderColor: theme.cardBorder }]}><IslandArt habitat={habitat.id} /></View>
          <View style={styles.optionText}>
            <Text style={[styles.optionName, { color: theme.text }]}>{habitat.name}</Text>
            <ThemedText type="small" themeColor="textSecondary">{habitat.description}</ThemedText>
          </View>
          <View style={[styles.radio, selected ? { backgroundColor: theme.lagoon, borderColor: theme.lagoon } : { borderColor: theme.rule, backgroundColor: theme.background }]}>
            {selected && <Icon name="check" size={15} color={OnFill[scheme].lagoon} weight="bold" />}
          </View>
        </Pressable>;
      })}

      {!!error && <ThemedText type="small" themeColor="danger" accessibilityRole="alert" accessibilityLiveRegion="polite">{error}</ThemedText>}
      {/* Drawn like the primary OceanButton, with room for a spinner while the save is on its way. */}
      <Pressable accessibilityRole="button" disabled={cannotSave} aria-disabled={cannotSave} onPress={async () => { if (await onSave(draft)) onClose(); }}
        style={({ pressed }) => [styles.save, { backgroundColor: theme.lagoon, opacity: cannotSave ? 0.45 : 1, transform: [{ translateY: pressed && !cannotSave ? 2 : 0 }] }]}>
        {saving ? <ActivityIndicator color={OnFill[scheme].lagoon} /> : <Text style={[styles.saveText, { color: OnFill[scheme].lagoon }]}>Save my home</Text>}
      </Pressable>
      <ThemedText type="caption" themeColor="textSecondary" style={styles.footnote}>You can change your shores anytime.</ThemedText>
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
  section: { marginTop: 12 },
  option: { padding: 12, borderRadius: Radius.lg, flexDirection: 'row', alignItems: 'center', gap: 14 },
  preview: { width: 76, height: 76, borderRadius: Radius.md, borderWidth: 1, overflow: 'hidden' },
  optionText: { flex: 1, gap: 2 },
  optionName: { fontFamily: Type.display, fontSize: 18, lineHeight: 23 },
  radio: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  save: { minHeight: 52, borderRadius: Radius.md, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  saveText: { fontFamily: Type.bodyHeavy, fontSize: 16, textAlign: 'center' },
  footnote: { textAlign: 'center' },
});
