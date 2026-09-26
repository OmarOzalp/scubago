import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { OceanButton } from '@/components/ocean-button';
import { RarityChip } from '@/components/rarity-chip';
import { formatDate } from '@/components/sighting-row';
import { SpeciesAvatar } from '@/components/species-avatar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { CATALOG, CATALOG_BY_ID } from '@/lib/catalog';
import { CATEGORY_LABEL, CATEGORY_ORDER, RARITY_COLOR } from '@/lib/rarity';
import { useAllSites, useAppStore, useMySightings } from '@/lib/store';
import type { Category, DiveSite, Species } from '@/lib/types';

type Step = 'site' | 'species' | 'details';

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function LogSightingScreen() {
  const params = useLocalSearchParams<{ siteId?: string; speciesId?: string }>();
  const theme = useTheme();
  const sites = useAllSites();
  const mySightings = useMySightings();
  const addSighting = useAppStore((s) => s.addSighting);

  const [siteId, setSiteId] = useState<string | null>(params.siteId ?? null);
  const [speciesId, setSpeciesId] = useState<string | null>(params.speciesId ?? null);
  const [step, setStep] = useState<Step>(params.siteId ? (params.speciesId ? 'details' : 'species') : 'site');
  const [date, setDate] = useState(new Date());
  const [notes, setNotes] = useState('');
  const [photoUri, setPhotoUri] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [celebration, setCelebration] = useState<{ species: Species; dexNumber: number } | null>(
    null,
  );

  const site = siteId ? sites.find((s) => s.id === siteId) : null;
  const species = speciesId ? CATALOG_BY_ID.get(speciesId) : null;

  const pickSite = (s: DiveSite) => {
    setSiteId(s.id);
    setStep(speciesId ? 'details' : 'species');
  };
  const pickSpecies = (s: Species) => {
    setSpeciesId(s.id);
    setStep('details');
  };

  const shiftDate = (days: number) => {
    setDate((d) => {
      const next = new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
      return next > new Date() ? d : next;
    });
  };

  const attachPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) setPhotoUri(result.assets[0].uri);
  };

  const save = async () => {
    if (!siteId || !speciesId || !species || saving) return;
    setSaving(true);
    const speciesSeenBefore = new Set(mySightings.map((s) => s.speciesId)).size;
    const { isNewSpecies } = await addSighting({
      speciesId,
      siteId,
      sightedOn: toIsoDate(date),
      notes: notes.trim() || undefined,
      photoUri,
    });
    if (isNewSpecies) {
      setCelebration({ species, dexNumber: speciesSeenBefore + 1 });
    } else {
      router.back();
    }
  };

  if (celebration) {
    return <Celebration species={celebration.species} dexNumber={celebration.dexNumber} />;
  }

  return (
    <ThemedView style={styles.container}>
      {/* Progress summary of picks so far */}
      <View style={styles.breadcrumbs}>
        <Crumb
          label={site ? site.name : 'Site'}
          active={step === 'site'}
          done={!!site}
          onPress={() => setStep('site')}
        />
        <ThemedText themeColor="textSecondary">›</ThemedText>
        <Crumb
          label={species ? species.commonName : 'Species'}
          active={step === 'species'}
          done={!!species}
          onPress={() => site && setStep('species')}
        />
        <ThemedText themeColor="textSecondary">›</ThemedText>
        <Crumb label="Details" active={step === 'details'} done={false} onPress={() => site && species && setStep('details')} />
      </View>

      {step === 'site' && <SitePicker sites={sites} recentSiteIds={recentSiteIds(mySightings)} onPick={pickSite} />}
      {step === 'species' && <SpeciesPicker onPick={pickSpecies} />}
      {step === 'details' && site && species && (
        <ScrollView contentContainerStyle={styles.details} keyboardShouldPersistTaps="handled">
          <View style={[styles.summary, { backgroundColor: theme.backgroundElement }]}>
            <SpeciesAvatar species={species} size={52} showRarityRing />
            <View style={{ flex: 1 }}>
              <ThemedText type="smallBold">{species.commonName}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                at {site.name}
              </ThemedText>
            </View>
            <RarityChip rarity={species.rarity} small />
          </View>

          <View style={styles.dateRow}>
            <ThemedText type="smallBold">When</ThemedText>
            <View style={styles.dateControls}>
              <DateButton label="−1 day" onPress={() => shiftDate(-1)} />
              <ThemedText type="smallBold" style={styles.dateValue}>
                {formatDate(toIsoDate(date))}
              </ThemedText>
              <DateButton label="+1 day" onPress={() => shiftDate(1)} />
              <DateButton label="Today" onPress={() => setDate(new Date())} />
            </View>
          </View>

          <View style={{ gap: Spacing.one }}>
            <ThemedText type="smallBold">Notes (optional)</ThemedText>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Came up to check us out at the safety stop…"
              placeholderTextColor={theme.textSecondary}
              multiline
              style={[
                styles.notes,
                { backgroundColor: theme.backgroundElement, color: theme.text },
              ]}
            />
          </View>

          <View style={{ gap: Spacing.one }}>
            <ThemedText type="smallBold">Photo (optional)</ThemedText>
            <Pressable
              onPress={attachPhoto}
              style={[styles.photoButton, { backgroundColor: theme.backgroundElement }]}>
              {photoUri ? (
                <Image source={{ uri: photoUri }} style={styles.photoPreview} contentFit="cover" />
              ) : (
                <ThemedText type="small" themeColor="textSecondary">
                  📷 Add a photo — photo-backed sightings get a credibility badge
                </ThemedText>
              )}
            </Pressable>
          </View>

          <OceanButton title={saving ? 'Saving…' : 'Log it'} onPress={save} disabled={saving} />
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

function Crumb({
  label,
  active,
  done,
  onPress,
}: {
  label: string;
  active: boolean;
  done: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={{ flexShrink: 1 }}>
      <ThemedText
        type="smallBold"
        themeColor={active ? 'text' : done ? 'text' : 'textSecondary'}
        numberOfLines={1}
        style={active && styles.crumbActive}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

function DateButton({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[styles.dateButton, { backgroundColor: theme.backgroundElement }]}>
      <ThemedText type="small">{label}</ThemedText>
    </Pressable>
  );
}

function SitePicker({
  sites,
  recentSiteIds,
  onPick,
}: {
  sites: DiveSite[];
  recentSiteIds: string[];
  onPick: (site: DiveSite) => void;
}) {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();

  const recent = recentSiteIds
    .map((id) => sites.find((s) => s.id === id))
    .filter((s): s is DiveSite => !!s);

  const filtered = useMemo(() => {
    const list = q
      ? sites.filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            s.region.toLowerCase().includes(q) ||
            s.country.toLowerCase().includes(q),
        )
      : sites;
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [sites, q]);

  return (
    <ScrollView contentContainerStyle={styles.picker} keyboardShouldPersistTaps="handled">
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search sites, regions, countries…"
        placeholderTextColor={theme.textSecondary}
        style={[styles.search, { backgroundColor: theme.backgroundElement, color: theme.text }]}
      />
      {!q && recent.length > 0 ? (
        <>
          <ThemedText type="smallBold" themeColor="textSecondary">
            Recent
          </ThemedText>
          {recent.map((s) => (
            <SiteRow key={`recent-${s.id}`} site={s} onPress={() => onPick(s)} />
          ))}
          <ThemedText type="smallBold" themeColor="textSecondary">
            All sites
          </ThemedText>
        </>
      ) : null}
      {filtered.map((s) => (
        <SiteRow key={s.id} site={s} onPress={() => onPick(s)} />
      ))}
    </ScrollView>
  );
}

function SiteRow({ site, onPress }: { site: DiveSite; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement },
      ]}>
      <View style={{ flex: 1 }}>
        <ThemedText type="smallBold" numberOfLines={1}>
          {site.name}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {site.region}, {site.country}
          {site.source === 'user' ? ' · added by you' : ''}
        </ThemedText>
      </View>
    </Pressable>
  );
}

function SpeciesPicker({ onPick }: { onPick: (species: Species) => void }) {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category | null>(null);
  const q = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    let list = CATALOG;
    if (category) list = list.filter((s) => s.category === category);
    if (q)
      list = list.filter(
        (s) =>
          s.commonName.toLowerCase().includes(q) || s.scientificName.toLowerCase().includes(q),
      );
    return list;
  }, [q, category]);

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.picker}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="What did you see?"
          placeholderTextColor={theme.textSecondary}
          style={[styles.search, { backgroundColor: theme.backgroundElement, color: theme.text }]}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {CATEGORY_ORDER.map((cat) => {
            const selected = category === cat;
            return (
              <Pressable
                key={cat}
                onPress={() => setCategory(selected ? null : cat)}
                style={[
                  styles.chip,
                  { backgroundColor: selected ? theme.backgroundSelected : theme.backgroundElement },
                ]}>
                <ThemedText type="small">{CATEGORY_LABEL[cat]}</ThemedText>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      <ScrollView contentContainerStyle={styles.picker} keyboardShouldPersistTaps="handled">
        {filtered.map((s) => (
          <Pressable
            key={s.id}
            onPress={() => onPick(s)}
            style={({ pressed }) => [
              styles.row,
              { backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement },
            ]}>
            <SpeciesAvatar species={s} size={44} showRarityRing />
            <View style={{ flex: 1 }}>
              <ThemedText type="smallBold" numberOfLines={1}>
                {s.commonName}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                {s.scientificName}
              </ThemedText>
            </View>
            <RarityChip rarity={s.rarity} small />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function Celebration({ species, dexNumber }: { species: Species; dexNumber: number }) {
  return (
    <ThemedView style={styles.celebration}>
      <ThemedText style={{ fontSize: 20 }}>🎉</ThemedText>
      <ThemedText type="subtitle" style={{ color: RARITY_COLOR[species.rarity], textAlign: 'center' }}>
        New species!
      </ThemedText>
      <SpeciesAvatar species={species} size={140} showRarityRing />
      <ThemedText type="smallBold" style={{ fontSize: 20, textAlign: 'center' }}>
        {species.commonName}
      </ThemedText>
      <RarityChip rarity={species.rarity} />
      <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
        #{dexNumber} in your collection · A new resident for your home
      </ThemedText>
      <OceanButton title="Visit my home" onPress={() => router.dismissTo('/(tabs)')} style={{ alignSelf: 'stretch' }} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  breadcrumbs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
  },
  crumbActive: {
    textDecorationLine: 'underline',
  },
  picker: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.three,
    gap: Spacing.two,
  },
  search: {
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    height: 44,
    fontSize: 16,
  },
  chips: {
    gap: Spacing.one + 2,
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
    borderRadius: 12,
    padding: Spacing.two + 2,
  },
  details: {
    padding: Spacing.three,
    gap: Spacing.four,
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
    borderRadius: 14,
    padding: Spacing.two + 2,
  },
  dateRow: {
    gap: Spacing.one,
  },
  dateControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
  dateValue: {
    minWidth: 110,
    textAlign: 'center',
  },
  dateButton: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  notes: {
    borderRadius: 12,
    padding: Spacing.two + 2,
    minHeight: 80,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  photoButton: {
    borderRadius: 12,
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    padding: Spacing.two,
  },
  photoPreview: {
    width: '100%',
    height: 180,
    borderRadius: 8,
  },
  celebration: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.five,
  },
});
