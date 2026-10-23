import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { BottomBar } from '@/components/dive/bottom-bar';
import { DiveForm } from '@/components/dive/dive-form';
import { HeaderBack } from '@/components/dive/header-back';
import { Icon } from '@/components/icon';
import { Paper } from '@/components/journal/paper';
import { OceanButton } from '@/components/ocean-button';
import { SitePicker } from '@/components/site-picker';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WhenReady } from '@/components/when-ready';
import { Spacing, Type } from '@/constants/theme';
import { useDiscardGuard, useHardwareBack } from '@/hooks/use-discard-guard';
import { useScrollTo } from '@/hooks/use-scroll-to';
import { useTheme } from '@/hooks/use-theme';
import { announce } from '@/lib/announce';
import { draftFromDive, fieldOfProblem, hasMoreDetails, readDraft, type DiveDraft, type DraftField } from '@/lib/dive-draft';
import { formatDiveNumber, signaturesOf, sortDives } from '@/lib/dives';
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
  // What is wrong with a field, shown under it; and a problem with the page as a whole, above the button.
  const [problem, setProblem] = useState<{ field: DraftField; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { scrollView, onScroll, scrollTo } = useScrollTo();

  // Leaving with edits that aren't saved asks first.
  const [startKey] = useState(() => (dive ? JSON.stringify(draftFromDive(dive)) : ''));
  const allowLeaving = useDiscardGuard(!!draft && JSON.stringify(draft) !== startKey, {
    title: 'Discard your changes?',
    message: 'The changes you’ve made to this page won’t be saved.',
  });
  // The site picker is a step inside this screen: Back closes it, not the screen.
  useHardwareBack(() => {
    if (!picking) return false;
    setPicking(false);
    return true;
  });

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
        <Stack.Screen
          options={{
            title: 'Choose the site',
            headerLeft: ({ tintColor }) => <HeaderBack onPress={() => setPicking(false)} label={`Back to ${formatDiveNumber(dive.number)}`} tintColor={tintColor} />,
          }}
        />
        <View style={styles.pickerTop} />
        <SitePicker
          sites={sites}
          // The sites of the newest pages, as the logbook lists them (the store holds them as added, oldest first).
          recentSiteIds={[...new Set(sortDives(dives).map((d) => d.siteId))].slice(0, 3)}
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

  // A problem with a field goes under it (the site is chosen apart from the form, so it goes above the button).
  const complain = (message: string, field?: DraftField) => {
    if (field && field !== 'siteId') setProblem({ field, message });
    else setError(message);
    announce(message);
  };
  const save = async () => {
    if (saving) return;
    setProblem(null);
    setError(null);
    const read = readDraft(draft);
    if (read.problem !== undefined) {
      complain(read.problem, read.field);
      return;
    }
    setSaving(true);
    try {
      await updateDive(dive.id, read.fields);
      allowLeaving();
      router.back();
    } catch (e: any) {
      const message: string = e.message ?? 'Could not save the page';
      complain(message, fieldOfProblem(message));
      setSaving(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      {/* The picker's own back arrow is gone again: the navigator's closes this screen. */}
      <Stack.Screen options={{ title: `Edit ${formatDiveNumber(dive.number)}`, headerLeft: undefined }} />
      <ScrollView ref={scrollView} onScroll={onScroll} scrollEventThrottle={16} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets>
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
          problem={problem}
          onReveal={scrollTo}
          onChange={(patch) => {
            // Putting the field right is the end of its problem.
            if (problem && problem.field in patch) setProblem(null);
            setDraft((d) => (d ? { ...d, ...patch } : d));
          }}
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

      </ScrollView>
      <BottomBar>
        {error ? (
          <ThemedText type="small" themeColor="danger" accessibilityLiveRegion="polite">
            {error}
          </ThemedText>
        ) : null}
        <OceanButton title={saving ? 'Saving…' : 'Save changes'} onPress={() => void save()} disabled={saving} />
      </BottomBar>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
  content: { padding: Spacing.three, gap: Spacing.four, paddingBottom: Spacing.four, width: '100%', maxWidth: 720, alignSelf: 'center' },
  pickerTop: { height: Spacing.three },
  field: { gap: 6 },
  flex: { flex: 1 },
  siteRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  siteName: { fontFamily: Type.bodyHeavy, fontSize: 16 },
  change: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 6 },
  warning: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
});
