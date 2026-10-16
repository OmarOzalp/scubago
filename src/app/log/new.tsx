import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { DateField } from '@/components/date-field';
import { FormField } from '@/components/form-field';
import { Icon } from '@/components/icon';
import { Chip } from '@/components/journal/chip';
import { Paper, PaperButton } from '@/components/journal/paper';
import { NewBadge, Stamp } from '@/components/journal/stamp';
import { OceanButton } from '@/components/ocean-button';
import { PrivacyFields } from '@/components/privacy-fields';
import { RarityChip } from '@/components/rarity-chip';
import { SpeciesArt } from '@/components/species-art';
import { SpeciesAvatar } from '@/components/species-avatar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { OnFill, Radius, Shadow, Spacing, Type } from '@/constants/theme';
import { usePhotoUrl } from '@/hooks/use-photo-url';
import { useSchemeName, useTheme } from '@/hooks/use-theme';
import { announce } from '@/lib/announce';
import { CATALOG, CATALOG_BY_ID, UNLISTED_ID, UNLISTED_NAME_MAX, speciesForSighting } from '@/lib/catalog';
import { recentDiveDate, rememberDiveDate } from '@/lib/last-dive-date';
import { keepPhoto } from '@/lib/photo-files';
import { DEFAULT_PRIVACY, lastPrivacyChoice, rememberPrivacyChoice, type PrivacySettings } from '@/lib/privacy-choice';
import { CATEGORY_LABEL, CATEGORY_ORDER } from '@/lib/rarity';
import { artFor } from '@/lib/species-art';
import { canEditSighting, isMaterialChange, localIsoDate } from '@/lib/sighting-edit';
import { siteAddedBy } from '@/lib/site-details';
import { onSiteAdded } from '@/lib/site-added';
import { useAllSites, useAppStore, useMySightings, useMyUserId } from '@/lib/store';
import { searchSites, searchSpecies } from '@/lib/text-search';
import type { Category, DiveSite, Species } from '@/lib/types';
import { statusOf } from '@/lib/verification';

type Step = 'site' | 'species' | 'details';
type Result = { count: number; siteName: string; newSpecies: Species[]; dexNumber: number };

const STEP_NAMES: Record<Step, string> = { site: 'Site', species: 'Species', details: 'Details' };
const STEP_ORDER: Step[] = ['site', 'species', 'details'];

/**
 * Log what you saw on a dive: pick the site, tick every species you saw, then the date and notes,
 * and save them all at once. Editing (`?edit=<id>`) goes through the same steps for one sighting.
 */
export default function LogSightingScreen() {
  const params = useLocalSearchParams<{ siteId?: string; speciesId?: string; edit?: string }>();
  const theme = useTheme();
  const scheme = useSchemeName();
  const sites = useAllSites();
  const mySightings = useMySightings();
  const myUserId = useMyUserId();
  const userId = useAppStore((s) => s.user?.id);
  const backendEnabled = useAppStore((s) => s.backendEnabled);
  const addSightings = useAppStore((s) => s.addSightings);
  const updateSighting = useAppStore((s) => s.updateSighting);
  const editing = useAppStore((s) => (params.edit ? s.sightings.find((x) => x.id === params.edit) : undefined));
  const multi = !editing;

  const [siteId, setSiteId] = useState<string | null>(editing?.siteId ?? params.siteId ?? null);
  const [selected, setSelected] = useState<string[]>(
    editing ? [editing.speciesId] : params.speciesId ? [params.speciesId] : [],
  );
  const [customName, setCustomName] = useState(editing?.customName ?? '');
  const [step, setStep] = useState<Step>(
    editing ? 'details' : params.siteId ? (params.speciesId ? 'details' : 'species') : 'site',
  );
  const [date, setDate] = useState(editing?.sightedOn ?? localIsoDate(new Date()));
  const [dateTouched, setDateTouched] = useState(!!editing);
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [photoUri, setPhotoUri] = useState<string | undefined>(editing?.photoUri);
  const photoPreview = usePhotoUrl(photoUri);
  // Who can see it: an edit starts from the sighting's own choice (one from before privacy was
  // shared, notes and photo included); a new log from the last one made.
  const [privacy, setPrivacy] = useState<PrivacySettings>(
    editing
      ? { visibility: editing.visibility ?? 'public', notesPrivate: !!editing.notesPrivate, photoPrivate: !!editing.photoPrivate }
      : DEFAULT_PRIVACY,
  );
  const [privacyTouched, setPrivacyTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  // Logging the rest of a trip: start from the date chosen last time, if that was recent.
  useEffect(() => {
    if (editing) return;
    let live = true;
    void recentDiveDate(localIsoDate(new Date())).then((iso) => {
      if (live && iso) setDate((current) => (current === localIsoDate(new Date()) ? iso : current));
    });
    return () => {
      live = false;
    };
  }, [editing]);

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

  // Back from "Add a dive site" with the new site: carry on to the species.
  useEffect(
    () =>
      onSiteAdded((id) => {
        setSiteId(id);
        setStep('species');
      }),
    [],
  );

  const site = siteId ? sites.find((s) => s.id === siteId) : null;
  const chosen = selected
    .map((id) => (id === UNLISTED_ID ? speciesForSighting({ speciesId: id, customName }) : CATALOG_BY_ID.get(id)))
    .filter((s): s is Species => !!s);

  const goTo = (next: Step) => {
    setStep(next);
    setError(null);
    announce(`Step ${STEP_ORDER.indexOf(next) + 1} of 3: ${next === 'site' ? 'choose the dive site' : next === 'species' ? 'choose what you saw' : 'date and notes'}`);
  };
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

  const save = async () => {
    if (!siteId || !site || chosen.length === 0 || saving) return;
    setSaving(true);
    setError(null);
    const base = { siteId, sightedOn: date, notes: notes.trim() || undefined, ...privacy };
    try {
      if (editing) {
        const speciesId = selected[0];
        const { isNewSpecies } = await updateSighting(editing.id, {
          ...base,
          speciesId,
          photoUri,
          customName: speciesId === UNLISTED_ID ? customName : undefined,
        });
        if (!isNewSpecies) {
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
      const inputs = selected.map((speciesId) => ({
        ...base,
        speciesId,
        // One photo shows one animal: only a single-species log carries it.
        photoUri: selected.length === 1 ? photoUri : undefined,
        customName: speciesId === UNLISTED_ID ? customName : undefined,
      }));
      const { newSpeciesIds } = await addSightings(inputs);
      void rememberDiveDate(date, localIsoDate(new Date()));
      void rememberPrivacyChoice(privacy);
      const owned = new Set(mySightings.map((s) => s.speciesId).filter((id) => id !== UNLISTED_ID));
      const outcome: Result = {
        count: inputs.length,
        siteName: site.name,
        newSpecies: newSpeciesIds.map((id) => CATALOG_BY_ID.get(id)!).filter(Boolean),
        dexNumber: owned.size + newSpeciesIds.length,
      };
      setResult(outcome);
      announce(
        outcome.newSpecies.length > 0
          ? `Saved. ${outcome.newSpecies.length === 1 ? 'A new species' : `${outcome.newSpecies.length} new species`} for your collection.`
          : `Saved ${outcome.count === 1 ? 'your sighting' : `${outcome.count} sightings`}.`,
      );
    } catch (e: any) {
      const message = e.message ?? 'Could not save';
      setError(message);
      announce(message);
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
    goTo('species');
  };

  if (result) {
    return <Saved result={result} onLogMore={editing ? undefined : logMore} />;
  }

  if (params.edit && (!editing || !canEditSighting(editing, myUserId))) {
    return (
      <ThemedView style={styles.centered}>
        <Stack.Screen options={{ title: 'Edit sighting' }} />
        <ThemedText>{editing ? 'You can only edit your own sightings.' : 'This sighting isn’t here any more.'}</ThemedText>
      </ThemedView>
    );
  }

  // Changing what was seen, where or when voids a confirmation (the server enforces it too).
  const losesVerification =
    !!editing &&
    statusOf(editing) !== 'unverified' &&
    !!siteId &&
    selected.length === 1 &&
    isMaterialChange(editing, { speciesId: selected[0], siteId, sightedOn: date, customName });

  const unlisted = selected.includes(UNLISTED_ID);
  const crumbs: { step: Step; label: string; enabled: boolean }[] = [
    { step: 'site', label: site ? site.name : 'Site', enabled: true },
    {
      step: 'species',
      label: chosen.length === 0 ? 'Species' : chosen.length === 1 ? chosen[0].commonName : `${chosen.length} species`,
      enabled: !!site,
    },
    { step: 'details', label: 'Details', enabled: !!site && chosen.length > 0 },
  ];

  const stepIndex = STEP_ORDER.indexOf(step);

  return (
    <ThemedView style={styles.container}>
      {/* Set in full: the new-species page turns the header twilight, and "Log more" comes back here. */}
      <Stack.Screen
        options={{
          title: editing ? 'Edit sighting' : 'Log a dive',
          headerStyle: { backgroundColor: theme.background },
          headerTintColor: theme.text,
          headerTitleStyle: { fontFamily: Type.display, fontSize: 19, color: theme.text },
        }}
      />
      {/* The three steps, numbered like the pages of a form: done ones ticked, the current one inked in. */}
      <View style={[styles.steps, { borderBottomColor: theme.rule }]} accessibilityRole="tablist" accessibilityLabel="Steps">
        {crumbs.map((c, i) => {
          const current = step === c.step;
          const done = i < stepIndex && c.enabled;
          return (
            <View key={c.step} style={styles.stepWrap}>
              {i > 0 ? <View style={[styles.stepRule, { backgroundColor: i <= stepIndex ? theme.lagoon : theme.rule }]} /> : null}
              <Pressable
                onPress={() => c.enabled && goTo(c.step)}
                disabled={!c.enabled}
                accessibilityRole="tab"
                accessibilityLabel={`Step ${i + 1}, ${STEP_NAMES[c.step]}${c.label !== STEP_NAMES[c.step] ? `: ${c.label}` : ''}`}
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
                  style={[styles.stepLabel, { color: current ? theme.text : c.enabled ? theme.text : theme.textSecondary, fontFamily: current ? Type.bodyHeavy : Type.bodyBold }]}>
                  {c.label}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>

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
          onToggle={toggleSpecies}
          onDone={() => goTo('details')}
        />
      )}
      {step === 'details' && site && chosen.length > 0 && (
        <ScrollView contentContainerStyle={styles.details} keyboardShouldPersistTaps="handled">
          <Paper style={styles.sawCard}>
            <View style={styles.sawHeader}>
              <ThemedText type="label">{editing ? 'Logbook entry' : 'New logbook entry'}</ThemedText>
              <ThemedText type="heading" accessibilityRole="header">
                {chosen.length === 1 ? 'What you saw' : `${chosen.length} species`} at {site.name}
              </ThemedText>
            </View>
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
                      if (left.length === 0) goTo('species');
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
                  Add another species
                </ThemedText>
              </Pressable>
            ) : null}
          </Paper>

          {unlisted ? (
            <FormField
              label="What was it?"
              hint="Not in our catalogue yet. It’s saved in your log but doesn’t count towards your collection."
              placeholder="e.g. Nudibranch I couldn’t identify"
              value={customName}
              onChangeText={setCustomName}
              maxLength={UNLISTED_NAME_MAX}
            />
          ) : null}

          <View style={{ gap: 6 }}>
            <DateField
              value={date}
              onChange={(iso) => {
                setDate(iso);
                setDateTouched(true);
              }}
            />
            {!dateTouched && date !== localIsoDate(new Date()) ? (
              <ThemedText type="caption" themeColor="textSecondary">
                Same date as your last log.
              </ThemedText>
            ) : null}
          </View>

          <FormField
            label={chosen.length > 1 ? 'Notes (optional, added to each sighting)' : 'Notes (optional)'}
            placeholder="Came up to check us out at the safety stop…"
            value={notes}
            onChangeText={setNotes}
            multiline
            style={styles.notes}
          />

          {chosen.length === 1 ? (
            <View style={{ gap: 6 }}>
              <ThemedText type="label" accessibilityRole="header">
                Photo (optional)
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
          ) : (
            <ThemedText type="caption" themeColor="textSecondary">
              Photos go with one sighting each: add one afterwards from the sighting in your logbook.
            </ThemedText>
          )}

          {losesVerification ? (
            <Paper tone="sand" style={styles.warning}>
              <Icon name="warning" size={20} wash={theme.sun} />
              <ThemedText type="small" style={{ flex: 1 }}>
                Changing the species, site or date removes this sighting’s verification. It can be confirmed again
                afterwards.
              </ThemedText>
            </Paper>
          ) : null}
          {/* Without a backend nothing leaves the phone, so there is nobody to keep it from. */}
          {backendEnabled ? (
            <PrivacyFields
              value={privacy}
              onChange={(next) => {
                setPrivacy(next);
                setPrivacyTouched(true);
              }}
              photo={chosen.length === 1}
              count={chosen.length}
            />
          ) : null}
          {error ? (
            <ThemedText type="small" themeColor="danger" accessibilityLiveRegion="polite">
              {error}
            </ThemedText>
          ) : null}
          <OceanButton
            title={
              saving ? 'Saving…' : editing ? 'Save changes' : chosen.length > 1 ? `Log ${chosen.length} sightings` : 'Log it'
            }
            variant={editing ? 'primary' : 'log'}
            icon={editing || saving ? undefined : 'stamp'}
            onPress={save}
            disabled={saving || (unlisted && !customName.trim())}
          />
        </ScrollView>
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

function SitePicker({
  sites,
  recentSiteIds,
  userId,
  onPick,
}: {
  sites: DiveSite[];
  recentSiteIds: string[];
  userId: string | undefined;
  onPick: (site: DiveSite) => void;
}) {
  const [query, setQuery] = useState('');
  const searching = query.trim().length > 0;

  const recent = recentSiteIds.map((id) => sites.find((s) => s.id === id)).filter((s): s is DiveSite => !!s);
  const listed = useMemo(
    () => (searching ? searchSites(sites, query) : [...sites].sort((a, b) => a.name.localeCompare(b.name))),
    [sites, query, searching],
  );

  return (
    <ScrollView contentContainerStyle={styles.picker} keyboardShouldPersistTaps="handled">
      <FormField
        label="Where did you dive?"
        value={query}
        onChangeText={setQuery}
        placeholder="Search sites, regions, countries…"
        autoCorrect={false}
        returnKeyType="search"
      />
      {!searching && recent.length > 0 ? (
        <>
          <ThemedText type="label" accessibilityRole="header" style={styles.groupLabel}>
            Recent
          </ThemedText>
          {recent.map((s) => (
            <SiteRow key={`recent-${s.id}`} site={s} userId={userId} recent onPress={() => onPick(s)} />
          ))}
          <ThemedText type="label" accessibilityRole="header" style={styles.groupLabel}>
            All sites
          </ThemedText>
        </>
      ) : null}
      {listed.map((s) => (
        <SiteRow key={s.id} site={s} userId={userId} onPress={() => onPick(s)} />
      ))}
      {searching && listed.length === 0 ? (
        <ThemedText type="caption" themeColor="textSecondary" accessibilityLiveRegion="polite">
          No site matches “{query.trim()}”.
        </ThemedText>
      ) : null}
      <OceanButton
        title="Can’t find it? Add a dive site"
        icon="addSite"
        variant="secondary"
        onPress={() => router.push({ pathname: '/add-site', params: { then: 'log', name: query.trim() } })}
        style={{ marginTop: Spacing.two }}
      />
    </ScrollView>
  );
}

function SiteRow({ site, userId, recent = false, onPress }: { site: DiveSite; userId: string | undefined; recent?: boolean; onPress: () => void }) {
  const theme = useTheme();
  const addedBy = siteAddedBy(site, userId);
  const where = `${site.region}, ${site.country}${addedBy ? ` · added by ${addedBy}` : ''}`;
  return (
    <PaperButton onPress={onPress} accessibilityLabel={`${site.name}, ${where}`} style={styles.row}>
      <View style={[styles.rowIcon, { backgroundColor: recent ? `${theme.wash}66` : theme.backgroundSelected }]}>
        <Icon name={recent ? 'clock' : 'pin'} size={20} />
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Text numberOfLines={2} style={[styles.rowTitle, { color: theme.text }]}>
          {site.name}
        </Text>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
          {where}
        </ThemedText>
      </View>
      <Icon name="chevronRight" size={16} color={theme.textSecondary} weight="bold" />
    </PaperButton>
  );
}

function SpeciesPicker({
  multi,
  selected,
  customName,
  site,
  recentIds,
  onToggle,
  onDone,
}: {
  multi: boolean;
  selected: string[];
  customName: string;
  site?: DiveSite;
  recentIds: string[];
  onToggle: (id: string, customName?: string) => void;
  onDone: () => void;
}) {
  const theme = useTheme();
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
    <View style={{ flex: 1 }}>
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
      <ScrollView contentContainerStyle={[styles.picker, multi && { paddingBottom: 104 }]} keyboardShouldPersistTaps="handled">
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
        <View style={[styles.doneBar, { backgroundColor: theme.background, borderTopColor: theme.rule }]}>
          <OceanButton
            title={count === 0 ? 'Tick what you saw' : `Next · ${count} ${count === 1 ? 'species' : 'species'}`}
            onPress={onDone}
            disabled={count === 0}
          />
        </View>
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
 * ordinary log gets a "Logged" stamp. Nothing moves under Reduce Motion.
 */
function Saved({ result, onLogMore }: { result: Result; onLogMore?: () => void }) {
  const theme = useTheme();
  const { newSpecies, count, siteName } = result;
  if (newSpecies.length === 0) {
    return (
      <ThemedView style={styles.centered}>
        <Paper raised style={styles.savedCard}>
          <Stamp lines={['Logged', siteName.toUpperCase().slice(0, 22)]} animate delay={150} rotate={-6} style={{ alignSelf: 'center' }} />
          <ThemedText type="display" accessibilityRole="header" style={styles.center}>
            Saved
          </ThemedText>
          <ThemedText style={styles.center} themeColor="textSecondary">
            {count === 1 ? 'Your sighting is' : `${count} sightings are`} in your log, at {siteName}.
          </ThemedText>
          <OceanButton title="Done" onPress={() => router.back()} style={styles.stretch} />
          {onLogMore ? (
            <OceanButton title={`Log more at ${siteName}`} variant="secondary" onPress={onLogMore} style={styles.stretch} />
          ) : null}
        </Paper>
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
          title: 'Logged',
        }}
      />
      <Bubbles />
      <ScrollView contentContainerStyle={styles.twilightContent}>
        <View style={{ alignItems: 'center', gap: 4 }}>
          <Text style={[styles.twilightEyebrow, { color: ON_TWILIGHT.soft }]}>
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
        <View style={styles.gains}>
          <Gain mark={`+${newSpecies.length}`} text={newSpecies.length === 1 ? 'A new resident swims to your island' : `${newSpecies.length} new residents swim to your island`} />
          {count > newSpecies.length ? <Gain mark={`${count}`} text={`${count} sightings saved at ${siteName}`} /> : null}
        </View>
        <OceanButton title="Visit my home" variant="log" icon="home" onPress={() => router.dismissTo('/(tabs)')} style={styles.stretch} />
        {onLogMore ? (
          <OceanButton title={`Log more at ${siteName}`} variant="secondary" onPress={onLogMore} style={styles.stretch} />
        ) : null}
      </ScrollView>
    </View>
  );
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
    <View pointerEvents="none" style={StyleSheet.absoluteFill} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
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
  doneBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: Spacing.three,
    borderTopWidth: 1,
  },
  details: { padding: Spacing.three, gap: Spacing.four, paddingBottom: Spacing.six, width: '100%', maxWidth: 720, alignSelf: 'center' },
  sawCard: { gap: 4, paddingBottom: 8 },
  sawHeader: { gap: 2, marginBottom: 8 },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  iconButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  textButton: { alignSelf: 'flex-start', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 },
  notes: { minHeight: 104, textAlignVertical: 'top' },
  photoButtons: { flexDirection: 'row', gap: Spacing.two },
  photoPreview: { width: '100%', height: 220, borderRadius: Radius.md, borderWidth: 1 },
  warning: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three, padding: Spacing.four },
  savedCard: { width: '100%', maxWidth: 420, alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.four },
  center: { textAlign: 'center' },
  stretch: { alignSelf: 'stretch' },
  twilight: { flex: 1 },
  twilightContent: { padding: Spacing.three, paddingTop: Spacing.four, paddingBottom: Spacing.six, gap: 20, alignItems: 'center', width: '100%', maxWidth: 440, alignSelf: 'center' },
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
