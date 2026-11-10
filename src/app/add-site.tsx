import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, View, type TextInputInstance } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { Space } from '@/constants/theme';
import { DISMISS_ON_DRAG } from '@/hooks/use-keyboard';
import { useTheme } from '@/hooks/use-theme';
import { announce } from '@/lib/announce';
import { describeCoordinates, readCoordinates } from '@/lib/coordinates';
import { leave } from '@/lib/leave';
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
  const nameField = useRef<TextInputInstance>(null);
  const coordinatesField = useRef<TextInputInstance>(null);

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
        // Opened straight from a link, there is no log screen underneath to carry on: open one at the new site.
        leave({ pathname: '/log/new', params: { siteId: site.id } });
        return;
      }
      if (andLog) {
        if (router.canDismiss()) {
          router.dismiss();
          router.push({ pathname: '/log/new', params: { siteId: site.id } });
        } else router.replace({ pathname: '/log/new', params: { siteId: site.id } });
        return;
      }
      leave('/map');
    } catch (e: any) {
      setError(e.message ?? 'Could not add the site');
      setSaving(false);
    }
  };

  const coordinatesHelper =
    problem?.field === 'coordinates'
      ? undefined
      : place.problem === undefined
        ? // What was read, said back, so a missing minus sign shows before it is saved.
          `That is ${describeCoordinates(place)}.`
        : // Until what was typed reads as a pair (or says what is wrong), a nudge; then it gives way.
          'Latitude first, then longitude.';

  return (
    <Screen kind="modal" keyboardDismissMode={DISMISS_ON_DRAG} automaticallyAdjustKeyboardInsets>
      <ThemedText type="callout" themeColor="textSecondary">
        Missing a site? Add it to your map.
      </ThemedText>

      <TextField
        ref={nameField}
        label="Site name (required)"
        value={name}
        onChangeText={(text) => {
          setName(text);
          if (problem?.field === 'name') setProblem(null);
        }}
        placeholder="e.g. Shark Point"
        error={problem?.field === 'name' ? problem.message : undefined}
      />
      <View style={styles.where}>
        <Icon name="pin" size={20} color={theme.textSecondary} />
        <ThemedText type="subhead" themeColor="textSecondary" style={styles.flex}>
          In a maps app, hold a spot and copy its numbers.
        </ThemedText>
      </View>
      <TextField
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
        helper={coordinatesHelper}
        error={problem?.field === 'coordinates' ? problem.message : undefined}
      />
      <View style={styles.rowFields}>
        <TextField label="Region" value={region} onChangeText={setRegion} placeholder="e.g. Phuket" style={styles.flex} />
        <TextField label="Country" value={country} onChangeText={setCountry} placeholder="e.g. Thailand" style={styles.flex} />
      </View>
      <TextField label="Description" value={blurb} onChangeText={setBlurb} multiline placeholder="e.g. A sloping reef where leopard sharks rest on the sand" />
      {error ? (
        <ThemedText type="subhead" themeColor="danger" accessibilityLiveRegion="polite">
          {error}
        </ThemedText>
      ) : null}
      {/* From the log flow the new site goes straight back to it; from Explore, adding is the point, and logging a dive there is the other choice. */}
      <View style={styles.actions}>
        <Button title={saving ? 'Saving…' : 'Add site'} icon={saving ? undefined : 'addSite'} onPress={() => void save(false)} disabled={saving} />
        {params.then !== 'log' ? <Button title="Add and log a dive" variant="secondary" onPress={() => void save(true)} disabled={saving} /> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  where: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.s2,
    // Closer to the coordinates it explains than to the name above.
    marginTop: Space.s2,
    marginBottom: -Space.s3,
  },
  rowFields: {
    flexDirection: 'row',
    gap: Space.s3,
  },
  actions: {
    gap: Space.s3,
    marginTop: Space.s2,
  },
});
