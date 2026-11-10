import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BottomBar } from '@/components/dive/bottom-bar';
import { DiveForm } from '@/components/dive/dive-form';
import { HeaderBack } from '@/components/dive/header-back';
import { FieldLabel } from '@/components/form-field';
import { SitePicker } from '@/components/site-picker';
import { Button } from '@/components/ui/button';
import { List, ListRow } from '@/components/ui/list';
import { EmptyState, Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { WhenReady } from '@/components/when-ready';
import { Space, TypeScale } from '@/constants/theme';
import { useDiscardGuard, useHardwareBack } from '@/hooks/use-discard-guard';
import { DISMISS_ON_DRAG } from '@/hooks/use-keyboard';
import { useScrollTo } from '@/hooks/use-scroll-to';
import { useTheme } from '@/hooks/use-theme';
import { announce } from '@/lib/announce';
import { draftFromDive, fieldOfProblem, hasMoreDetails, readDraft, type DiveDraft, type DraftField } from '@/lib/dive-draft';
import { formatDiveNumber, signaturesOf, sortDives } from '@/lib/dives';
import { leave } from '@/lib/leave';
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
      <Screen kind="modal">
        <Stack.Screen options={{ title: 'Edit page' }} />
        <EmptyState icon="logbook" title="This page isn’t in your log any more." />
      </Screen>
    );
  }

  const site = siteById(draft.siteId);
  if (picking) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <Stack.Screen
          options={{
            title: 'Choose the site',
            headerLeft: ({ tintColor }) => <HeaderBack onPress={() => setPicking(false)} label={`Back to ${formatDiveNumber(dive.number)}`} tintColor={tintColor} />,
          }}
        />
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
      </View>
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
      leave(`/dive/${dive.id}`);
    } catch (e: any) {
      const message: string = e.message ?? 'Could not save the page';
      complain(message, fieldOfProblem(message));
      setSaving(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* The picker's own back arrow is gone again: the navigator's closes this screen. */}
      <Stack.Screen options={{ title: 'Edit page', headerLeft: undefined }} />
      <Screen kind="modal" scrollRef={scrollView} onScroll={onScroll} scrollEventThrottle={16} contentStyle={styles.content} keyboardDismissMode={DISMISS_ON_DRAG} automaticallyAdjustKeyboardInsets>
        <View style={styles.field}>
          <FieldLabel>Site</FieldLabel>
          <List>
            <ListRow
              leading="pin"
              title={site?.name ?? 'Choose the site'}
              titleLines={2}
              accessibilityLabel={`Change the site${site ? `, now ${site.name}` : ''}`}
              trailing={<Text style={[TypeScale.subheadStrong, { color: theme.tint }]}>Change</Text>}
              onPress={() => setPicking(true)}
            />
          </List>
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
          <Notice icon="warning">
            {onPage.length > 0
              ? `The ${onPage.length === 1 ? 'sighting' : `${onPage.length} sightings`} on this page move with it to the new ${draft.siteId !== dive.siteId ? 'site' : 'day'}.`
              : ''}
            {confirmedOnPage > 0 ? ' Their buddy confirmations no longer apply and are cleared; they can be confirmed again.' : ''}
            {signed ? `${onPage.length > 0 ? ' ' : ''}The signatures come off too: they were for the old ${draft.siteId !== dive.siteId ? 'site' : 'day'}. Your buddy can sign again.` : ''}
          </Notice>
        ) : null}
      </Screen>
      <BottomBar>
        {error ? (
          <Text accessibilityLiveRegion="polite" style={[TypeScale.subhead, { color: theme.danger }]}>
            {error}
          </Text>
        ) : null}
        <Button title={saving ? 'Saving…' : 'Save changes'} onPress={() => void save()} disabled={saving} />
      </BottomBar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  // The pinned bar holds the button, so the page needs no room of its own at the foot.
  content: { paddingBottom: Space.s4 },
  field: { gap: Space.s2 },
});
