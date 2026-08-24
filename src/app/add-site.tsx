import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { OceanButton } from '@/components/ocean-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/lib/store';

export default function AddSiteScreen() {
  const params = useLocalSearchParams<{ lat?: string; lng?: string }>();
  const theme = useTheme();
  const addSite = useAppStore((s) => s.addSite);

  const [name, setName] = useState('');
  const [region, setRegion] = useState('');
  const [country, setCountry] = useState('');
  const [blurb, setBlurb] = useState('');
  const [lat, setLat] = useState(params.lat ?? '');
  const [lng, setLng] = useState(params.lng ?? '');
  const [saving, setSaving] = useState(false);

  const latNum = Number(lat);
  const lngNum = Number(lng);
  const valid =
    name.trim().length > 1 &&
    Number.isFinite(latNum) &&
    Math.abs(latNum) <= 90 &&
    Number.isFinite(lngNum) &&
    Math.abs(lngNum) <= 180;

  const save = async () => {
    if (!valid || saving) return;
    setSaving(true);
    const site = await addSite({
      name: name.trim(),
      lat: latNum,
      lng: lngNum,
      region: region.trim() || 'Unknown region',
      country: country.trim() || 'Unknown',
      blurb: blurb.trim() || 'Added by the community.',
    });
    router.dismiss();
    router.push({ pathname: '/log/new', params: { siteId: site.id } });
  };

  const inputStyle = [styles.input, { backgroundColor: theme.backgroundElement, color: theme.text }];

  return (
    <ThemedView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ThemedText type="small" themeColor="textSecondary">
          Know a site that’s missing? Add it and it appears on your map right away.
        </ThemedText>

        <Field label="Site name *">
          <TextInput value={name} onChangeText={setName} placeholder="e.g. Shark Point" placeholderTextColor={theme.textSecondary} style={inputStyle} />
        </Field>
        <View style={styles.rowFields}>
          <Field label="Latitude *" style={{ flex: 1 }}>
            <TextInput value={lat} onChangeText={setLat} keyboardType="numbers-and-punctuation" placeholder="7.81" placeholderTextColor={theme.textSecondary} style={inputStyle} />
          </Field>
          <Field label="Longitude *" style={{ flex: 1 }}>
            <TextInput value={lng} onChangeText={setLng} keyboardType="numbers-and-punctuation" placeholder="98.54" placeholderTextColor={theme.textSecondary} style={inputStyle} />
          </Field>
        </View>
        <View style={styles.rowFields}>
          <Field label="Region" style={{ flex: 1 }}>
            <TextInput value={region} onChangeText={setRegion} placeholder="Phuket" placeholderTextColor={theme.textSecondary} style={inputStyle} />
          </Field>
          <Field label="Country" style={{ flex: 1 }}>
            <TextInput value={country} onChangeText={setCountry} placeholder="Thailand" placeholderTextColor={theme.textSecondary} style={inputStyle} />
          </Field>
        </View>
        <Field label="Description">
          <TextInput value={blurb} onChangeText={setBlurb} multiline placeholder="What makes this site special?" placeholderTextColor={theme.textSecondary} style={[...inputStyle, styles.multiline]} />
        </Field>

        <OceanButton title={saving ? 'Saving…' : 'Add site & log a sighting'} onPress={save} disabled={!valid || saving} />
      </ScrollView>
    </ThemedView>
  );
}

function Field({
  label,
  children,
  style,
}: {
  label: string;
  children: React.ReactNode;
  style?: object;
}) {
  return (
    <View style={[{ gap: Spacing.one }, style]}>
      <ThemedText type="smallBold">{label}</ThemedText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
  rowFields: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  input: {
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    height: 44,
    fontSize: 16,
  },
  multiline: {
    minHeight: 80,
    paddingTop: 10,
    textAlignVertical: 'top',
    height: undefined,
  },
});
