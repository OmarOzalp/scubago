import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Bookplate, CentreStamp } from '@/components/dive/marks';
import { SignatureView } from '@/components/dive/signature';
import { Icon, type IconName } from '@/components/icon';
import { Ledger, type LedgerItem } from '@/components/journal/ledger';
import { Paper } from '@/components/journal/paper';
import { Screen, SectionHeader } from '@/components/journal/screen';
import { Wash } from '@/components/journal/wash';
import { OceanButton } from '@/components/ocean-button';
import { ShareDiveButton } from '@/components/share/share-buttons';
import { formatEntryDate, SightingRow } from '@/components/sighting-row';
import { SyncLine } from '@/components/sync-line';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { announce } from '@/lib/announce';
import { speciesForSighting } from '@/lib/catalog';
import { confirmAction } from '@/lib/confirm';
import { SIGNER_ROLE_LABEL } from '@/lib/dive-signature-api';
import {
  airConsumption,
  airUsed,
  CURRENTS,
  ENTRIES,
  formatDepth,
  formatDiveNumber,
  GASES,
  KINDS,
  labelOf,
  milestoneAt,
  neighbours,
  SUITS,
  SURFACES,
  TANK_MATERIALS,
  timeOut,
} from '@/lib/dives';
import { useAllSites, useAppStore, useMyDives, useMyUserId, useSiteById } from '@/lib/store';
import type { Dive, DiveSignature } from '@/lib/types';

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * A page of the diver's logbook: its number and site, the day and times, what they measured, the
 * conditions and gear, their notes, the animals they saw, and the signatures and stamp on it. The
 * buttons at the foot turn to the page before and after.
 */
export default function DivePageScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const sites = useAllSites();
  const siteById = useSiteById();
  const myUserId = useMyUserId();
  const dives = useMyDives();
  const dive = dives.find((d) => d.id === id);
  const allSightings = useAppStore((s) => s.sightings);
  const user = useAppStore((s) => s.user);
  const deleteDive = useAppStore((s) => s.deleteDive);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onPage = useMemo(
    () => allSightings.filter((s) => s.diveId === id && s.userId === myUserId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [allSightings, id, myUserId],
  );
  const turn = useMemo(() => (dive ? neighbours(dives, dive.id) : {}), [dives, dive]);

  if (!dive) {
    return (
      <View style={[styles.missing, { backgroundColor: theme.background }]}>
        <Stack.Screen options={{ title: '' }} />
        <View style={styles.missingArt}>
          <Wash width={112} height={78} color={theme.wash} seed={31} style={StyleSheet.absoluteFill} />
          <Icon name="logbook" size={40} />
        </View>
        <ThemedText type="heading" style={styles.center}>
          This page isn’t in your log.
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
          It may have been deleted, or it belongs to another diver.
        </ThemedText>
      </View>
    );
  }

  const site = siteById(dive.siteId);
  const siteName = site?.name ?? 'Unknown site';
  const milestone = milestoneAt(dive.number);
  const out = timeOut(dive);
  const times = dive.timeIn ? `${dive.timeIn}${out ? `–${out}` : ''}` : null;
  const measures = ([
    dive.maxDepthM !== undefined ? { value: trim(dive.maxDepthM), unit: 'm', label: 'Max depth', accessibilityLabel: `Maximum depth ${formatDepth(dive.maxDepthM)}` } : null,
    dive.bottomTimeMin !== undefined ? { value: String(dive.bottomTimeMin), unit: ' min', label: 'Bottom time' } : null,
    dive.waterTempC !== undefined ? { value: trim(dive.waterTempC), unit: '°C', label: 'Water' } : null,
    dive.visibilityM !== undefined ? { value: trim(dive.visibilityM), unit: 'm', label: 'Visibility', accessibilityLabel: `Visibility ${formatDepth(dive.visibilityM)}` } : null,
  ] as (LedgerItem | null)[]).filter((x): x is LedgerItem => !!x);
  const used = airUsed(dive);
  const sac = airConsumption(dive);
  const facts: { icon: IconName; label: string; value: string }[] = [
    dive.avgDepthM !== undefined ? { icon: 'depth', label: 'Average depth', value: formatDepth(dive.avgDepthM) } : null,
    dive.airTempC !== undefined ? { icon: 'thermometer', label: 'Air', value: `${trim(dive.airTempC)}°C` } : null,
    dive.current || dive.surface ? { icon: 'current', label: 'Water', value: [dive.current ? `${labelOf(CURRENTS, dive.current)} current` : null, dive.surface ? `${labelOf(SURFACES, dive.surface)} surface` : null].filter(Boolean).join(', ') } : null,
    dive.entry ? { icon: 'boat', label: 'Entry', value: labelOf(ENTRIES, dive.entry)! } : null,
    dive.kinds?.length ? { icon: 'waves', label: 'Kind of dive', value: dive.kinds.map((k) => labelOf(KINDS, k)).join(', ') } : null,
    dive.gas ? { icon: 'drop', label: 'Gas', value: `${labelOf(GASES, dive.gas)}${dive.o2Percent ? ` ${dive.o2Percent}%` : ''}` } : null,
    dive.tankL !== undefined || dive.tankMaterial
      ? { icon: 'tank', label: 'Tank', value: [dive.tankL !== undefined ? `${trim(dive.tankL)} litres` : null, dive.tankMaterial ? labelOf(TANK_MATERIALS, dive.tankMaterial)!.toLowerCase() : null].filter(Boolean).join(', ') }
      : null,
    dive.pressureStartBar !== undefined || dive.pressureEndBar !== undefined
      ? {
          icon: 'gauge',
          label: 'Air',
          value: [
            `${dive.pressureStartBar ?? '–'} → ${dive.pressureEndBar ?? '–'} bar`,
            used !== undefined ? `${used} bar used` : null,
            sac !== undefined ? `${sac} L/min at the surface` : null,
          ].filter(Boolean).join(' · '),
        }
      : null,
    dive.weightKg !== undefined ? { icon: 'weights', label: 'Weight', value: `${trim(dive.weightKg)} kg` } : null,
    dive.suit ? { icon: 'suit', label: 'Suit', value: labelOf(SUITS, dive.suit)! } : null,
    dive.buddyName ? { icon: 'buddies', label: 'Buddy', value: dive.buddyName } : null,
  ].filter((x): x is { icon: IconName; label: string; value: string } => !!x);

  const signatures: (DiveSignature & { here: boolean })[] = [
    ...(dive.signature ? [{ ...dive.signature, here: true }] : []),
    ...(dive.remoteSignatures ?? []).map((s) => ({ ...s, here: false })),
  ];
  const go = (to?: Dive) => to && router.replace(`/dive/${to.id}`);

  const remove = async () => {
    const ok = await confirmAction({
      title: `Delete ${formatDiveNumber(dive.number)}?`,
      message:
        onPage.length > 0
          ? `The page and the ${onPage.length === 1 ? 'sighting' : `${onPage.length} sightings`} on it will be removed from your log, your collection and community feeds. This can’t be undone.`
          : 'The page will be removed from your log. This can’t be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await deleteDive(dive.id);
      router.back();
    } catch (e: any) {
      const message = e.message ?? 'Could not delete this page';
      setError(message);
      announce(message);
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: formatDiveNumber(dive.number) }} />

      {/* The head of the page: the number in the margin, the site and the day beside it. */}
      <View style={styles.head} accessible accessibilityRole="header" accessibilityLabel={`Dive ${dive.number}, ${siteName}, ${formatEntryDate(dive.divedOn)}${times ? `, ${times}` : ''}`}>
        <View style={[styles.numberBox, { borderColor: theme.text }]}>
          <Text style={[styles.no, { color: theme.textSecondary }]}>NO.</Text>
          <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.number, { color: theme.text }]}>
            {dive.number.toLocaleString('en')}
          </Text>
        </View>
        <View style={styles.flex}>
          <ThemedText type="label">{formatEntryDate(dive.divedOn)}</ThemedText>
          <ThemedText type="heading">{siteName}</ThemedText>
          {times ? (
            <ThemedText type="small" themeColor="textSecondary">
              In {dive.timeIn}
              {out ? ` · out ${out}` : ''}
            </ThemedText>
          ) : null}
        </View>
      </View>
      {site ? (
        <Pressable onPress={() => router.push(`/site/${site.id}`)} accessibilityRole="link" style={styles.siteLink}>
          <Icon name="pin" size={16} color={theme.tint} />
          <ThemedText type="smallBold" themeColor="tint">
            {site.region}, {site.country} ›
          </ThemedText>
        </Pressable>
      ) : null}

      {milestone ? <Bookplate at={milestone} siteName={siteName} /> : null}

      {measures.length > 0 ? (
        <Ledger items={measures} />
      ) : (
        <Paper tone="sand" style={styles.row}>
          <Icon name="notes" size={20} wash={theme.sun} />
          <ThemedText type="small" style={styles.flex}>
            {dive.fromSightings
              ? 'This page was made from sightings you logged before the dive log. Add the depth, time and anything else you remember.'
              : 'No depth or time on this page yet.'}
          </ThemedText>
        </Paper>
      )}

      {facts.length > 0 || dive.rating ? (
        <Paper padded={false}>
          {facts.map((f, i) => (
            <View key={`${f.label}-${i}`} style={[styles.fact, i > 0 && { borderTopWidth: 1, borderTopColor: theme.rule }]}>
              <Icon name={f.icon} size={18} color={theme.textSecondary} wash={theme.textSecondary} washOpacity={0.2} />
              <ThemedText type="label" style={styles.factLabel}>
                {f.label}
              </ThemedText>
              <ThemedText type="smallBold" style={styles.factValue}>
                {f.value}
              </ThemedText>
            </View>
          ))}
          {dive.rating ? (
            <View style={[styles.fact, facts.length > 0 && { borderTopWidth: 1, borderTopColor: theme.rule }]} accessible accessibilityLabel={`Rating: ${dive.rating} of 5 stars`}>
              <Icon name="star" size={18} color={theme.textSecondary} wash={theme.textSecondary} washOpacity={0.2} />
              <ThemedText type="label" style={styles.factLabel}>
                Rating
              </ThemedText>
              <View style={styles.stars}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Icon key={n} name="star" size={18} color={n <= dive.rating! ? theme.text : theme.textSecondary} wash={n <= dive.rating! ? theme.sun : 'transparent'} washOpacity={n <= dive.rating! ? 1 : 0} weight={n <= dive.rating! ? 'duotone' : 'regular'} />
                ))}
              </View>
            </View>
          ) : null}
        </Paper>
      ) : null}

      {dive.notes ? (
        <Paper tone="sand">
          <ThemedText type="label" style={styles.notesLabel}>
            Notes
          </ThemedText>
          <ThemedText>{dive.notes}</ThemedText>
        </Paper>
      ) : null}

      <SectionHeader title="What you saw" eyebrow={onPage.length ? `${onPage.length} ${onPage.length === 1 ? 'sighting' : 'sightings'}` : undefined} />
      {onPage.map((s) => {
        const species = speciesForSighting(s);
        if (!species) return null;
        return <SightingRow key={s.id} sighting={s} species={species} site={site} pending={!!user && !s.synced} hideDate onPress={() => router.push(`/sighting/${s.id}`)} />;
      })}
      {onPage.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          Nothing logged on this dive yet.
        </ThemedText>
      ) : null}
      <OceanButton title="Add what you saw" icon="plus" variant="secondary" onPress={() => router.push({ pathname: '/log/new', params: { dive: dive.id } })} />

      <SectionHeader title="Signatures" />
      {/* Signatures and the centre's stamp sit side by side at the foot of the page, as on paper. */}
      <Paper style={styles.signed}>
        {signatures.length === 0 && !dive.centreName ? (
          <ThemedText type="small" themeColor="textSecondary">
            Not signed yet. Your buddy or guide can sign on your phone, or from theirs with a code.
          </ThemedText>
        ) : null}
        {signatures.map((s, i) => (
          <View key={`${s.name}-${s.at}`} style={[styles.signature, i > 0 && { borderTopWidth: 1, borderTopColor: theme.rule }]}>
            <SignatureView svg={s.svg} height={56} />
            <View style={[styles.signLine, { borderTopColor: theme.textSecondary }]}>
              <ThemedText type="smallBold">{s.name}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {s.role ? `${SIGNER_ROLE_LABEL[s.role]} · ` : ''}
                {s.here ? 'signed on your phone' : 'signed from their own account'} · {formatTimestamp(s.at)}
              </ThemedText>
            </View>
          </View>
        ))}
        {dive.centreName ? (
          <View style={styles.stampRow}>
            <CentreStamp name={dive.centreName} divedOn={dive.divedOn} number={dive.number} />
            <ThemedText type="caption" themeColor="textSecondary" style={styles.flex}>
              Drawn from the centre’s name you wrote. Not checked with the centre.
            </ThemedText>
          </View>
        ) : null}
        {signatures.length > 0 ? (
          <ThemedText type="caption" themeColor="textSecondary">
            A signature is what the signer wrote; ScubaGo doesn’t check certifications.
          </ThemedText>
        ) : null}
        <OceanButton
          title={signatures.length ? 'Add a signature' : 'Ask your buddy to sign'}
          icon="signature"
          variant={signatures.length ? 'secondary' : 'primary'}
          onPress={() => router.push({ pathname: '/dive/sign', params: { id: dive.id } })}
        />
      </Paper>

      <View style={styles.colophon}>
        <ThemedText type="caption" themeColor="textSecondary">
          {dive.fromSightings ? `Made from sightings logged before the dive log, on ${formatTimestamp(dive.createdAt)}` : `Written in ScubaGo on ${formatTimestamp(dive.createdAt)}`}
          {dive.updatedAt ? ` · edited ${formatTimestamp(dive.updatedAt)}` : ''}
        </ThemedText>
        <SyncLine item={dive} />
      </View>

      <ShareDiveButton dive={dive} site={site} sightings={allSightings} />
      <OceanButton title="Edit page" variant="secondary" icon="edit" disabled={busy} onPress={() => router.push({ pathname: '/dive/edit', params: { id: dive.id } })} />

      {/* Turning the pages: the one before (a lower number) on the left, the next on the right. */}
      <View style={[styles.turn, { borderTopColor: theme.rule }]}>
        <TurnButton direction="older" dive={turn.older} sites={sites} onPress={() => go(turn.older)} />
        <TurnButton direction="newer" dive={turn.newer} sites={sites} onPress={() => go(turn.newer)} />
      </View>

      <View style={[styles.dangerZone, { borderTopColor: theme.rule }]}>
        <Pressable
          onPress={() => void remove()}
          disabled={busy}
          accessibilityRole="button"
          aria-disabled={busy}
          style={({ pressed }) => [styles.delete, { borderColor: theme.danger, backgroundColor: pressed ? theme.backgroundSelected : 'transparent', opacity: busy ? 0.4 : 1 }]}>
          <Icon name="trash" size={18} color={theme.danger} wash={theme.danger} washOpacity={0.15} />
          <ThemedText type="smallBold" themeColor="danger">
            Delete page
          </ThemedText>
        </Pressable>
        {error ? (
          <ThemedText type="small" themeColor="danger" accessibilityLiveRegion="polite" style={styles.center}>
            {error}
          </ThemedText>
        ) : null}
      </View>
    </Screen>
  );
}

/** "28" or "28.5". */
const trim = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

function TurnButton({ direction, dive, sites, onPress }: { direction: 'older' | 'newer'; dive?: Dive; sites: { id: string; name: string }[]; onPress: () => void }) {
  const theme = useTheme();
  const older = direction === 'older';
  if (!dive) return <View style={styles.turnButton} />;
  const siteName = sites.find((s) => s.id === dive.siteId)?.name ?? '';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={`${older ? 'Previous page' : 'Next page'}: dive ${dive.number}, ${siteName}`}
      style={({ pressed }) => [styles.turnButton, older ? styles.turnOlder : styles.turnNewer, { backgroundColor: pressed ? theme.backgroundSelected : 'transparent', borderColor: theme.rule }]}>
      {older ? <Icon name="chevronLeft" size={16} color={theme.tint} weight="bold" /> : null}
      <View style={[styles.flex, { alignItems: older ? 'flex-start' : 'flex-end' }]}>
        <ThemedText type="smallBold" themeColor="tint">
          {formatDiveNumber(dive.number)}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {siteName}
        </ThemedText>
      </View>
      {older ? null : <Icon name="chevronRight" size={16} color={theme.tint} weight="bold" />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two, padding: Spacing.four },
  missingArt: { width: 112, height: 78, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.one },
  head: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  numberBox: { minWidth: 78, borderWidth: 1.5, borderRadius: Radius.md, paddingHorizontal: 8, paddingVertical: 6, alignItems: 'center' },
  no: { fontFamily: Type.label, fontSize: 12, letterSpacing: 1 },
  number: { fontFamily: Type.display, fontSize: 34, lineHeight: 40 },
  siteLink: { alignSelf: 'flex-start', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -10 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  fact: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingHorizontal: Spacing.three, paddingVertical: 8 },
  factLabel: { minWidth: 92 },
  factValue: { flex: 1, textAlign: 'right' },
  stars: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end', gap: 2 },
  notesLabel: { marginBottom: 4 },
  signed: { gap: Spacing.three },
  signature: { gap: 2, paddingTop: 4 },
  signLine: { borderTopWidth: 1, paddingTop: 4 },
  stampRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: 6 },
  colophon: { gap: 4 },
  turn: { flexDirection: 'row', gap: Spacing.two, borderTopWidth: 1, paddingTop: Spacing.three },
  turnButton: { flex: 1, minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: Radius.md },
  turnOlder: { borderWidth: 1, paddingHorizontal: 10 },
  turnNewer: { borderWidth: 1, paddingHorizontal: 10 },
  dangerZone: { borderTopWidth: 1, paddingTop: Spacing.four, marginTop: Spacing.two, alignItems: 'center', gap: Spacing.two },
  delete: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: Spacing.three, borderWidth: 1.5, borderRadius: Radius.md },
});
