import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { DiveForm } from '@/components/dive/dive-form';
import { Icon } from '@/components/icon';
import { Paper } from '@/components/journal/paper';
import { OceanButton } from '@/components/ocean-button';
import { SitePicker } from '@/components/site-picker';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WhenReady } from '@/components/when-ready';
import { Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { announce } from '@/lib/announce';
import { draftFromDive, hasMoreDetails, readDraft, type DiveDraft } from '@/lib/dive-draft';
import { formatDiveNumber, signaturesOf } from '@/lib/dives';
import { onSiteAdded } from '@/lib/site-added';
import { useAllSites, useAppStore, useMyDives, useMyUserId, useSiteById } from '@/lib/store';
import { statusOf } from '@/lib/verification';

/**
 * Edit a page of the log (`?id=`): every field, the site and the date. A page moved to another site
 * or day takes its sightings with it.
 */
export default function EditDiveScreenRoute() {
  return (
    <WhenReady>
      <EditDiveScreen />
    </WhenReady>
  );
}

function EditDiveScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const sites = useAllSites();
  const siteById = useSiteById();
  const dives = useMyDives();
  const myUserId = useMyUserId();
  const dive = dives.find((d) => d.id === id);
  const sightings = useAppStore((s) => s.sightings);
  const userId = useAppStore((s) => s.user?.id);
  const updateDive = useAppStore((s) => s.updateDive);
  const [draft, setDraft] = useState<DiveDraft | null>(() => (dive ? draftFromDive(dive) : null));
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Back from "Add a dive site" with the new site.
  useEffect(
    () =>
      onSiteAdded((siteId) => {
        setDraft((d) => (d ? { ...d, siteId } : d));
        setPicking(false);
      }),
    [],
  );

  if (!dive || !draft) {
    return (
      <ThemedView style={styles.centered}>
        <Stack.Screen options={{ title: 'Edit page' }} />
        <ThemedText>This page isn’t in your log any more.</ThemedText>
      </ThemedView>
    );
  }

  const site = siteById(draft.siteId);
  if (picking) {
    return (
      <ThemedView style={styles.container}>
        <Stack.Screen options={{ title: 'Choose the site' }} />
        <View style={styles.pickerTop} />
        <SitePicker
          sites={sites}
          recentSiteIds={[...new Set(dives.map((d) => d.siteId))].slice(0, 3)}
          userId={userId}
          onPick={(s) => {
            setDraft({ ...draft, siteId: s.id });
            setPicking(false);
            announce(`Site: ${s.name}`);
          }}
        />
      </ThemedView>
    );
  }

  const onPage = sightings.filter((s) => s.diveId === dive.id && s.userId === myUserId);
  const moved = draft.siteId !== dive.siteId || draft.divedOn !== dive.divedOn;
  const confirmedOnPage = onPage.filter((s) => statusOf(s) !== 'unverified').length;
  const signed = signaturesOf(dive).length > 0;
  const takenBy = dives.find((d) => d.id !== dive.id && String(d.number) === draft.number);

  const save = async () => {
    if (saving) return;
    const read = readDraft(draft);
    if (read.problem !== undefined) {
      setError(read.problem);
      announce(read.problem);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateDive(dive.id, read.fields);
      router.back();
    } catch (e: any) {
      const message = e.message ?? 'Could not save the page';
      setError(message);
      announce(message);
      setSaving(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: `Edit ${formatDiveNumber(dive.number)}` }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.field}>
          <ThemedText type="label">Site</ThemedText>
          <Paper style={styles.siteRow}>
            <Icon name="pin" size={20} />
            <ThemedText style={[styles.flex, styles.siteName]} numberOfLines={2}>
              {site?.name ?? 'Choose the site'}
            </ThemedText>
            <Pressable onPress={() => setPicking(true)} accessibilityRole="button" accessibilityLabel={`Change the site${site ? `, now ${site.name}` : ''}`} style={styles.change}>
              <ThemedText type="smallBold" themeColor="tint">
                Change
              </ThemedText>
            </Pressable>
          </Paper>
        </View>

        <DiveForm
          draft={draft}
          onChange={(patch) => setDraft((d) => (d ? { ...d, ...patch } : d))}
          takenBy={takenBy ? { number: takenBy.number, siteName: siteById(takenBy.siteId)?.name } : undefined}
          initiallyOpen={hasMoreDetails(dive)}
        />

        {moved && (onPage.length > 0 || signed) ? (
          <Paper tone="sand" style={styles.warning}>
            <Icon name="warning" size={20} wash={theme.sun} />
            <ThemedText type="small" style={styles.flex}>
              {onPage.length > 0
                ? `The ${onPage.length === 1 ? 'sighting' : `${onPage.length} sightings`} on this page move with it to the new ${draft.siteId !== dive.siteId ? 'site' : 'day'}.`
                : ''}
              {confirmedOnPage > 0 ? ' Their buddy confirmations no longer apply and are cleared; they can be confirmed again.' : ''}
              {signed ? `${onPage.length > 0 ? ' ' : ''}The signatures come off too: they were for the old ${draft.siteId !== dive.siteId ? 'site' : 'day'}. Your buddy can sign again.` : ''}
            </ThemedText>
          </Paper>
        ) : null}

        {error ? (
          <ThemedText type="small" themeColor="danger" accessibilityLiveRegion="polite">
            {error}
          </ThemedText>
        ) : null}
        <OceanButton title={saving ? 'Saving…' : 'Save changes'} onPress={() => void save()} disabled={saving} />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
  content: { padding: Spacing.three, gap: Spacing.four, paddingBottom: Spacing.six, width: '100%', maxWidth: 720, alignSelf: 'center' },
  pickerTop: { height: Spacing.three },
  field: { gap: 6 },
  flex: { flex: 1 },
  siteRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  siteName: { fontFamily: Type.bodyHeavy, fontSize: 16 },
  change: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 6 },
  warning: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
});
