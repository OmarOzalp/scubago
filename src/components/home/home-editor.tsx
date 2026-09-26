import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HABITATS, type HomePreferences } from '@/lib/home';
import { IslandArt } from './island-art';

export function HomeEditor({ preferences, saving, error, onSave, onClose }: {
  preferences: HomePreferences; saving: boolean; error: string;
  onSave: (value: HomePreferences) => Promise<boolean>; onClose: () => void;
}) {
  const [draft, setDraft] = useState(preferences);
  const insets = useSafeAreaInsets();
  return <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { if (!saving) onClose(); }}>
    <ScrollView keyboardShouldPersistTaps="handled" style={styles.background} contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top, 28), paddingBottom: insets.bottom + 32 }]}>
      <View style={styles.row}><Text style={styles.title}>Make it yours</Text><Pressable accessibilityRole="button" onPress={onClose} disabled={saving} style={styles.close}><Text style={styles.link}>Cancel</Text></Pressable></View>
      <Text style={styles.description}>A little corner of the ocean, just for you.</Text>
      <Text style={styles.label}>HOME NAME</Text>
      <TextInput accessibilityLabel="Home name" value={draft.name} onChangeText={(name) => setDraft((s) => ({ ...s, name }))} maxLength={32} placeholder="My little island" placeholderTextColor="#71877E" style={styles.input} selectionColor="#387A68" />
      <Text style={styles.label}>CHOOSE YOUR SHORES</Text>
      {HABITATS.map((habitat) => <Pressable key={habitat.id} accessibilityRole="radio" accessibilityState={{ checked: draft.habitat === habitat.id }} accessibilityLabel={habitat.name} onPress={() => setDraft((s) => ({ ...s, habitat: habitat.id }))} style={[styles.option, draft.habitat === habitat.id && styles.selected]}>
        <View style={[styles.preview, { backgroundColor: habitat.water }]}><IslandArt habitat={habitat.id} /></View>
        <View style={{ flex: 1, gap: 4 }}><Text style={styles.optionName}>{habitat.name}</Text><Text style={styles.description}>{habitat.description}</Text></View>
        <View style={[styles.radio, draft.habitat === habitat.id && styles.radioSelected]}>{draft.habitat === habitat.id && <View style={styles.dot} />}</View>
      </Pressable>)}
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      <Pressable accessibilityRole="button" disabled={saving || !draft.name.trim()} onPress={async () => { if (await onSave(draft)) onClose(); }} style={[styles.save, (saving || !draft.name.trim()) && { opacity: .5 }]}>
        {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveText}>Save my home</Text>}
      </Pressable>
      <Text style={[styles.description, { textAlign: 'center' }]}>You can change your shores anytime.</Text>
    </ScrollView>
  </Modal>;
}
const styles = StyleSheet.create({
  background: { backgroundColor: '#F6F7F0' }, content: { padding: 24, gap: 16, width: '100%', maxWidth: 600, alignSelf: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, title: { fontSize: 28, fontWeight: '600', color: '#254C40' },
  description: { fontSize: 13, lineHeight: 20, color: '#60756B' }, label: { fontSize: 10, fontWeight: '700', letterSpacing: 2, color: '#61796D', marginTop: 14 },
  input: { padding: 16, backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: '#D4DFD4', fontSize: 17, color: '#254C40' },
  option: { padding: 12, borderRadius: 18, borderWidth: 1, borderColor: '#DDE4D9', flexDirection: 'row', alignItems: 'center', gap: 14 }, selected: { borderColor: '#4F8772', backgroundColor: '#EAF0E5' },
  preview: { width: 76, height: 76, borderRadius: 14, overflow: 'hidden' }, optionName: { fontSize: 16, fontWeight: '600', color: '#254C40' },
  radio: { width: 21, height: 21, borderRadius: 11, borderWidth: 1, borderColor: '#ABBCAF', alignItems: 'center', justifyContent: 'center' }, radioSelected: { borderColor: '#387A68' }, dot: { width: 11, height: 11, borderRadius: 6, backgroundColor: '#387A68' },
  close: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }, link: { color: '#387A68', fontSize: 14 },
  save: { backgroundColor: '#285E4E', padding: 18, borderRadius: 16, alignItems: 'center', marginTop: 12 }, saveText: { color: '#FFFFFF', fontWeight: '600', fontSize: 16 }, error: { color: '#A43F36', fontSize: 13 },
});
