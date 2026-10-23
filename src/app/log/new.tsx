import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { DateField } from '@/components/date-field';
import { BottomBar } from '@/components/dive/bottom-bar';
import { DiveForm, Group } from '@/components/dive/dive-form';
import { HeaderBack } from '@/components/dive/header-back';
import { Bookplate } from '@/components/dive/marks';
import { FormField } from '@/components/form-field';
import { Icon } from '@/components/icon';
import { Chip } from '@/components/journal/chip';
import { Paper } from '@/components/journal/paper';
import { NewBadge, Stamp } from '@/components/journal/stamp';
import { OceanButton } from '@/components/ocean-button';
import { PrivacyFields } from '@/components/privacy-fields';
import { RarityChip } from '@/components/rarity-chip';
import { NewBadgesCelebration } from '@/components/rewards/new-badges';
import { SpeciesArt } from '@/components/species-art';
import { formatDate } from '@/components/sighting-row';
import { SitePicker } from '@/components/site-picker';
import { SpeciesAvatar } from '@/components/species-avatar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WhenReady } from '@/components/when-ready';
import { OnFill, Radius, Shadow, Spacing, Type } from '@/constants/theme';
import { useDiscardGuard, useHardwareBack } from '@/hooks/use-discard-guard';
import { DISMISS_ON_DRAG, useKeyboard } from '@/hooks/use-keyboard';
import { useNewBadges } from '@/hooks/use-new-badges';
import { usePhotoUrl } from '@/hooks/use-photo-url';
import { useRewards } from '@/hooks/use-rewards';
import { useScrollTo } from '@/hooks/use-scroll-to';
import { useSchemeName, useTheme } from '@/hooks/use-theme';
import { announce } from '@/lib/announce';
import { CATALOG, CATALOG_BY_ID, UNLISTED_ID, UNLISTED_NAME_MAX, speciesForSighting } from '@/lib/catalog';
import { carryOver, emptyDraft, fieldOfProblem, readDraft, type DiveDraft, type DraftField } from '@/lib/dive-draft';
import { formatDiveNumber, milestoneAt, milestoneName, nextDiveNumber, nextMilestone, sortDives } from '@/lib/dives';
import { recentDiveDate, rememberDiveDate } from '@/lib/last-dive-date';
import { keepPhoto } from '@/lib/photo-files';
import { DEFAULT_PRIVACY, lastPrivacyChoice, privacySummary, rememberPrivacyChoice, type PrivacySettings } from '@/lib/privacy-choice';
import { CATEGORY_LABEL, CATEGORY_ORDER } from '@/lib/rarity';
import { artFor } from '@/lib/species-art';
import { canEditSighting, isMaterialChange, localIsoDate, NOTES_MAX } from '@/lib/sighting-edit';
import { onSiteAdded } from '@/lib/site-added';
import { useAllSites, useAppStore, useMyDives, useMySightings, useMyUserId, useNextDiveNumber, useSiteById } from '@/lib/store';
import { searchSpecies } from '@/lib/text-search';
import type { BadgeResult } from '@/lib/rewards';
import type { Category, DiveSite, Species } from '@/lib/types';
import { statusOf } from '@/lib/verification';

type Step = 'site' | 'species' | 'details';
type Result = {
  count: number;
  siteName: string;
  newSpecies: Species[];
  dexNumber: number;
  /** The page written (a new dive) or added to. */
  dive?: { id: string; number: number; written: boolean };
};

const STEP_NAMES: Record<Step, string> = { site: 'Site', species: 'Animals', details: 'Details' };

/** A name cut to fit its step, with room for the other two: "Hin Daeng & Hi…". */
function shortName(name: string, max = 14): string {
  const letters = [...name.trim()];
  return letters.length <= max ? letters.join('') : `${letters.slice(0, max - 1).join('').trimEnd()}…`;
}
const STEP_ORDER: Step[] = ['site', 'species', 'details'];
const NAME_FIRST = 'Name the animal first';

/**
 * What the diver has put in, as one string, so that "has anything changed since the start?" is a
 * comparison. The date and who can see it count once they have been chosen: until then they are
 * filled in for the diver (and the last log's date arrives a moment late).
 */
function entrySnapshot(entry: {
  siteId: string | null;
  selected: string[];
  customName: string;
  notes: string;
  photoUri?: string;
  date: string | null;
  draft: DiveDraft | null;
  privacy: PrivacySettings | null;
}): string {
  // The draft carries the site and date itself, so those are left out of it here.
  return JSON.stringify({ ...entry, draft: entry.draft && { ...entry.draft, siteId: null, divedOn: '' } });
}

/**
 * Log a dive: pick the site, tick what you saw (or nothing), then fill in the page (its number,
 * date, depth and time, and as much more as you like) and write it with its sightings. Two other
 * ways in go through the same steps: `?dive=<id>` adds animals to a page already written, and
 * `?edit=<id>` edits one sighting (on a page, its site and date stay the page's).
 */
export default function LogSightingScreenRoute() {
  return (
    <WhenReady>
      <LogSightingScreen />
    </WhenReady>
  );
}

function LogSightingScreen() {
  const params = useLocalSearchParams<{ siteId?: string; speciesId?: string; edit?: string; dive?: string }>();
  const theme = useTheme();
  const scheme = useSchemeName();
  const sites = useAllSites();
  const siteById = useSiteById();
  const mySightings = useMySightings();
  const myDives = useMyDives();
  const nextNumber = useNextDiveNumber();
  const myUserId = useMyUserId();
  // Badges this log earns are celebrated once it is saved. The badges already earned are taken as
  // seen as soon as this opens, before anything is saved, so only the new ones are.
  const rewards = useRewards();
  const { fresh: newBadges, markSeen: markBadgesSeen } = useNewBadges({ owner: myUserId, badges: rewards.badges, ready: rewards.ready });
  const userId = useAppStore((s) => s.user?.id);
  const backendEnabled = useAppStore((s) => s.backendEnabled);
  const addSightings = useAppStore((s) => s.addSightings);
  const updateSighting = useAppStore((s) => s.updateSighting);
  const logDive = useAppStore((s) => s.logDive);
  const editing = useAppStore((s) => (params.edit ? s.sightings.find((x) => x.id === params.edit) : undefined));
  // The page the sightings go on, when it is already written: the one asked for, or the edited sighting's.
  const page = useAppStore((s) => {
    const id = params.dive ?? editing?.diveId;
    return id ? s.dives.find((d) => d.id === id && d.userId === myUserId) : undefined;
  });
  const multi = !editing;
  /** Writing a new page (not adding to one, not editing a sighting). */
  const newDive = !editing && !params.dive;

  const [siteId, setSiteId] = useState<string | null>(page?.siteId ?? editing?.siteId ?? params.siteId ?? null);
  const [selected, setSelected] = useState<string[]>(
    editing ? [editing.speciesId] : params.speciesId ? [params.speciesId] : [],
  );
  const [customName, setCustomName] = useState(editing?.customName ?? '');
  const [step, setStep] = useState<Step>(
    editing ? 'details' : page ? 'species' : params.siteId ? (params.speciesId ? 'details' : 'species') : 'site',
  );
  const [date, setDate] = useState(page?.divedOn ?? editing?.sightedOn ?? localIsoDate(new Date()));
  const [dateTouched, setDateTouched] = useState(!!editing);
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [photoUri, setPhotoUri] = useState<string | undefined>(editing?.photoUri);
  const photoPreview = usePhotoUrl(photoUri);
  // A new page starts numbered after the last, with the gear (and, on the same trip, the buddy and
  // dive centre) of the latest page.
  const [start] = useState(() => carryOver(sortDives(myDives)[0], localIsoDate(new Date())));
  const [draft, setDraft] = useState<DiveDraft>(() => ({ ...emptyDraft({ number: nextNumber, siteId: null, divedOn: date }), ...start.patch }));
  // Who can see it: an edit starts from the sighting's own choice (one from before privacy was
  // shared, notes and photo included); a new log from the last one made.
  const [privacy, setPrivacy] = useState<PrivacySettings>(
    editing
      ? { visibility: editing.visibility ?? 'public', notesPrivate: !!editing.notesPrivate, photoPrivate: !!editing.photoPrivate }
      : DEFAULT_PRIVACY,
  );
  const [privacyTouched, setPrivacyTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  // A general problem (a photo that wouldn't come, a save that failed), above the save button.
  const [error, setError] = useState<string | null>(null);
  // What is wrong with a field of the page, shown under it; and how often "Something else" has been
  // saved without a name (each time takes the diver back to that field).
  const [problem, setProblem] = useState<{ field: DraftField; message: string } | null>(null);
  const [nameAsked, setNameAsked] = useState(0);
  const nameField = useRef<TextInput>(null);
  const privacyField = useRef<View>(null);
  const { scrollView, onScroll, scrollTo } = useScrollTo();
  const keyboard = useKeyboard();
  const [result, setResult] = useState<Result | null>(null);

  // Leaving with something entered asks first; once saved there is nothing to lose.
  const snapshot = entrySnapshot({
    siteId,
    selected,
    customName,
    notes,
    photoUri,
    date: dateTouched ? date : null,
    draft: newDive ? draft : null,
    privacy: editing || privacyTouched ? privacy : null,
  });
  const [startSnapshot, setStartSnapshot] = useState(snapshot);
  const allowLeaving = useDiscardGuard(!result && snapshot !== startSnapshot);

  // Logging the rest of a trip: start from the date chosen last time, if that was recent.
  useEffect(() => {
    if (!newDive) return;
    let live = true;
    void recentDiveDate(localIsoDate(new Date())).then((iso) => {
      if (live && iso) setDate((current) => (current === localIsoDate(new Date()) ? iso : current));
    });
    return () => {
      live = false;
    };
  }, [newDive]);

  useEffect(() => {
    if (editing || privacyTouched) return;
    let live = true;
    void lastPrivacyChoice().then((choice) => {
      if (live && choice) setPrivacy(choice);
    });
    return () => {
      live = false;
    };
  }, [editing, privacyTouched]);

  useEffect(() => {
    if (nameAsked === 0) return;
    scrollTo(nameField.current);
    nameField.current?.focus();
  }, [nameAsked, scrollTo]);

  // Back from "Add a dive site" with the new site: carry on to the species.
  useEffect(
    () =>
      onSiteAdded((id) => {
        setSiteId(id);
        setStep('species');
      }),
    [],
  );

  const site = siteId ? siteById(siteId) : null;
  const chosen = selected
    .map((id) => (id === UNLISTED_ID ? speciesForSighting({ speciesId: id, customName }) : CATALOG_BY_ID.get(id)))
    .filter((s): s is Species => !!s);
  const unlisted = selected.includes(UNLISTED_ID);

  const goTo = (next: Step) => {
    setStep(next);
    setError(null);
    setProblem(null);
    announce(
      `Step ${STEP_ORDER.indexOf(next) + 1} of 3: ${next === 'site' ? 'choose the dive site' : next === 'species' ? 'choose what you saw' : newDive ? 'the dive' : 'notes'}`,
    );
  };
  // The way back through the steps; null on the first, where Back closes. An edit starts on the
  // details, so the species and site it can reach from there lead back to them.
  const previousStep: Step | null = editing
    ? step === 'details'
      ? null
      : 'details'
    : step === 'details'
      ? 'species'
      : step === 'species' && !page
        ? 'site'
        : null;
  const goBack = () => {
    if (previousStep) goTo(previousStep);
    else if (router.canGoBack()) router.back();
    else router.replace('/');
  };
  useHardwareBack(() => {
    if (result || !previousStep) return false;
    goTo(previousStep);
    return true;
  });
  const pickSite = (s: DiveSite) => {
    setSiteId(s.id);
    goTo(selected.length > 0 ? 'details' : 'species');
  };
  const toggleSpecies = (id: string, name?: string) => {
    if (id === UNLISTED_ID && name !== undefined) {
      // Choosing "something else" again under a new name renames it rather than unticking it.
      const renaming = selected.includes(UNLISTED_ID) && !!name && name !== customName;
      setCustomName(name);
      if (renaming && multi) return;
    }
    if (!multi) {
      setSelected([id]);
      goTo('details');
      return;
    }
    setSelected((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  };

  const pickPhoto = async (source: 'camera' | 'library') => {
    setError(null);
    try {
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          const message = 'ScubaGo needs camera access to take a photo. You can allow it in Settings, or choose a photo instead.';
          setError(message);
          announce(message);
          return;
        }
      }
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        quality: 0.7,
        // iOS hands over a JPEG instead of the original HEIC, which the picker then re-encodes: that
        // drops the photo's metadata, including where it was taken, before it can reach the public
        // photo bucket. (By default an iPhone HEIC photo is passed through byte for byte, GPS and all.)
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      };
      const picked =
        source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      // A sighting logged offline may wait days to sync: keep the photo out of the system's cache.
      if (!picked.canceled && picked.assets[0]) {
        setPhotoUri(await keepPhoto(picked.assets[0].uri));
        announce('Photo added');
      }
    } catch (e: any) {
      const message = e?.message ?? 'Couldn’t get that photo.';
      setError(message);
      announce(message);
    }
  };

  // A problem with a field of the page goes under it; one with the page as a whole above the button.
  const complain = (message: string, field?: DraftField) => {
    if (field && field !== 'siteId' && newDive) setProblem({ field, message });
    else setError(message);
    announce(message);
  };

  const save = async () => {
    if (!siteId || !site || saving) return;
    if (!newDive && chosen.length === 0) return;
    // Said under the field, with the diver taken there: never a button that is just greyed out.
    if (unlisted && !customName.trim()) {
      setNameAsked((n) => n + 1);
      announce(NAME_FIRST);
      return;
    }
    setSaving(true);
    setError(null);
    setProblem(null);
    // On a page, the sightings take the page's site and date.
    const base = { siteId: page?.siteId ?? siteId, sightedOn: page?.divedOn ?? date, notes: notes.trim() || undefined, ...privacy };
    const picks = selected.map((speciesId) => ({
      ...base,
      speciesId,
      // One photo shows one animal: only a single-species log carries it.
      photoUri: selected.length === 1 ? photoUri : undefined,
      customName: speciesId === UNLISTED_ID ? customName : undefined,
    }));
    const owned = new Set(mySightings.map((s) => s.speciesId).filter((id) => id !== UNLISTED_ID));
    try {
      if (editing) {
        const speciesId = selected[0];
        const { isNewSpecies } = await updateSighting(editing.id, { ...picks[0], photoUri });
        if (!isNewSpecies) {
          allowLeaving();
          router.back();
          return;
        }
        const others = mySightings.filter((s) => s.id !== editing.id);
        setResult({
          count: 1,
          siteName: site.name,
          newSpecies: chosen,
          dexNumber: new Set([...others.map((s) => s.speciesId), speciesId].filter((id) => id !== UNLISTED_ID)).size,
        });
        setSaving(false);
        return;
      }
      let outcome: Result;
      if (page) {
        const { newSpeciesIds } = await addSightings(picks.map((p) => ({ ...p, diveId: page.id })));
        outcome = {
          count: picks.length,
          siteName: site.name,
          newSpecies: newSpeciesIds.map((id) => CATALOG_BY_ID.get(id)!).filter(Boolean),
          dexNumber: owned.size + newSpeciesIds.length,
          dive: { id: page.id, number: page.number, written: false },
        };
      } else {
        const read = readDraft({ ...draft, siteId, divedOn: date });
        if (read.problem !== undefined) {
          complain(read.problem, read.field);
          setSaving(false);
          return;
        }
        const { dive, newSpeciesIds } = await logDive({
          dive: read.fields,
          sightings: picks.map(({ siteId: _s, sightedOn: _d, ...rest }) => rest),
        });
        void rememberDiveDate(date, localIsoDate(new Date()));
        outcome = {
          count: picks.length,
          siteName: site.name,
          newSpecies: newSpeciesIds.map((id) => CATALOG_BY_ID.get(id)!).filter(Boolean),
          dexNumber: owned.size + newSpeciesIds.length,
          dive: { id: dive.id, number: dive.number, written: true },
        };
      }
      if (picks.length > 0) void rememberPrivacyChoice(privacy);
      setResult(outcome);
      announce(
        [
          outcome.dive?.written ? `Entry number ${outcome.dive.number} written.` : 'Saved.',
          outcome.newSpecies.length > 0
            ? `${outcome.newSpecies.length === 1 ? 'A new species' : `${outcome.newSpecies.length} new species`} for your collection.`
            : outcome.count > 0
              ? `${outcome.count === 1 ? 'One sighting' : `${outcome.count} sightings`} on the page.`
              : '',
        ].join(' '),
      );
    } catch (e: any) {
      const message: string = e.message ?? 'Could not save';
      complain(message, fieldOfProblem(message));
    } finally {
      setSaving(false);
    }
  };

  const logMore = () => {
    setResult(null);
    setSelected([]);
    setCustomName('');
    setNotes('');
    setPhotoUri(undefined);
    // The next page: numbered after the one just written, with its gear and buddy.
    const { dives, divesBefore } = useAppStore.getState();
    const mine = dives.filter((d) => d.userId === myUserId);
    const next = { ...emptyDraft({ number: nextDiveNumber(mine, divesBefore[myUserId] ?? 0), siteId: null, divedOn: date }), ...carryOver(sortDives(mine)[0], date).patch };
    setDraft(next);
    // A page begun afresh: nothing entered yet, though the site and date stay as they were.
    setStartSnapshot(entrySnapshot({ siteId, selected: [], customName: '', notes: '', date: dateTouched ? date : null, draft: next, privacy: privacyTouched ? privacy : null }));
    goTo('site');
  };

  if (result) {
    return <Saved result={result} onLogMore={newDive ? logMore : undefined} newBadges={newBadges} onBadgesSeen={markBadgesSeen} />;
  }

  if (params.edit && (!editing || !canEditSighting(editing, myUserId))) {
    return (
      <ThemedView style={styles.centered}>
        <Stack.Screen options={{ title: 'Edit sighting' }} />
        <ThemedText>{editing ? 'You can only edit your own sightings.' : 'This sighting isn’t here any more.'}</ThemedText>
      </ThemedView>
    );
  }
  if (params.dive && !page) {
    return (
      <ThemedView style={styles.centered}>
        <Stack.Screen options={{ title: 'Add to a page' }} />
        <ThemedText>This page isn’t in your log any more.</ThemedText>
      </ThemedView>
    );
  }

  // Changing what was seen, where or when voids a confirmation (the server enforces it too).
  const losesVerification =
    !!editing &&
    statusOf(editing) !== 'unverified' &&
    !!siteId &&
    selected.length === 1 &&
    isMaterialChange(editing, { speciesId: selected[0], siteId: page?.siteId ?? siteId, sightedOn: page?.divedOn ?? date, customName });

  const nameMissing = unlisted && nameAsked > 0 && !customName.trim();
  const takenBy = newDive ? myDives.find((d) => String(d.number) === draft.number) : undefined;
  // Each step is named by a fixed short word, or by what was chosen in it (cut short: the three share one line).
  const crumbs: { step: Step; chosen?: string; enabled: boolean }[] = [
    { step: 'site', chosen: site?.name, enabled: !page },
    { step: 'species', chosen: chosen.length === 0 ? undefined : chosen.length === 1 ? chosen[0].commonName : `${chosen.length} animals`, enabled: !!site },
    { step: 'details', enabled: !!site && (chosen.length > 0 || newDive) },
  ];

  const stepIndex = STEP_ORDER.indexOf(step);
  const showDetails = step === 'details' && !!site && (chosen.length > 0 || newDive);

  return (
    <ThemedView style={styles.container}>
      {/* Set in full: the new-species page turns the header twilight, and "Log more" comes back here. */}
      <Stack.Screen
        options={{
          title: editing ? 'Edit sighting' : page ? `Add to ${formatDiveNumber(page.number)}` : 'Log a dive',
          headerStyle: { backgroundColor: theme.background },
          headerTintColor: theme.text,
          headerTitleStyle: { fontFamily: Type.display, fontSize: 19, color: theme.text },
          // Back goes back a step, and leaves only from the first.
          headerLeft: ({ tintColor }) => <HeaderBack onPress={goBack} label={previousStep ? `Back to ${STEP_NAMES[previousStep].toLowerCase()}` : 'Close'} tintColor={tintColor} />,
        }}
      />
      {/* The three steps, numbered like the pages of a form: done ones ticked, the current one inked in. Out of the way while typing (it is a sixth of a small phone with the keyboard up), and when editing one sighting, which has no steps to take. */}
      {!keyboard.open && !editing && (
        <View style={[styles.steps, { borderBottomColor: theme.rule }]} accessibilityRole="tablist" accessibilityLabel="Steps">
          {crumbs.map((c, i) => {
            const current = step === c.step;
            const done = i < stepIndex && (c.enabled || (c.step === 'site' && !!page));
            return (
              <View key={c.step} style={styles.stepWrap}>
                {i > 0 ? <View style={[styles.stepRule, { backgroundColor: i <= stepIndex ? theme.lagoon : theme.rule }]} /> : null}
                <Pressable
                  onPress={() => c.enabled && goTo(c.step)}
                  disabled={!c.enabled}
                  accessibilityRole="tab"
                  accessibilityLabel={`Step ${i + 1}, ${STEP_NAMES[c.step]}${c.chosen ? `: ${c.chosen}` : ''}`}
                  aria-selected={current}
                  aria-disabled={!c.enabled}
                  style={({ pressed }) => [styles.step, { opacity: pressed ? 0.6 : 1 }]}>
                  <View
                    style={[
                      styles.stepDot,
                      current
                        ? { backgroundColor: theme.lagoon, borderColor: theme.lagoon }
                        : done
                          ? { backgroundColor: theme.backgroundElement, borderColor: theme.lagoon }
                          : { backgroundColor: theme.backgroundElement, borderColor: theme.rule },
                    ]}>
                    {done ? (
                      <Icon name="check" size={14} color={theme.tint} weight="bold" />
                    ) : (
                      <Text style={[styles.stepNumber, { color: current ? OnFill[scheme].lagoon : theme.textSecondary }]}>{i + 1}</Text>
                    )}
                  </View>
                  <Text
                    numberOfLines={1}
                    style={[styles.stepLabel, { color: current ? theme.text : c.enabled || done ? theme.text : theme.textSecondary, fontFamily: current ? Type.bodyHeavy : Type.bodyBold }]}>
                    {c.chosen ? shortName(c.chosen) : STEP_NAMES[c.step]}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      )}

      {step === 'site' && (
        <SitePicker sites={sites} recentSiteIds={recentSiteIds(mySightings)} userId={userId} onPick={pickSite} />
      )}
      {step === 'species' && (
        <SpeciesPicker
          multi={multi}
          selected={selected}
          customName={customName}
          site={site ?? undefined}
          recentIds={recentSpeciesIds(mySightings)}
          allowNone={newDive}
          onToggle={toggleSpecies}
          onDone={() => goTo('details')}
        />
      )}
      {showDetails && (
        <ScrollView
          ref={scrollView}
          onScroll={onScroll}
          scrollEventThrottle={16}
          contentContainerStyle={styles.details}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={DISMISS_ON_DRAG}
          automaticallyAdjustKeyboardInsets>
          <Paper style={styles.sawCard}>
            <View style={styles.sawHeader}>
              <ThemedText type="label">{editing ? 'Logbook entry' : page ? formatDiveNumber(page.number) : 'New logbook entry'}</ThemedText>
              <ThemedText type="heading" accessibilityRole="header">
                {newDive ? `${draft.number ? `No. ${draft.number}` : 'A dive'} at ${site.name}` : site.name}
              </ThemedText>
              {page ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {formatDate(page.divedOn)} · the site and date are the page’s{editing ? '; change them on the page' : ''}.
                </ThemedText>
              ) : null}
            </View>
            {chosen.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                No animals on this page yet. You can add them now or later.
              </ThemedText>
            ) : null}
            {chosen.map((s, i) => (
              <View key={s.id} style={[styles.summary, i > 0 && { borderTopWidth: 1, borderTopColor: theme.rule }]}>
                <SpeciesAvatar species={s} size={48} showRarityRing={s.id !== UNLISTED_ID} />
                <View style={{ flex: 1, gap: 3 }}>
                  <ThemedText type="smallBold" numberOfLines={2} style={{ fontFamily: Type.bodyHeavy, fontSize: 15 }}>
                    {s.commonName}
                  </ThemedText>
                  {s.id !== UNLISTED_ID ? <RarityChip rarity={s.rarity} small /> : null}
                </View>
                {multi ? (
                  <Pressable
                    onPress={() => {
                      const left = selected.filter((x) => x !== s.id);
                      setSelected(left);
                      if (left.length === 0 && !newDive) goTo('species');
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${s.commonName}`}
                    hitSlop={8}
                    style={({ pressed }) => [styles.iconButton, { backgroundColor: pressed ? theme.backgroundSelected : 'transparent' }]}>
                    <Icon name="close" size={18} color={theme.textSecondary} weight="bold" />
                  </Pressable>
                ) : null}
              </View>
            ))}
            {multi ? (
              <Pressable onPress={() => goTo('species')} accessibilityRole="button" style={styles.textButton}>
                <Icon name="plus" size={16} color={theme.tint} weight="bold" />
                <ThemedText type="smallBold" themeColor="tint">
                  {chosen.length === 0 ? 'Add what you saw' : 'Add another species'}
                </ThemedText>
              </Pressable>
            ) : (
              // An edit has no step bar: the animal, and the site if it isn't a page's, are changed from here.
              <View style={styles.changes}>
                <Pressable onPress={() => goTo('species')} accessibilityRole="button" style={styles.textButton}>
                  <Icon name="edit" size={16} color={theme.tint} weight="bold" />
                  <ThemedText type="smallBold" themeColor="tint">
                    Change the animal
                  </ThemedText>
                </Pressable>
                {!page ? (
                  <Pressable onPress={() => goTo('site')} accessibilityRole="button" style={styles.textButton}>
                    <Icon name="pin" size={16} color={theme.tint} weight="bold" />
                    <ThemedText type="smallBold" themeColor="tint">
                      Change the site
                    </ThemedText>
                  </Pressable>
                ) : null}
              </View>
            )}
          </Paper>

          {unlisted ? (
            <View style={styles.nameField}>
              <FormField
                ref={nameField}
                label="What was it?"
                // The reason is under the field, so the hint gives way to it.
                hint={nameMissing ? undefined : 'Not in our catalogue yet. It’s saved in your log but doesn’t count towards your collection.'}
                placeholder="e.g. Nudibranch I couldn’t identify"
                value={customName}
                onChangeText={setCustomName}
                maxLength={UNLISTED_NAME_MAX}
                style={nameMissing ? { borderColor: theme.danger } : undefined}
              />
              {nameMissing ? (
                <ThemedText type="small" themeColor="danger" accessibilityLiveRegion="polite">
                  {NAME_FIRST}
                </ThemedText>
              ) : null}
            </View>
          ) : null}

          {!newDive && !page ? (
            <View style={{ gap: 6 }}>
              <DateField
                value={date}
                onChange={(iso) => {
                  setDate(iso);
                  setDateTouched(true);
                }}
              />
            </View>
          ) : null}

          {/* What was seen, together under the animals: notes about them, a photo, who can see it. The dive's own notes stay with the dive. */}
          {chosen.length > 0 ? (
            <Group title="What you saw" icon="fieldGuide">
              <FormField
                label="Notes about the animals"
                hint={chosen.length > 1 ? `Added to each of the ${chosen.length} sightings.` : undefined}
                placeholder="Came up to check us out at the safety stop…"
                value={notes}
                onChangeText={setNotes}
                multiline
                maxLength={NOTES_MAX}
                style={styles.notes}
              />

              {chosen.length === 1 ? (
                <View style={{ gap: 6 }}>
                  <ThemedText type="label" accessibilityRole="header">
                    Photo
                  </ThemedText>
                  {photoUri ? (
                    <>
                      <Image
                        source={photoPreview ? { uri: photoPreview } : undefined}
                        style={[styles.photoPreview, { backgroundColor: theme.backgroundElement, borderColor: theme.cardBorder }]}
                        contentFit="cover"
                        accessibilityLabel={`Your photo of the ${chosen[0].commonName}`}
                      />
                      <Pressable onPress={() => setPhotoUri(undefined)} accessibilityRole="button" style={styles.textButton}>
                        <Icon name="trash" size={16} color={theme.textSecondary} />
                        <ThemedText type="smallBold" themeColor="textSecondary">
                          Remove photo
                        </ThemedText>
                      </Pressable>
                    </>
                  ) : (
                    <>
                      <ThemedText type="small" themeColor="textSecondary">
                        Sightings with a photo get a credibility badge.
                      </ThemedText>
                      <View style={styles.photoButtons}>
                        <OceanButton title="Take photo" icon="camera" variant="secondary" onPress={() => pickPhoto('camera')} style={{ flex: 1 }} />
                        <OceanButton title="Choose photo" icon="image" variant="secondary" onPress={() => pickPhoto('library')} style={{ flex: 1 }} />
                      </View>
                    </>
                  )}
                </View>
              ) : chosen.length > 1 ? (
                <ThemedText type="caption" themeColor="textSecondary">
                  Photos go with one sighting each: add one afterwards from the sighting in your logbook.
                </ThemedText>
              ) : null}

              {/* Without a backend nothing leaves the phone, so there is nobody to keep it from. */}
              {backendEnabled ? (
                <View ref={privacyField} collapsable={false}>
                  <PrivacyFields
                    value={privacy}
                    onChange={(next) => {
                      setPrivacy(next);
                      setPrivacyTouched(true);
                    }}
                    photo={chosen.length === 1}
                    count={chosen.length}
                  />
                </View>
              ) : null}
            </Group>
          ) : null}

          {losesVerification ? (
            <Paper tone="sand" style={styles.warning}>
              <Icon name="warning" size={20} wash={theme.sun} />
              <ThemedText type="small" style={{ flex: 1 }}>
                Changing the species, site or date removes this sighting’s verification. It can be confirmed again
                afterwards.
              </ThemedText>
            </Paper>
          ) : null}

          {newDive ? (
            <DiveForm
              draft={{ ...draft, siteId, divedOn: date }}
              problem={problem}
              onReveal={scrollTo}
              onChange={(patch) => {
                // Putting the field right is the end of its problem.
                if (problem && problem.field in patch) setProblem(null);
                if (patch.divedOn !== undefined) {
                  setDate(patch.divedOn);
                  setDateTouched(true);
                }
                setDraft((d) => ({ ...d, ...patch }));
              }}
              nextNumber={nextNumber}
              takenBy={takenBy ? { number: takenBy.number, siteName: siteById(takenBy.siteId)?.name } : undefined}
              carried={start.from !== undefined ? { from: start.from, what: start.what } : undefined}
            />
          ) : null}
          {newDive && !dateTouched && date !== localIsoDate(new Date()) ? (
            <ThemedText type="caption" themeColor="textSecondary" style={styles.dateNote}>
              Dated the same day as your last log.
            </ThemedText>
          ) : null}
        </ScrollView>
      )}
      {/* Pinned, like the species step's: the button is never at the end of a long page. */}
      {showDetails && (
        <BottomBar keyboardOpen={keyboard.open}>
          {/* What the last choice was, in plain sight: nothing goes private or public by surprise. */}
          {backendEnabled && chosen.length > 0 ? (
            <Pressable
              onPress={() => {
                scrollTo(privacyField.current, 24);
                announce('Who can see this');
              }}
              accessibilityRole="button"
              accessibilityLabel={`Visible to: ${privacySummary(privacy, { photo: chosen.length === 1 })}. Change who can see this`}
              hitSlop={{ top: 6, bottom: 6 }}
              style={({ pressed }) => [styles.visibleTo, { opacity: pressed ? 0.6 : 1 }]}>
              <Text style={[styles.visibleToText, { color: theme.textSecondary }]} numberOfLines={2}>
                Visible to: <Text style={{ fontFamily: Type.bodyHeavy, color: theme.text }}>{privacySummary(privacy, { photo: chosen.length === 1 })}</Text>
                {' · '}
                <Text style={{ fontFamily: Type.bodyHeavy, color: theme.tint }}>change</Text>
              </Text>
            </Pressable>
          ) : null}
          {error ? (
            <ThemedText type="small" themeColor="danger" accessibilityLiveRegion="polite">
              {error}
            </ThemedText>
          ) : null}
          <OceanButton
            title={
              saving
                ? 'Saving…'
                : editing
                  ? 'Save changes'
                  : newDive
                    ? `Save dive${draft.number ? ` No. ${draft.number}` : ''}`
                    : `Add to ${formatDiveNumber(page!.number)}`
            }
            variant={editing ? 'primary' : 'log'}
            icon={editing || saving ? undefined : 'stamp'}
            onPress={save}
            disabled={saving}
          />
        </BottomBar>
      )}
    </ThemedView>
  );
}

function recentSiteIds(sightings: { siteId: string; createdAt: string }[]): string[] {
  const seen: string[] = [];
  for (const s of [...sightings].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    if (!seen.includes(s.siteId)) seen.push(s.siteId);
    if (seen.length === 3) break;
  }
  return seen;
}

/** Species the diver logged most recently, newest first (catalogue species only). */
function recentSpeciesIds(sightings: { speciesId: string; createdAt: string }[]): string[] {
  const seen: string[] = [];
  for (const s of [...sightings].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    if (s.speciesId !== UNLISTED_ID && CATALOG_BY_ID.has(s.speciesId) && !seen.includes(s.speciesId)) seen.push(s.speciesId);
    if (seen.length === 8) break;
  }
  return seen;
}

function SpeciesPicker({
  multi,
  selected,
  customName,
  site,
  recentIds,
  allowNone = false,
  onToggle,
  onDone,
}: {
  multi: boolean;
  selected: string[];
  customName: string;
  site?: DiveSite;
  recentIds: string[];
  /** A dive can be logged without any animals: "Next" works with nothing ticked. */
  allowNone?: boolean;
  onToggle: (id: string, customName?: string) => void;
  onDone: () => void;
}) {
  // The bar with "Next" is at the foot of this view, and the view is lifted clear of the keyboard.
  const lift = useRef<View>(null);
  const keyboard = useKeyboard(lift);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category | null>(null);
  const searching = query.trim().length > 0;

  const results = useMemo(() => {
    const pool = category ? CATALOG.filter((s) => s.category === category) : CATALOG;
    return searchSpecies(pool, query);
  }, [query, category]);

  // Without a search: what's usually seen at this site, then what the diver logs often, then everything.
  const likely = !searching && !category && site ? site.notableSpecies.map((id) => CATALOG_BY_ID.get(id)).filter((s): s is Species => !!s) : [];
  const likelyIds = new Set(likely.map((s) => s.id));
  const recent = !searching && !category ? recentIds.filter((id) => !likelyIds.has(id)).map((id) => CATALOG_BY_ID.get(id)!) : [];
  const shownAbove = new Set([...likelyIds, ...recent.map((s) => s.id)]);
  const rest = searching || category ? results : results.filter((s) => !shownAbove.has(s.id));

  const renderRow = (s: Species) => (
    <SpeciesRow key={s.id} species={s} multi={multi} checked={selected.includes(s.id)} onPress={() => onToggle(s.id)} />
  );
  const somethingElseName = searching ? query.trim() : customName;
  const count = selected.length;

  return (
    <View ref={lift} collapsable={false} style={{ flex: 1, paddingBottom: keyboard.overlap }}>
      <View style={[styles.picker, styles.pickerTop]}>
        <FormField
          label={multi ? 'What did you see? Tick everything' : 'What did you see?'}
          value={query}
          onChangeText={setQuery}
          placeholder="Search: manta, nudibranch, turtle…"
          autoCorrect={false}
          returnKeyType="search"
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipsScroll}
          contentContainerStyle={styles.chips}
          accessibilityLabel="Filter by group">
          {CATEGORY_ORDER.map((cat) => (
            <Chip
              key={cat}
              label={CATEGORY_LABEL[cat]}
              accessibilityLabel={`${CATEGORY_LABEL[cat]} only`}
              selected={category === cat}
              onPress={() => setCategory(category === cat ? null : cat)}
            />
          ))}
        </ScrollView>
      </View>
      <ScrollView contentContainerStyle={styles.picker} keyboardShouldPersistTaps="handled" keyboardDismissMode={DISMISS_ON_DRAG}>
        {likely.length > 0 ? (
          <>
            <ThemedText type="label" accessibilityRole="header" style={styles.groupLabel}>
              Often seen at {site!.name}
            </ThemedText>
            {likely.map(renderRow)}
          </>
        ) : null}
        {recent.length > 0 ? (
          <>
            <ThemedText type="label" accessibilityRole="header" style={styles.groupLabel}>
              You’ve logged recently
            </ThemedText>
            {recent.map(renderRow)}
          </>
        ) : null}
        {likely.length > 0 || recent.length > 0 ? (
          <ThemedText type="label" accessibilityRole="header" style={styles.groupLabel}>
            All species
          </ThemedText>
        ) : null}
        {rest.map(renderRow)}
        {searching && rest.length === 0 ? (
          <ThemedText type="caption" themeColor="textSecondary" accessibilityLiveRegion="polite">
            Nothing in the catalogue matches “{query.trim()}”.
          </ThemedText>
        ) : null}
        <SpeciesRow
          species={speciesForSighting({ speciesId: UNLISTED_ID, customName: somethingElseName })!}
          multi={multi}
          checked={selected.includes(UNLISTED_ID)}
          title={somethingElseName ? `Something else: “${somethingElseName}”` : 'Something else…'}
          subtitle="Not in the catalogue? Log it in your own words"
          onPress={() => onToggle(UNLISTED_ID, somethingElseName)}
        />
      </ScrollView>
      {multi ? (
        <BottomBar keyboardOpen={keyboard.open}>
          <OceanButton
            title={count === 0 ? (allowNone ? 'Skip animals' : 'Tick what you saw') : `Next · ${count} ${count === 1 ? 'species' : 'species'}`}
            variant={count === 0 && allowNone ? 'secondary' : 'primary'}
            onPress={onDone}
            disabled={count === 0 && !allowNone}
          />
        </BottomBar>
      ) : null}
    </View>
  );
}

function SpeciesRow({
  species,
  multi,
  checked,
  title,
  subtitle,
  onPress,
}: {
  species: Species;
  multi: boolean;
  checked: boolean;
  title?: string;
  subtitle?: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  const scheme = useSchemeName();
  const unlisted = species.id === UNLISTED_ID;
  const name = title ?? species.commonName;
  const detail = subtitle ?? species.scientificName;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={multi ? 'checkbox' : 'button'}
      aria-checked={multi ? checked : undefined}
      accessibilityLabel={unlisted ? `${name}. ${detail}` : `${name}, ${species.rarity}`}
      style={({ pressed }) => [
        styles.row,
        styles.speciesRow,
        {
          backgroundColor: pressed ? theme.backgroundSelected : checked ? `${theme.wash}40` : theme.backgroundElement,
          borderColor: checked ? theme.lagoon : theme.cardBorder,
          boxShadow: Shadow[scheme].card,
        },
      ]}>
      <SpeciesAvatar species={species} size={48} showRarityRing={!unlisted} />
      <View style={{ flex: 1, gap: 1 }}>
        <Text numberOfLines={2} style={[styles.rowTitle, { color: theme.text }]}>
          {name}
        </Text>
        <ThemedText type={unlisted ? 'small' : 'caption'} themeColor="textSecondary" numberOfLines={2} style={!unlisted && styles.scientific}>
          {detail}
        </ThemedText>
      </View>
      {!unlisted ? <RarityChip rarity={species.rarity} small /> : null}
      {multi ? (
        <View
          style={[styles.check, { borderColor: checked ? theme.lagoon : theme.rule, backgroundColor: checked ? theme.lagoon : theme.backgroundElement }]}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden>
          {checked ? <Icon name="check" size={16} color={OnFill[scheme].lagoon} weight="bold" /> : null}
        </View>
      ) : null}
    </Pressable>
  );
}

/** Ink on the twilight page of the new-species moment. */
const ON_TWILIGHT = { text: '#FFFFFF', soft: '#C9D3FF' };

/**
 * After saving. A new species turns over a field-guide card and stamps it "First record"; an
 * ordinary log gets a "Logged" stamp. Nothing moves under Reduce Motion. Either way the next steps
 * are one footer pinned under the page, so they are in reach whatever the page above holds.
 */
function Saved({ result, onLogMore, newBadges, onBadgesSeen }: { result: Result; onLogMore?: () => void; newBadges: BadgeResult[]; onBadgesSeen: (ids: string[]) => void }) {
  const theme = useTheme();
  const { newSpecies, count, siteName, dive } = result;
  const milestone = dive?.written ? milestoneAt(dive.number) : null;
  const ahead = dive?.written && !milestone ? nextMilestone(dive.number + 1) : null;
  const badgeCelebration = <NewBadgesCelebration fresh={newBadges} onSeen={onBadgesSeen} onOpenAll={() => router.replace('/rewards')} />;
  const openPage = dive ? () => (dive.written ? router.replace(`/dive/${dive.id}`) : router.back()) : undefined;
  // Signing from here ends on the page (there's no page behind this screen to go back to).
  const askToSign = dive?.written ? () => router.replace({ pathname: '/dive/sign', params: { id: dive.id, then: 'page' } }) : undefined;
  // A dive written without animals can have them added now: the same steps, on its page.
  const addWhatYouSaw = dive?.written && count === 0 ? () => router.replace({ pathname: '/log/new', params: { dive: dive.id } }) : undefined;
  if (newSpecies.length === 0) {
    return (
      <ThemedView style={styles.container}>
        {/* The form's own back arrow steps back through its steps; here the navigator's leaves. */}
        <Stack.Screen options={{ title: 'Logged', headerLeft: undefined }} />
        <ScrollView contentContainerStyle={styles.savedScroll}>
          <Paper raised style={styles.savedCard}>
            <Stamp
              lines={dive?.written ? [formatDiveNumber(dive.number).toUpperCase(), siteName.toUpperCase().slice(0, 22)] : ['Logged', siteName.toUpperCase().slice(0, 22)]}
              animate
              delay={150}
              rotate={-6}
              style={{ alignSelf: 'center' }}
            />
            <ThemedText type="display" accessibilityRole="header" style={styles.center}>
              {dive?.written ? `Entry ${formatDiveNumber(dive.number)}` : 'Saved'}
            </ThemedText>
            <ThemedText style={styles.center} themeColor="textSecondary">
              {dive?.written
                ? count === 0
                  ? `Your dive at ${siteName} is written in your logbook, with no animals on it yet.`
                  : `Written in your logbook, with ${count === 1 ? 'one sighting' : `${count} sightings`} at ${siteName}.`
                : dive
                  ? `${count === 1 ? 'Your sighting is' : `${count} sightings are`} on ${formatDiveNumber(dive.number)}.`
                  : `${count === 1 ? 'Your sighting is' : `${count} sightings are`} in your log, at ${siteName}.`}
            </ThemedText>
            {addWhatYouSaw ? <OceanButton title="Add what you saw" icon="plus" variant="secondary" onPress={addWhatYouSaw} style={styles.stretch} /> : null}
            {milestone ? <Bookplate at={milestone} siteName={siteName} style={styles.stretch} /> : null}
            {badgeCelebration}
            {ahead && ahead.remaining <= 5 ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
                {ahead.remaining === 0 ? `Your next dive is your ${milestoneName(ahead.at)}.` : `${countWord(ahead.remaining + 1)} dives to your ${milestoneName(ahead.at)}.`}
              </ThemedText>
            ) : null}
          </Paper>
        </ScrollView>
        <SavedFooter
          primary={<OceanButton title={dive && !dive.written ? 'Back to the page' : 'Done'} onPress={() => router.back()} style={styles.stretch} />}
          // Sightings added to a page end on the page already: "Back to the page" is the way there.
          page={dive?.written ? { title: 'Open the page', onPress: openPage! } : undefined}
          onSign={askToSign}
          onLogMore={onLogMore}
        />
      </ThemedView>
    );
  }
  const first = newSpecies[0];
  return (
    <View style={[styles.twilight, { backgroundColor: theme.twilight }]}>
      <Stack.Screen
        options={{
          headerStyle: { backgroundColor: theme.twilight },
          headerTintColor: ON_TWILIGHT.text,
          headerTitleStyle: { fontFamily: Type.display, fontSize: 19, color: ON_TWILIGHT.text },
          headerLeft: undefined,
          title: 'Logged',
        }}
      />
      <Bubbles />
      <ScrollView contentContainerStyle={styles.twilightContent}>
        <View style={{ alignItems: 'center', gap: 4 }}>
          <Text style={[styles.twilightEyebrow, { color: ON_TWILIGHT.soft }]}>
            {dive ? `${formatDiveNumber(dive.number).toUpperCase()} · ` : ''}
            {count === 1 ? 'ONE SIGHTING' : `${count} SIGHTINGS`} · {siteName.toUpperCase()}
          </Text>
          <Text accessibilityRole="header" style={[styles.twilightTitle, { color: ON_TWILIGHT.text }]}>
            {newSpecies.length === 1 ? 'A first record' : `${newSpecies.length} first records`}
          </Text>
          <Text style={[styles.twilightSub, { color: ON_TWILIGHT.soft }]}>
            {newSpecies.length === 1 ? `Entry ${result.dexNumber} in your field guide` : `Your field guide now has ${result.dexNumber} species`}
          </Text>
        </View>
        {newSpecies.length === 1 ? (
          <FlipCard species={first} dexNumber={result.dexNumber} />
        ) : (
          <Paper raised style={styles.manyCard}>
            <Stamp lines={['First records', `×${newSpecies.length}`]} animate delay={400} rotate={-5} style={{ alignSelf: 'center' }} />
            <View style={styles.newGrid}>
              {newSpecies.slice(0, 9).map((s) => (
                <View key={s.id} style={styles.newCell}>
                  <View style={[styles.newPlate, { backgroundColor: `${artFor(s).wash}26`, borderColor: theme.cardBorder }]}>
                    <SpeciesArt species={s} width={76} />
                  </View>
                  <ThemedText type="small" style={[styles.center, { fontFamily: Type.bodyBold, fontSize: 13, lineHeight: 16 }]} numberOfLines={2}>
                    {s.commonName}
                  </ThemedText>
                </View>
              ))}
            </View>
            {newSpecies.length > 9 ? (
              <ThemedText type="caption" themeColor="textSecondary" style={styles.center}>
                and {newSpecies.length - 9} more
              </ThemedText>
            ) : null}
          </Paper>
        )}
        {milestone ? <Bookplate at={milestone} siteName={siteName} style={styles.stretch} /> : null}
        {badgeCelebration}
        <View style={styles.gains}>
          <Gain mark={`+${newSpecies.length}`} text={newSpecies.length === 1 ? 'A new resident swims to your island' : `${newSpecies.length} new residents swim to your island`} />
          {dive?.written ? <Gain mark="No." text={`Entry ${formatDiveNumber(dive.number)} written in your logbook`} /> : null}
          {count > newSpecies.length ? <Gain mark={`${count}`} text={`${count} sightings saved at ${siteName}`} /> : null}
        </View>
      </ScrollView>
      <SavedFooter
        twilight
        primary={<OceanButton title="Visit my home" variant="log" icon="home" onPress={() => router.dismissTo('/(tabs)')} style={styles.stretch} />}
        page={openPage ? { title: dive?.written ? 'Open the page' : 'Back to the page', onPress: openPage } : undefined}
        onSign={askToSign}
        onLogMore={onLogMore}
      />
    </View>
  );
}

/**
 * What to do next, pinned under the saved page: the main way on, then the page itself, then the
 * quieter ones side by side.
 */
function SavedFooter({
  twilight = false,
  primary,
  page,
  onSign,
  onLogMore,
}: {
  twilight?: boolean;
  primary: ReactNode;
  page?: { title: string; onPress: () => void };
  onSign?: () => void;
  onLogMore?: () => void;
}) {
  return (
    <BottomBar tone={twilight ? 'twilight' : 'page'} maxWidth={440}>
      {primary}
      {page ? <OceanButton title={page.title} variant="secondary" icon="logbook" onPress={page.onPress} style={styles.stretch} /> : null}
      {onSign || onLogMore ? (
        <View style={styles.quietRow}>
          {onSign ? <QuietLink title="Ask your buddy to sign" onPress={onSign} twilight={twilight} /> : null}
          {onLogMore ? <QuietLink title="Log another dive" onPress={onLogMore} twilight={twilight} /> : null}
        </View>
      ) : null}
    </BottomBar>
  );
}

/** A text-only action: lagoon ink on paper, white on the twilight page (where lagoon is too dim to read). */
function QuietLink({ title, onPress, twilight }: { title: string; onPress: () => void; twilight: boolean }) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.quietLink, { opacity: pressed ? 0.6 : 1 }]}>
      <Text style={[styles.quietText, { color: twilight ? ON_TWILIGHT.text : theme.tint }]}>{title}</Text>
    </Pressable>
  );
}

/** "Two", "Three"… for a small count at the start of a sentence. */
function countWord(n: number): string {
  return ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six'][n] ?? String(n);
}

function Gain({ mark, text }: { mark: string; text: string }) {
  const theme = useTheme();
  return (
    <View style={styles.gain}>
      {/* Navy ink on turquoise, the same in both schemes (7:1). */}
      <View style={[styles.gainMark, { backgroundColor: theme.turquoise }]}>
        <Text style={[styles.gainMarkText, { color: '#1D2B45' }]}>{mark}</Text>
      </View>
      <Text style={[styles.gainText, { color: ON_TWILIGHT.text }]}>{text}</Text>
    </View>
  );
}

/**
 * The new species' field-guide card. It arrives face down and turns over by itself; tap to turn it
 * again. Under Reduce Motion it is simply face up.
 */
function FlipCard({ species, dexNumber }: { species: Species; dexNumber: number }) {
  const theme = useTheme();
  const scheme = useSchemeName();
  const reduced = useReducedMotion();
  const [faceUp, setFaceUp] = useState(true);
  const angle = useSharedValue(reduced ? 0 : 180);
  useEffect(() => {
    if (!reduced) angle.set(withDelay(450, withTiming(0, { duration: 750 })));
  }, [angle, reduced]);
  const flip = () => {
    const next = !faceUp;
    setFaceUp(next);
    angle.set(reduced ? (next ? 0 : 180) : withTiming(next ? 0 : 180, { duration: 650 }));
  };
  const front = useAnimatedStyle(() => ({ transform: [{ perspective: 1100 }, { rotateY: `${angle.get()}deg` }] }));
  const back = useAnimatedStyle(() => ({ transform: [{ perspective: 1100 }, { rotateY: `${angle.get() + 180}deg` }] }));
  const { wash } = artFor(species);
  const label = faceUp
    ? `${species.commonName}, ${species.scientificName}, ${species.rarity}. First record, entry ${dexNumber} in your field guide. Tap to turn the card over.`
    : 'The card is face down. Tap to turn it over.';
  return (
    <Pressable onPress={flip} accessibilityRole="button" accessibilityLabel={label} style={styles.flip}>
      <Animated.View style={[styles.face, { backgroundColor: theme.backgroundElement, boxShadow: '0px 18px 40px -14px rgba(0, 0, 0, 0.5)' }, front]}>
        <View style={[styles.plate, { backgroundColor: `${wash}33`, borderBottomColor: theme.cardBorder }]}>
          <SpeciesArt species={species} width={220} paper={theme.backgroundElement} />
          <View style={styles.plateTag}>
            <RarityChip rarity={species.rarity} small />
          </View>
          <Stamp lines={['First record']} animate={!reduced} delay={1150} rotate={9} style={styles.plateStamp} />
          <NewBadge style={styles.plateBadge} />
        </View>
        <View style={styles.faceText}>
          <ThemedText style={styles.faceName} numberOfLines={2}>
            {species.commonName}
          </ThemedText>
          <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
            {species.scientificName}
          </ThemedText>
          <ThemedText type="small" numberOfLines={4} style={{ marginTop: 6 }}>
            {species.blurb}
          </ThemedText>
        </View>
        <View style={[styles.faceFoot, { borderTopColor: theme.rule }]}>
          <ThemedText type="label">Entry no. {dexNumber}</ThemedText>
          <ThemedText type="label">{CATEGORY_LABEL[species.category]}</ThemedText>
        </View>
      </Animated.View>
      <Animated.View style={[styles.face, styles.faceBack, { backgroundColor: theme.lagoon, boxShadow: '0px 18px 40px -14px rgba(0, 0, 0, 0.5)' }, back]}>
        <View style={[styles.backRing, { borderColor: theme.sun }]}>
          <View style={[styles.backRingInner, { borderColor: theme.sun }]}>
            <Icon name="fieldGuide" size={56} color={OnFill[scheme].lagoon} wash={theme.sun} washOpacity={0.7} />
          </View>
        </View>
        <Text style={[styles.backTitle, { color: OnFill[scheme].lagoon }]}>ScubaGo field guide</Text>
        <Text style={[styles.backHint, { color: OnFill[scheme].lagoon }]}>Tap to turn over</Text>
      </Animated.View>
    </Pressable>
  );
}

const BUBBLES = [
  { left: '8%', size: 14, delay: 0 },
  { left: '18%', size: 8, delay: -3000 },
  { left: '84%', size: 12, delay: -1500 },
  { left: '76%', size: 6, delay: -5000 },
  { left: '90%', size: 9, delay: -7000 },
  { left: '12%', size: 10, delay: -6000 },
] as const;

/** Bubbles rising slowly behind the card. Decorative; none under Reduce Motion. */
function Bubbles() {
  const reduced = useReducedMotion();
  if (reduced) return null;
  return (
    <View aria-hidden style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
      {BUBBLES.map((b) => (
        <Animated.View
          key={b.left}
          style={{
            position: 'absolute',
            left: b.left,
            bottom: -20,
            width: b.size,
            height: b.size,
            borderRadius: b.size / 2,
            borderWidth: 1.5,
            borderColor: 'rgba(255, 255, 255, 0.45)',
            animationName: {
              '0%': { transform: [{ translateY: 0 }], opacity: 0 },
              '10%': { opacity: 1 },
              '100%': { transform: [{ translateY: -900 }], opacity: 0 },
            },
            animationDuration: '9s',
            animationDelay: `${b.delay}ms`,
            animationIterationCount: 'infinite',
            animationTimingFunction: 'ease-in',
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  steps: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: 6,
    borderBottomWidth: 1,
  },
  stepWrap: { flexDirection: 'row', alignItems: 'center', flexShrink: 1, flexGrow: 1 },
  stepRule: { width: 14, height: 2, borderRadius: 1, marginHorizontal: 4 },
  step: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  stepDot: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  stepNumber: { fontFamily: Type.display, fontSize: 13, lineHeight: 16 },
  stepLabel: { fontSize: 14, lineHeight: 18, flexShrink: 1 },
  picker: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.three, gap: Spacing.two + 2 },
  pickerTop: { paddingTop: Spacing.three, paddingBottom: Spacing.two },
  groupLabel: { marginTop: Spacing.two },
  chipsScroll: { marginHorizontal: -Spacing.three, flexGrow: 0 },
  chips: { gap: Spacing.two, paddingVertical: 2, paddingHorizontal: Spacing.three },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: Radius.md,
    padding: 10,
    paddingRight: 12,
    minHeight: 64,
  },
  speciesRow: { borderWidth: 1.5 },
  rowIcon: { width: 40, height: 40, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontFamily: Type.bodyHeavy, fontSize: 15, lineHeight: 20 },
  scientific: { fontSize: 14, lineHeight: 19 },
  check: {
    width: 28,
    height: 28,
    borderRadius: Radius.xs,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  details: { padding: Spacing.three, gap: Spacing.four, paddingBottom: Spacing.four, width: '100%', maxWidth: 720, alignSelf: 'center' },
  sawCard: { gap: 4, paddingBottom: 8 },
  nameField: { gap: 6 },
  visibleTo: { minHeight: 36, justifyContent: 'center' },
  visibleToText: { fontFamily: Type.bodySemiBold, fontSize: 14, lineHeight: 19 },
  sawHeader: { gap: 2, marginBottom: 8 },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  iconButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  textButton: { alignSelf: 'flex-start', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 },
  changes: { flexDirection: 'row', flexWrap: 'wrap', columnGap: Spacing.four },
  notes: { minHeight: 104, textAlignVertical: 'top' },
  photoButtons: { flexDirection: 'row', gap: Spacing.two },
  photoPreview: { width: '100%', height: 220, borderRadius: Radius.md, borderWidth: 1 },
  warning: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three, padding: Spacing.four },
  savedScroll: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', width: '100%', padding: Spacing.three },
  savedCard: { width: '100%', maxWidth: 420, alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.four },
  dateNote: { marginTop: -Spacing.three },
  center: { textAlign: 'center' },
  stretch: { alignSelf: 'stretch' },
  quietRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: Spacing.three },
  quietLink: { flexGrow: 1, flexShrink: 1, flexBasis: 'auto', minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.two },
  quietText: { fontFamily: Type.bodyBold, fontSize: 15, lineHeight: 20, textAlign: 'center' },
  twilight: { flex: 1 },
  twilightContent: { padding: Spacing.three, paddingTop: Spacing.four, paddingBottom: Spacing.four, gap: 20, alignItems: 'center', width: '100%', maxWidth: 440, alignSelf: 'center' },
  twilightEyebrow: { fontFamily: Type.label, fontSize: 12, letterSpacing: 1.4, textAlign: 'center' },
  twilightTitle: { fontFamily: Type.display, fontSize: 32, lineHeight: 38, textAlign: 'center' },
  twilightSub: { fontFamily: Type.bodySemiBold, fontSize: 15, lineHeight: 20, textAlign: 'center' },
  flip: { width: 288, height: 380 },
  face: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: Radius.lg, overflow: 'hidden', backfaceVisibility: 'hidden' },
  faceBack: { alignItems: 'center', justifyContent: 'center', gap: 14 },
  plate: { height: 200, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 1 },
  plateTag: { position: 'absolute', top: 12, left: 12 },
  plateBadge: { position: 'absolute', top: 12, right: 12 },
  plateStamp: { position: 'absolute', right: 12, bottom: 12 },
  faceText: { padding: 16, gap: 2, flex: 1 },
  faceFoot: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, marginHorizontal: 16, paddingVertical: 10 },
  faceName: { fontFamily: Type.display, fontSize: 25, lineHeight: 30 },
  backRing: { width: 124, height: 124, borderRadius: 62, borderWidth: 1.5, padding: 5 },
  backRingInner: { flex: 1, borderRadius: 999, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  backTitle: { fontFamily: Type.display, fontSize: 22 },
  backHint: { fontFamily: Type.bodyBold, fontSize: 14, opacity: 0.85 },
  manyCard: { alignSelf: 'stretch', gap: Spacing.three, paddingVertical: Spacing.four },
  newGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: Spacing.three },
  newCell: { width: 92, alignItems: 'center', gap: 6 },
  newPlate: { width: 92, height: 72, borderRadius: Radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  gains: { alignSelf: 'stretch', gap: 8 },
  gain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: 'rgba(255, 255, 255, 0.14)',
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  gainMark: { minWidth: 34, height: 34, paddingHorizontal: 6, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  gainMarkText: { fontFamily: Type.display, fontSize: 15 },
  gainText: { flex: 1, fontFamily: Type.bodySemiBold, fontSize: 14, lineHeight: 19 },
});
