import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { FormField } from '@/components/form-field';
import { Icon } from '@/components/icon';
import { Paper } from '@/components/journal/paper';
import { OceanButton } from '@/components/ocean-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { announce } from '@/lib/announce';
import { describeCoordinates, readCoordinates } from '@/lib/coordinates';
import { notifySiteAdded } from '@/lib/site-added';
import { useAppStore } from '@/lib/store';

/** A long-press on the map arrives with its point: shown as one pair, to five places (about a metre). */
function startingCoordinates(lat?: string, lng?: string): string {
  const [a, b] = [Number(lat), Number(lng)];
  if (lat === undefined || lng === undefined || !Number.isFinite(a) || !Number.isFinite(b)) return '';
  return `${Number(a.toFixed(5))}, ${Number(b.toFixed(5))}`;
}

export default function AddSiteScreen() {
  /** `then=log`: opened from the log screen, which carries on with the new site. `name` pre-fills a search. */
  const params = useLocalSearchParams<{ lat?: string; lng?: string; then?: string; name?: string }>();
  const addSite = useAppStore((s) => s.addSite);
  const theme = useTheme();

  const [name, setName] = useState(params.name ?? '');
  const [region, setRegion] = useState('');
  const [country, setCountry] = useState('');
  const [blurb, setBlurb] = useState('');
  // One field, so the pair a maps app copies ("7.81, 98.54") can be pasted whole.
  const [coordinates, setCoordinates] = useState(() => startingCoordinates(params.lat, params.lng));
  const [saving, setSaving] = useState(false);
  // What is wrong, under the field it is about (said out loud, not a button greyed out for no stated reason).
  const [problem, setProblem] = useState<{ field: 'name' | 'coordinates'; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const nameField = useRef<TextInput>(null);
  const coordinatesField = useRef<TextInput>(null);

  const place = readCoordinates(coordinates);

  const complain = (field: 'name' | 'coordinates', message: string) => {
    setProblem({ field, message });
    announce(message);
    (field === 'name' ? nameField : coordinatesField).current?.focus();
  };

  /** `andLog`: carry on to log a dive at the new site. */
  const save = async (andLog: boolean) => {
    if (saving) return;
    setError(null);
    if (name.trim().length < 2) {
      complain('name', 'Give the site a name.');
      return;
    }
    if (place.problem !== undefined) {
      complain('coordinates', place.problem);
      return;
    }
    setSaving(true);
    try {
      const site = await addSite({
        name: name.trim(),
        lat: place.lat,
        lng: place.lng,
        region: region.trim() || 'Unknown region',
        country: country.trim() || 'Unknown',
        blurb: blurb.trim() || 'Added by the community.',
      });
      announce(`${site.name} added`);
      if (params.then === 'log') {
        notifySiteAdded(site.id);
        router.back();
        return;
      }
      if (andLog) {
        router.dismiss();
        router.push({ pathname: '/log/new', params: { siteId: site.id } });
        return;
      }
      router.back();
    } catch (e: any) {
      setError(e.message ?? 'Could not add the site');
      setSaving(false);
    }
  };

  return (
    <ThemedView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets>
        <View style={styles.intro}>
          <ThemedText type="label">A new page for the chart</ThemedText>
          <ThemedText type="caption" themeColor="textSecondary">
            Know a site that’s missing? Add it and it appears on your map right away.
          </ThemedText>
        </View>

        <View style={styles.field}>
          <FormField
            ref={nameField}
            label="Site name (required)"
            value={name}
            onChangeText={(text) => {
              setName(text);
              if (problem?.field === 'name') setProblem(null);
            }}
            placeholder="e.g. Shark Point"
            style={problem?.field === 'name' ? { borderColor: theme.danger } : undefined}
          />
          {problem?.field === 'name' ? (
            <ThemedText type="small" themeColor="danger" accessibilityLiveRegion="polite">
              {problem.message}
            </ThemedText>
          ) : null}
        </View>
        <Paper style={styles.card}>
          <View style={styles.where}>
            <Icon name="pin" size={20} wash={theme.coral} />
            <ThemedText type="small" themeColor="textSecondary" style={{ flex: 1 }}>
              Where it is: in a maps app, hold on the spot, copy its numbers and paste them here.
            </ThemedText>
          </View>
          <View style={styles.field}>
            <FormField
              ref={coordinatesField}
              label="Coordinates (required)"
              value={coordinates}
              onChangeText={(text) => {
                setCoordinates(text);
                if (problem?.field === 'coordinates') setProblem(null);
              }}
              keyboardType="numbers-and-punctuation"
              autoCorrect={false}
              autoCapitalize="none"
              placeholder="e.g. 7.81, 98.54"
              hint="Latitude first, then longitude."
              style={problem?.field === 'coordinates' ? { borderColor: theme.danger } : undefined}
            />
            {problem?.field === 'coordinates' ? (
              <ThemedText type="small" themeColor="danger" accessibilityLiveRegion="polite">
                {problem.message}
              </ThemedText>
            ) : place.problem === undefined ? (
              // What was read, said back, so a missing minus sign shows before it is saved.
              <ThemedText type="small" themeColor="textSecondary" accessibilityLiveRegion="polite">
                That is {describeCoordinates(place)}.
              </ThemedText>
            ) : null}
          </View>
        </Paper>
        <View style={styles.rowFields}>
          <View style={{ flex: 1 }}>
            <FormField label="Region" value={region} onChangeText={setRegion} placeholder="e.g. Phuket" />
          </View>
          <View style={{ flex: 1 }}>
            <FormField label="Country" value={country} onChangeText={setCountry} placeholder="e.g. Thailand" />
          </View>
        </View>
        <FormField label="Description" value={blurb} onChangeText={setBlurb} multiline placeholder="e.g. A sloping reef where leopard sharks rest on the sand" style={styles.multiline} />
        {error ? (
          <ThemedText type="small" themeColor="danger" accessibilityLiveRegion="polite">
            {error}
          </ThemedText>
        ) : null}
        {/* From the log flow the new site goes straight back to it; from Explore, adding is the point, and logging a dive there is the other choice. */}
        <OceanButton title={saving ? 'Saving…' : 'Add site'} icon={saving ? undefined : 'addSite'} onPress={() => void save(false)} disabled={saving} />
        {params.then !== 'log' ? <OceanButton title="Add and log a dive" variant="secondary" onPress={() => void save(true)} disabled={saving} /> : null}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.three,
    paddingBottom: Spacing.five,
    gap: Spacing.three + 2,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  intro: {
    gap: 2,
  },
  card: {
    gap: Spacing.three,
  },
  field: {
    gap: 6,
  },
  where: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
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
