import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { FormField } from '@/components/form-field';
import { OceanButton } from '@/components/ocean-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { announce } from '@/lib/announce';
import { notifySiteAdded } from '@/lib/site-added';
import { useAppStore } from '@/lib/store';

export default function AddSiteScreen() {
  /** `then=log`: opened from the log screen, which carries on with the new site. `name` pre-fills a search. */
  const params = useLocalSearchParams<{ lat?: string; lng?: string; then?: string; name?: string }>();
  const addSite = useAppStore((s) => s.addSite);

  const [name, setName] = useState(params.name ?? '');
  const [region, setRegion] = useState('');
  const [country, setCountry] = useState('');
  const [blurb, setBlurb] = useState('');
  const [lat, setLat] = useState(params.lat ?? '');
  const [lng, setLng] = useState(params.lng ?? '');
  const [saving, setSaving] = useState(false);

  const latNum = Number(lat);
  const lngNum = Number(lng);
  // Said out loud and on screen, instead of a button that is greyed out for no stated reason.
  const problem =
    name.trim().length < 2
      ? 'Give the site a name.'
      : lat.trim() === '' || !Number.isFinite(latNum) || Math.abs(latNum) > 90
        ? 'Enter a latitude between -90 and 90 (e.g. 7.81).'
        : lng.trim() === '' || !Number.isFinite(lngNum) || Math.abs(lngNum) > 180
          ? 'Enter a longitude between -180 and 180 (e.g. 98.54).'
          : null;
  const [showProblem, setShowProblem] = useState(false);

  const save = async () => {
    if (saving) return;
    if (problem) {
      setShowProblem(true);
      announce(problem);
      return;
    }
    setSaving(true);
    const site = await addSite({
      name: name.trim(),
      lat: latNum,
      lng: lngNum,
      region: region.trim() || 'Unknown region',
      country: country.trim() || 'Unknown',
      blurb: blurb.trim() || 'Added by the community.',
    });
    if (params.then === 'log') {
      notifySiteAdded(site.id);
      router.back();
      return;
    }
    router.dismiss();
    router.push({ pathname: '/log/new', params: { siteId: site.id } });
  };

  return (
    <ThemedView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ThemedText type="small" themeColor="textSecondary">
          Know a site that’s missing? Add it and it appears on your map right away.
        </ThemedText>

        <FormField label="Site name (required)" value={name} onChangeText={setName} placeholder="e.g. Shark Point" />
        <ThemedText type="small" themeColor="textSecondary">
          Where it is: long-press the map to fill these in, or copy them from a map app.
        </ThemedText>
        <View style={styles.rowFields}>
          <View style={{ flex: 1 }}>
            <FormField label="Latitude (required)" value={lat} onChangeText={setLat} keyboardType="numbers-and-punctuation" placeholder="7.81" />
          </View>
          <View style={{ flex: 1 }}>
            <FormField label="Longitude (required)" value={lng} onChangeText={setLng} keyboardType="numbers-and-punctuation" placeholder="98.54" />
          </View>
        </View>
        <View style={styles.rowFields}>
          <View style={{ flex: 1 }}>
            <FormField label="Region" value={region} onChangeText={setRegion} placeholder="Phuket" />
          </View>
          <View style={{ flex: 1 }}>
            <FormField label="Country" value={country} onChangeText={setCountry} placeholder="Thailand" />
          </View>
        </View>
        <FormField label="Description" value={blurb} onChangeText={setBlurb} multiline placeholder="What makes this site special?" style={styles.multiline} />
        {showProblem && problem ? (
          <ThemedText type="small" themeColor="danger" accessibilityLiveRegion="polite">
            {problem}
          </ThemedText>
        ) : null}
        <OceanButton
          title={saving ? 'Saving…' : params.then === 'log' ? 'Add site' : 'Add site & log a sighting'}
          onPress={save}
          disabled={saving}
        />
      </ScrollView>
    </ThemedView>
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
  multiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
});
