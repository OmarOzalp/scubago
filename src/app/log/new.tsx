import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { DateField } from '@/components/date-field';
import { FormField } from '@/components/form-field';
import { OceanButton } from '@/components/ocean-button';
import { RarityChip } from '@/components/rarity-chip';
import { SpeciesAvatar } from '@/components/species-avatar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Ocean } from '@/constants/palette';
import { Spacing } from '@/constants/theme';
import { useSchemeName, useTheme } from '@/hooks/use-theme';
import { announce } from '@/lib/announce';
import { CATALOG, CATALOG_BY_ID, UNLISTED_ID, UNLISTED_NAME_MAX, speciesForSighting } from '@/lib/catalog';
import { recentDiveDate, rememberDiveDate } from '@/lib/last-dive-date';
import { keepPhoto } from '@/lib/photo-files';
import { CATEGORY_LABEL, CATEGORY_ORDER, RARITY_TEXT } from '@/lib/rarity';
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
    const base = { siteId, sightedOn: date, notes: notes.trim() || undefined };
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

  return (
    <ThemedView style={styles.container}>
      {editing ? <Stack.Screen options={{ title: 'Edit sighting' }} /> : null}
      <View style={styles.breadcrumbs} accessibilityRole="tablist" accessibilityLabel="Steps">
        {crumbs.map((c, i) => (
          <View key={c.step} style={styles.crumbWrap}>
            {i > 0 ? (
              <ThemedText themeColor="textSecondary" importantForAccessibility="no" accessibilityElementsHidden>
                ›
              </ThemedText>
            ) : null}
            <Pressable
              onPress={() => c.enabled && goTo(c.step)}
              disabled={!c.enabled}
              accessibilityRole="tab"
              accessibilityLabel={`Step ${i + 1}, ${STEP_NAMES[c.step]}${c.label !== STEP_NAMES[c.step] ? `: ${c.label}` : ''}`}
              aria-selected={step === c.step}
              aria-disabled={!c.enabled}
              style={styles.crumb}>
              <ThemedText
                type="smallBold"
                themeColor={step === c.step || c.enabled ? 'text' : 'textSecondary'}
                numberOfLines={1}
                style={step === c.step && styles.crumbActive}>
                {c.label}
              </ThemedText>
            </Pressable>
          </View>
        ))}
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
          <View style={{ gap: Spacing.two }}>
            <ThemedText type="smallBold" accessibilityRole="header">
              {chosen.length === 1 ? 'What you saw' : `${chosen.length} species`} at {site.name}
            </ThemedText>
            {chosen.map((s) => (
              <View key={s.id} style={[styles.summary, { backgroundColor: theme.backgroundElement }]}>
                <SpeciesAvatar species={s} size={40} showRarityRing={s.id !== UNLISTED_ID} />
                <ThemedText type="smallBold" style={{ flex: 1 }} numberOfLines={2}>
                  {s.commonName}
                </ThemedText>
                {s.id !== UNLISTED_ID ? <RarityChip rarity={s.rarity} small /> : null}
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
                    style={styles.iconButton}>
                    <ThemedText type="smallBold" themeColor="textSecondary">
                      ✕
                    </ThemedText>
                  </Pressable>
                ) : null}
              </View>
            ))}
            {multi ? (
              <Pressable onPress={() => goTo('species')} accessibilityRole="button" style={styles.textButton}>
                <ThemedText type="smallBold" themeColor="tint">
                  ＋ Add another species
                </ThemedText>
              </Pressable>
            ) : null}
          </View>

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

          <DateField
            value={date}
            onChange={(iso) => {
              setDate(iso);
              setDateTouched(true);
            }}
          />
          {!dateTouched && date !== localIsoDate(new Date()) ? (
            <ThemedText type="small" themeColor="textSecondary">
              Same date as your last log.
            </ThemedText>
          ) : null}

          <FormField
            label={chosen.length > 1 ? 'Notes (optional, added to each sighting)' : 'Notes (optional)'}
            placeholder="Came up to check us out at the safety stop…"
            value={notes}
            onChangeText={setNotes}
            multiline
            style={styles.notes}
          />

          {chosen.length === 1 ? (
            <View style={{ gap: Spacing.one }}>
              <ThemedText type="smallBold" accessibilityRole="header">
                Photo (optional)
              </ThemedText>
              {photoUri ? (
                <>
                  <Image
                    source={{ uri: photoUri }}
                    style={styles.photoPreview}
                    contentFit="cover"
                    accessibilityLabel={`Your photo of the ${chosen[0].commonName}`}
                  />
                  <Pressable onPress={() => setPhotoUri(undefined)} accessibilityRole="button" style={styles.textButton}>
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
                    <OceanButton title="Take photo" variant="secondary" onPress={() => pickPhoto('camera')} style={{ flex: 1 }} />
                    <OceanButton title="Choose photo" variant="secondary" onPress={() => pickPhoto('library')} style={{ flex: 1 }} />
                  </View>
                </>
              )}
            </View>
          ) : (
            <ThemedText type="small" themeColor="textSecondary">
              Photos go with one sighting each: add one afterwards from the sighting in My Log.
            </ThemedText>
          )}

          {losesVerification ? (
            <ThemedText type="small" themeColor="textSecondary">
              Changing the species, site or date removes this sighting’s verification. It can be confirmed again
              afterwards.
            </ThemedText>
          ) : null}
          {backendEnabled ? (
            <ThemedText type="small" themeColor="textSecondary">
              Sightings are shared with other ScubaGo divers once they sync, including notes and photos.
            </ThemedText>
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
          <ThemedText type="smallBold" themeColor="textSecondary" accessibilityRole="header">
            Recent
          </ThemedText>
          {recent.map((s) => (
            <SiteRow key={`recent-${s.id}`} site={s} userId={userId} onPress={() => onPick(s)} />
          ))}
          <ThemedText type="smallBold" themeColor="textSecondary" accessibilityRole="header">
            All sites
          </ThemedText>
        </>
      ) : null}
      {listed.map((s) => (
        <SiteRow key={s.id} site={s} userId={userId} onPress={() => onPick(s)} />
      ))}
      {searching && listed.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary" accessibilityLiveRegion="polite">
          No site matches “{query.trim()}”.
        </ThemedText>
      ) : null}
      <OceanButton
        title="Can’t find it? Add a dive site"
        variant="secondary"
        onPress={() => router.push({ pathname: '/add-site', params: { then: 'log', name: query.trim() } })}
      />
    </ScrollView>
  );
}

function SiteRow({ site, userId, onPress }: { site: DiveSite; userId: string | undefined; onPress: () => void }) {
  const theme = useTheme();
  const addedBy = siteAddedBy(site, userId);
  const where = `${site.region}, ${site.country}${addedBy ? ` · added by ${addedBy}` : ''}`;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${site.name}, ${where}`}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement }]}>
      <View style={{ flex: 1 }}>
        <ThemedText type="smallBold" numberOfLines={2}>
          {site.name}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
          {where}
        </ThemedText>
      </View>
    </Pressable>
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
      <View style={styles.picker}>
        <FormField
          label={multi ? 'What did you see? Tick everything' : 'What did you see?'}
          value={query}
          onChangeText={setQuery}
          placeholder="Search: manta, nudibranch, turtle…"
          autoCorrect={false}
          returnKeyType="search"
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} accessibilityLabel="Filter by group">
          {CATEGORY_ORDER.map((cat) => {
            const on = category === cat;
            return (
              <Pressable
                key={cat}
                onPress={() => setCategory(on ? null : cat)}
                accessibilityRole="button"
                accessibilityLabel={`${CATEGORY_LABEL[cat]} only`}
                aria-selected={on}
                style={[
                  styles.chip,
                  { backgroundColor: on ? theme.backgroundSelected : theme.backgroundElement, borderColor: on ? theme.text : 'transparent' },
                ]}>
                <ThemedText type={on ? 'smallBold' : 'small'}>{CATEGORY_LABEL[cat]}</ThemedText>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      <ScrollView contentContainerStyle={[styles.picker, multi && { paddingBottom: 96 }]} keyboardShouldPersistTaps="handled">
        {likely.length > 0 ? (
          <>
            <ThemedText type="smallBold" themeColor="textSecondary" accessibilityRole="header">
              Often seen at {site!.name}
            </ThemedText>
            {likely.map(renderRow)}
          </>
        ) : null}
        {recent.length > 0 ? (
          <>
            <ThemedText type="smallBold" themeColor="textSecondary" accessibilityRole="header">
              You’ve logged recently
            </ThemedText>
            {recent.map(renderRow)}
          </>
        ) : null}
        {likely.length > 0 || recent.length > 0 ? (
          <ThemedText type="smallBold" themeColor="textSecondary" accessibilityRole="header">
            All species
          </ThemedText>
        ) : null}
        {rest.map(renderRow)}
        {searching && rest.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary" accessibilityLiveRegion="polite">
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
        <View style={[styles.doneBar, { backgroundColor: theme.background, borderTopColor: theme.backgroundSelected }]}>
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
        {
          backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement,
          borderColor: checked ? Ocean.primary : 'transparent',
        },
      ]}>
      <SpeciesAvatar species={species} size={44} showRarityRing={!unlisted} />
      <View style={{ flex: 1 }}>
        <ThemedText type="smallBold" numberOfLines={2}>
          {name}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={2} style={!unlisted && styles.scientific}>
          {detail}
        </ThemedText>
      </View>
      {!unlisted ? <RarityChip rarity={species.rarity} small /> : null}
      {multi ? (
        <View
          style={[styles.check, { borderColor: checked ? Ocean.primary : theme.textSecondary, backgroundColor: checked ? Ocean.primary : 'transparent' }]}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden>
          {checked ? <ThemedText style={styles.checkMark}>✓</ThemedText> : null}
        </View>
      ) : null}
    </Pressable>
  );
}

function Saved({ result, onLogMore }: { result: Result; onLogMore?: () => void }) {
  const scheme = useSchemeName();
  const { newSpecies, count, siteName } = result;
  const first = newSpecies[0];
  return (
    <ThemedView style={styles.centered}>
      {newSpecies.length > 0 ? (
        <>
          <ThemedText style={styles.party} importantForAccessibility="no" accessibilityElementsHidden>
            🎉
          </ThemedText>
          <ThemedText type="subtitle" accessibilityRole="header" style={[styles.savedTitle, newSpecies.length === 1 && { color: RARITY_TEXT[scheme][first.rarity] }]}>
            {newSpecies.length === 1 ? 'New species!' : `${newSpecies.length} new species!`}
          </ThemedText>
          {newSpecies.length === 1 ? (
            <>
              <SpeciesAvatar species={first} size={140} showRarityRing />
              <ThemedText type="smallBold" style={styles.savedName}>
                {first.commonName}
              </ThemedText>
              <RarityChip rarity={first.rarity} />
              <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
                #{result.dexNumber} in your collection · A new resident for your home
              </ThemedText>
            </>
          ) : (
            <View style={styles.newGrid}>
              {newSpecies.slice(0, 9).map((s) => (
                <View key={s.id} style={styles.newCell}>
                  <SpeciesAvatar species={s} size={64} showRarityRing />
                  <ThemedText type="small" style={styles.center} numberOfLines={2}>
                    {s.commonName}
                  </ThemedText>
                </View>
              ))}
            </View>
          )}
          {count > newSpecies.length ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
              {count} sightings saved at {siteName}.
            </ThemedText>
          ) : null}
          <OceanButton title="Visit my home" onPress={() => router.dismissTo('/(tabs)')} style={styles.stretch} />
        </>
      ) : (
        <>
          <ThemedText style={styles.party} importantForAccessibility="no" accessibilityElementsHidden>
            ✅
          </ThemedText>
          <ThemedText type="subtitle" accessibilityRole="header" style={styles.savedTitle}>
            Saved
          </ThemedText>
          <ThemedText style={styles.center}>
            {count === 1 ? 'Your sighting is' : `${count} sightings are`} in your log, at {siteName}.
          </ThemedText>
          <OceanButton title="Done" onPress={() => router.back()} style={styles.stretch} />
        </>
      )}
      {onLogMore ? (
        <OceanButton title={`Log more at ${siteName}`} variant="secondary" onPress={onLogMore} style={styles.stretch} />
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  breadcrumbs: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    gap: Spacing.one,
  },
  crumbWrap: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, flexShrink: 1 },
  crumb: { minHeight: 44, justifyContent: 'center', flexShrink: 1, paddingHorizontal: 2 },
  crumbActive: { textDecorationLine: 'underline' },
  picker: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.three, gap: Spacing.two },
  chips: { gap: Spacing.one + 2, paddingVertical: 2 },
  chip: {
    borderRadius: 999,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    minHeight: 44,
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
    borderRadius: 12,
    borderWidth: 2,
    padding: Spacing.two + 2,
    minHeight: 56,
  },
  scientific: { fontStyle: 'italic' },
  check: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: { color: Ocean.onPrimary, fontWeight: '700', fontSize: 16, lineHeight: 20 },
  doneBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  details: { padding: Spacing.three, gap: Spacing.four, paddingBottom: Spacing.six },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
    borderRadius: 14,
    padding: Spacing.two,
  },
  iconButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  textButton: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  notes: { minHeight: 96, textAlignVertical: 'top' },
  photoButtons: { flexDirection: 'row', gap: Spacing.two },
  photoPreview: { width: '100%', height: 200, borderRadius: 12 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three, padding: Spacing.five },
  party: { fontSize: 32, lineHeight: 40 },
  savedTitle: { textAlign: 'center', fontSize: 28, lineHeight: 36 },
  savedName: { fontSize: 20, lineHeight: 28, textAlign: 'center' },
  center: { textAlign: 'center' },
  stretch: { alignSelf: 'stretch' },
  newGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: Spacing.three },
  newCell: { width: 88, alignItems: 'center', gap: Spacing.one },
});
