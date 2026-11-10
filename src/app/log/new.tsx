import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type TextInputInstance, type ViewInstance } from 'react-native';

import { BottomBar } from '@/components/dive/bottom-bar';
import { DateField } from '@/components/date-field';
import { DiveForm } from '@/components/dive/dive-form';
import { HeaderBack } from '@/components/dive/header-back';
import { FieldLabel, FormField } from '@/components/form-field';
import { Icon } from '@/components/icon';
import { SavedReward, type LogResult } from '@/components/log/saved-reward';
import { SpeciesPicker } from '@/components/log/species-picker';
import { PrivacyFields } from '@/components/privacy-fields';
import { formatDate } from '@/components/sighting-row';
import { SitePicker } from '@/components/site-picker';
import { SpeciesAvatar } from '@/components/species-avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { IconButton } from '@/components/ui/icon-button';
import { ListRow } from '@/components/ui/list';
import { EmptyState, Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { WhenReady } from '@/components/when-ready';
import { Radius, Size, Space, TypeScale } from '@/constants/theme';
import { useDiscardGuard, useHardwareBack } from '@/hooks/use-discard-guard';
import { DISMISS_ON_DRAG, useKeyboard } from '@/hooks/use-keyboard';
import { useNewBadges } from '@/hooks/use-new-badges';
import { usePhotoUrl } from '@/hooks/use-photo-url';
import { useRewards } from '@/hooks/use-rewards';
import { useScrollTo } from '@/hooks/use-scroll-to';
import { useTheme } from '@/hooks/use-theme';
import { announce } from '@/lib/announce';
import { CATALOG_BY_ID, UNLISTED_ID, UNLISTED_NAME_MAX, speciesForSighting } from '@/lib/catalog';
import { carryOver, emptyDraft, fieldOfProblem, readDraft, type DiveDraft, type DraftField } from '@/lib/dive-draft';
import { formatDiveNumber, nextDiveNumber, sortDives } from '@/lib/dives';
import { recentDiveDate, rememberDiveDate } from '@/lib/last-dive-date';
import { leave } from '@/lib/leave';
import { keepPhoto } from '@/lib/photo-files';
import { DEFAULT_PRIVACY, lastPrivacyChoice, privacySummary, rememberPrivacyChoice, type PrivacySettings } from '@/lib/privacy-choice';
import { canEditSighting, isMaterialChange, localIsoDate, NOTES_MAX } from '@/lib/sighting-edit';
import { onSiteAdded } from '@/lib/site-added';
import { useAllSites, useAppStore, useMyDives, useMySightings, useMyUserId, useNextDiveNumber, useSiteById } from '@/lib/store';
import type { DiveSite, Species } from '@/lib/types';
import { statusOf } from '@/lib/verification';

type Step = 'site' | 'species' | 'details';
type Result = LogResult;

const STEP_NAMES: Record<Step, string> = { site: 'Site', species: 'Animals', details: 'Details' };
const STEP_ORDER: Step[] = ['site', 'species', 'details'];
const NAME_FIRST = 'Name the animal first';

/** A name cut to fit its step, at a space, with room for the other two: "Hin Daeng…". A single long word is cut at the end. */
function shortName(name: string, max = 14): string {
  const text = name.trim().replace(/\s+/g, ' ');
  if ([...text].length <= max) return text;
  let out = '';
  for (const word of text.split(' ')) {
    const next = out ? `${out} ${word}` : word;
    if ([...next].length > max) break;
    out = next;
  }
  // "Hin Daeng &" reads better as "Hin Daeng".
  out = out.replace(/[\s&,·–-]+$/, '');
  return out ? `${out}…` : `${[...text].slice(0, max - 1).join('').trimEnd()}…`;
}

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
 * Log a dive: pick the site, tick what you saw (or nothing), then fill in the page (its date, depth and
 * time, and under "More details" as much more as you like) and write it with its sightings. Two other
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
  // `then=page`: the page isn't underneath (this replaced its saved screen), so finishing opens it.
  const params = useLocalSearchParams<{ siteId?: string; speciesId?: string; edit?: string; dive?: string; then?: string }>();
  const theme = useTheme();
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
  const nameField = useRef<TextInputInstance>(null);
  const privacyField = useRef<ViewInstance>(null);
  const { scrollView, onScroll, scrollTo } = useScrollTo();
  const keyboard = useKeyboard();
  const [result, setResult] = useState<Result | null>(null);
  // "More details" of the dive's page, opened by "Who can see this" under the button.
  const [moreOpen, setMoreOpen] = useState(false);

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
    else leave('/');
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
          leave(`/sighting/${editing.id}`);
          return;
        }
        const others = mySightings.filter((s) => s.id !== editing.id);
        setResult({
          count: 1,
          siteName: site.name,
          animals: chosen,
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
          animals: chosen,
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
          animals: chosen,
          newSpecies: newSpeciesIds.map((id) => CATALOG_BY_ID.get(id)!).filter(Boolean),
          dexNumber: owned.size + newSpeciesIds.length,
          dive: { id: dive.id, number: dive.number, written: true },
        };
      }
      if (picks.length > 0) void rememberPrivacyChoice(privacy);
      setResult(outcome);
      announce(
        [
          outcome.dive?.written ? 'Dive saved.' : 'Saved.',
          outcome.newSpecies.length > 0
            ? `${outcome.newSpecies.length === 1 ? 'A new animal' : `${outcome.newSpecies.length} new animals`} in your field guide.`
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
    setMoreOpen(false);
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
    return <SavedReward result={result} onLogMore={newDive ? logMore : undefined} newBadges={newBadges} onBadgesSeen={markBadgesSeen} endOnPage={params.then === 'page'} />;
  }

  if (params.edit && (!editing || !canEditSighting(editing, myUserId))) {
    return (
      <Screen kind="modal">
        <Stack.Screen options={{ title: 'Edit sighting' }} />
        <EmptyState icon="logbook" title={editing ? 'You can only edit your own sightings.' : 'This sighting isn’t here any more.'} />
      </Screen>
    );
  }
  if (params.dive && !page) {
    return (
      <Screen kind="modal">
        <Stack.Screen options={{ title: 'Add to a page' }} />
        <EmptyState icon="logbook" title="This page isn’t in your log any more." />
      </Screen>
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
  const visibleTo = backendEnabled && chosen.length > 0 ? privacySummary(privacy, { photo: chosen.length === 1 }) : null;

  // What was seen, together: notes about the animals, a photo, who can see it. The dive's own notes stay with the dive.
  const animalBlock =
    chosen.length > 0 ? (
      <View style={styles.animals}>
        <FormField
          label={chosen.length === 1 ? 'Notes on the animal' : chosen.length === 2 ? 'Notes on both animals' : `Notes on all ${chosen.length} animals`}
          placeholder="Came up to check us out at the safety stop…"
          value={notes}
          onChangeText={setNotes}
          multiline
          maxLength={NOTES_MAX}
        />

        {chosen.length === 1 ? (
          <View style={styles.photo}>
            <FieldLabel header>Photo</FieldLabel>
            {photoUri ? (
              <>
                <Image source={photoPreview ? { uri: photoPreview } : undefined} style={[styles.photoPreview, { backgroundColor: theme.backgroundSelected }]} contentFit="cover" accessibilityLabel={`Your photo of the ${chosen[0].commonName}`} />
                <Button title="Remove photo" icon="trash" variant="plain" size="md" onPress={() => setPhotoUri(undefined)} style={styles.startAligned} />
              </>
            ) : (
              <>
                <Text style={[TypeScale.subhead, { color: theme.textSecondary }]}>Sightings with a photo get a credibility badge.</Text>
                <View style={styles.photoButtons}>
                  <Button title="Take photo" icon="camera" variant="secondary" size="md" onPress={() => pickPhoto('camera')} style={styles.flex} />
                  <Button title="Choose photo" icon="image" variant="secondary" size="md" onPress={() => pickPhoto('library')} style={styles.flex} />
                </View>
              </>
            )}
          </View>
        ) : (
          <Text style={[TypeScale.subhead, { color: theme.textSecondary }]}>Add photos later, one per sighting.</Text>
        )}

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
      </View>
    ) : null;

  // Several animals are one line of names and an Edit, not a row each: the card was a third of the screen.
  const together = multi && chosen.length > 1;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Set in full: the new-species page turns the header twilight, and "Log more" comes back here. */}
      <Stack.Screen
        options={{
          title: editing ? 'Edit sighting' : page ? `Add to ${formatDiveNumber(page.number)}` : 'Log a dive',
          headerStyle: { backgroundColor: theme.background },
          headerTintColor: theme.text,
          headerTitleStyle: { fontFamily: TypeScale.headline.fontFamily, fontSize: TypeScale.headline.fontSize, color: theme.text },
          // Back goes back a step, and leaves only from the first.
          headerLeft: ({ tintColor }) => <HeaderBack onPress={goBack} label={previousStep ? `Back to ${STEP_NAMES[previousStep].toLowerCase()}` : 'Close'} tintColor={tintColor} />,
        }}
      />
      {/* The three steps: a segment each, filled as far as the diver has come, with the step's name (or what was chosen in it) under it. Out of the way while typing (it is a sixth of a small phone with the keyboard up), and when editing one sighting, which has no steps to take. */}
      {!keyboard.open && !editing && (
        <View style={styles.steps} accessibilityRole="tablist" accessibilityLabel="Steps">
          {crumbs.map((c, i) => {
            const current = step === c.step;
            const done = i < stepIndex && (c.enabled || (c.step === 'site' && !!page));
            return (
              <Pressable
                key={c.step}
                onPress={() => c.enabled && goTo(c.step)}
                disabled={!c.enabled}
                accessibilityRole="tab"
                accessibilityLabel={`Step ${i + 1}, ${STEP_NAMES[c.step]}${c.chosen ? `: ${c.chosen}` : ''}`}
                aria-selected={current}
                aria-disabled={!c.enabled}
                style={({ pressed }) => [styles.step, { opacity: pressed ? 0.6 : 1 }]}>
                <View style={[styles.segment, { backgroundColor: i <= stepIndex ? theme.lagoon : theme.backgroundSelected }]} />
                <View style={styles.stepLabel}>
                  {done ? <Icon name="check" size={14} color={theme.tint} weight="bold" /> : null}
                  <Text numberOfLines={1} style={[current ? TypeScale.subheadStrong : TypeScale.subhead, styles.shrink, { color: current ? theme.text : c.enabled || done ? theme.text : theme.textSecondary }]}>
                    {c.chosen ? shortName(c.chosen) : STEP_NAMES[c.step]}
                  </Text>
                </View>
              </Pressable>
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
        <Screen
          kind="modal"
          scrollRef={scrollView}
          onScroll={onScroll}
          scrollEventThrottle={16}
          contentStyle={styles.details}
          keyboardDismissMode={DISMISS_ON_DRAG}
          automaticallyAdjustKeyboardInsets>
          <Card padded={false} style={styles.clip}>
            <View style={styles.sawHeader}>
              {/* A new entry needs no eyebrow: the title ("Log a dive") and the step ("Details") already say it. */}
              {editing || page ? <Text style={[TypeScale.footnoteStrong, { color: theme.textSecondary }]}>{editing ? 'Logbook entry' : formatDiveNumber(page!.number)}</Text> : null}
              <Text accessibilityRole="header" style={[TypeScale.headline, { color: theme.text }]}>
                {newDive ? `Dive at ${site.name}` : site.name}
              </Text>
              {page ? <Text style={[TypeScale.subhead, { color: theme.textSecondary }]}>{formatDate(page.divedOn)} · the page sets the site and date.</Text> : null}
              {chosen.length === 0 ? <Text style={[TypeScale.subhead, { color: theme.textSecondary }]}>No animals on this page yet. You can add them now or later.</Text> : null}
            </View>
            {together ? (
              <View style={[styles.names, { borderTopColor: theme.rule }]}>
                <Text style={[TypeScale.callout, styles.flex, { color: theme.text }]}>{chosen.map((s) => s.commonName).join(', ')}</Text>
                <Button title="Edit" icon="edit" variant="plain" size="md" accessibilityLabel={`Edit the ${chosen.length} animals`} onPress={() => goTo('species')} />
              </View>
            ) : null}
            {together
              ? null
              : chosen.map((s) => (
                  <ListRow
                    key={s.id}
                    title={s.commonName}
                    titleLines={2}
                    separator
                    inGroup
                    leading={<SpeciesAvatar species={s} size={Size.thumb} showRarityRing={false} />}
                    trailing={
                      multi ? (
                        <IconButton
                          icon="close"
                          on="bar"
                          accessibilityLabel={`Remove ${s.commonName}`}
                          onPress={() => {
                            const left = selected.filter((x) => x !== s.id);
                            setSelected(left);
                            if (left.length === 0 && !newDive) goTo('species');
                          }}
                        />
                      ) : (
                        'none'
                      )
                    }
                  />
                ))}
            {together ? null : multi ? (
              <ListRow separator inGroup leading="plus" title={chosen.length === 0 ? 'Add what you saw' : 'Add another species'} onPress={() => goTo('species')} />
            ) : (
              // An edit has no step bar: the animal, and the site if it isn't a page's, are changed from here.
              <>
                <ListRow separator inGroup leading="edit" title="Change the animal" onPress={() => goTo('species')} />
                {!page ? <ListRow separator inGroup leading="pin" title="Change the site" onPress={() => goTo('site')} /> : null}
              </>
            )}
          </Card>

          {unlisted ? (
            <FormField
              ref={nameField}
              label="What was it?"
              // The reason is under the field, so the hint gives way to it.
              hint={nameMissing ? undefined : 'Saved in your log. Doesn’t count towards your collection.'}
              placeholder="e.g. Nudibranch I couldn’t identify"
              value={customName}
              onChangeText={setCustomName}
              maxLength={UNLISTED_NAME_MAX}
              invalid={nameMissing}
            />
          ) : null}
          {nameMissing ? (
            <Text accessibilityLiveRegion="polite" style={[TypeScale.subhead, styles.nameProblem, { color: theme.danger }]}>
              {NAME_FIRST}
            </Text>
          ) : null}

          {!newDive && !page ? (
            <DateField
              value={date}
              onChange={(iso) => {
                setDate(iso);
                setDateTouched(true);
              }}
            />
          ) : null}

          {/* A new page puts the animals' notes, photo and privacy after the dive's own facts, inside the form; an edit has no dive facts, so they follow the card. */}
          {!newDive ? animalBlock : null}

          {losesVerification ? (
            <Notice icon="warning">Changing the species, site or date removes this sighting’s verification. It can be confirmed again afterwards.</Notice>
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
              takenBy={takenBy ? { number: takenBy.number, siteName: siteById(takenBy.siteId)?.name } : undefined}
              carried={start.from !== undefined ? { from: start.from, what: start.what } : undefined}
              afterNotes={animalBlock}
              quick
              open={moreOpen}
              onOpenChange={setMoreOpen}
            />
          ) : null}
          {newDive && !dateTouched && date !== localIsoDate(new Date()) ? (
            <Text style={[TypeScale.subhead, { color: theme.textSecondary }]}>Dated the same day as your last log.</Text>
          ) : null}
        </Screen>
      )}
      {/* Pinned, like the species step's: the button is never at the end of a long page. */}
      {showDetails && (
        <BottomBar keyboardOpen={keyboard.open}>
          {/* What the last choice was, in plain sight: nothing goes private or public by surprise. */}
          {visibleTo ? (
            <Pressable
              onPress={() => {
                // The choice is under "More details" on a new page: open it, then go there.
                setMoreOpen(true);
                setTimeout(() => scrollTo(privacyField.current, 24), 50);
                announce('Who can see this');
              }}
              accessibilityRole="button"
              accessibilityLabel={`Who can see this: ${visibleTo}. Change who can see this`}
              style={({ pressed }) => [styles.visibleTo, { opacity: pressed ? 0.6 : 1 }]}>
              <Text style={[TypeScale.subhead, { color: theme.textSecondary }]} numberOfLines={2}>
                Who can see this: <Text style={[TypeScale.subheadStrong, { color: theme.text }]}>{visibleTo}</Text>
                {' · '}
                <Text style={[TypeScale.subheadStrong, { color: theme.tint }]}>change</Text>
              </Text>
            </Pressable>
          ) : null}
          {error ? (
            <Text accessibilityLiveRegion="polite" style={[TypeScale.subhead, { color: theme.danger }]}>
              {error}
            </Text>
          ) : null}
          <Button
            title={saving ? 'Saving…' : editing ? 'Save changes' : newDive ? 'Save dive' : `Add to ${formatDiveNumber(page!.number)}`}
            variant={editing ? 'primary' : 'log'}
            icon={editing || saving ? undefined : 'stamp'}
            onPress={save}
            disabled={saving}
          />
        </BottomBar>
      )}
    </View>
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

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  clip: { overflow: 'hidden' },
  shrink: { flexShrink: 1 },
  startAligned: { alignSelf: 'flex-start' },
  // Three equal columns, each 44 to hit: the segment on top, the name under it.
  steps: { flexDirection: 'row', gap: Space.s2, paddingHorizontal: Space.s4, paddingTop: Space.s1 },
  step: { flex: 1, minHeight: Size.hit, gap: Space.s2, justifyContent: 'center' },
  segment: { height: 4, borderRadius: Radius.pill },
  stepLabel: { flexDirection: 'row', alignItems: 'center', gap: Space.s1 },
  // The pinned bar holds the button, so the page needs no room of its own at the foot.
  details: { paddingBottom: Space.s4 },
  sawHeader: { gap: Space.s1, padding: Space.s4 },
  names: { flexDirection: 'row', alignItems: 'center', gap: Space.s2, paddingLeft: Space.s4, paddingRight: Space.s2, borderTopWidth: StyleSheet.hairlineWidth },
  nameProblem: { marginTop: -Space.s2 },
  // A 44 pt strip to tap, the full width of the bar.
  visibleTo: { minHeight: Size.hit, justifyContent: 'center' },
  animals: { gap: Space.s4 },
  photo: { gap: Space.s2 },
  photoButtons: { flexDirection: 'row', gap: Space.s2 },
  photoPreview: { width: '100%', height: 220, borderRadius: Radius.md },
});
