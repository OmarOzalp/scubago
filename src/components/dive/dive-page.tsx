import { Stack, router } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type AccessibilityActionEvent } from 'react-native';

import { Bookplate, CentreStamp } from '@/components/dive/marks';
import { SignatureView } from '@/components/dive/signature';
import { Icon, type IconName } from '@/components/icon';
import { Disclosure } from '@/components/journal/disclosure';
import { IconButton } from '@/components/journal/icon-button';
import { Ledger, type LedgerItem } from '@/components/journal/ledger';
import { Paper } from '@/components/journal/paper';
import { SectionHeader } from '@/components/journal/screen';
import { OceanButton } from '@/components/ocean-button';
import { ShareDiveButton } from '@/components/share/share-buttons';
import { formatEntryDate, SightingRow } from '@/components/sighting-row';
import { SyncLine, useSyncLineShown } from '@/components/sync-line';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { announce } from '@/lib/announce';
import { speciesForSighting, UNLISTED_ID } from '@/lib/catalog';
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
  SUITS,
  SURFACES,
  TANK_MATERIALS,
  timeOut,
} from '@/lib/dives';
import { RARITY_LABEL } from '@/lib/rarity';
import { localIsoDate } from '@/lib/sighting-edit';
import { useAppStore, useMyUserId, useSiteById } from '@/lib/store';
import type { Dive, DiveSignature, Sighting, Species } from '@/lib/types';

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * A page of the diver's logbook: its number and site, the day and times, what they measured, the
 * conditions and gear, their notes, the animals they saw, and the signatures and stamp on it. The
 * same page is a leaf of the Logbook's book and the screen a link to a dive opens.
 *
 * Edit and Share are where they are in reach from the top of a long page: in the header of the screen
 * (`actionsIn="header"`), or at the head of the page itself in the book, which has no header bar.
 */
export function DivePage({
  dive,
  actionsIn = 'header',
  pageLabel,
  turn,
  footer,
  onDeleting,
  onDeleted,
}: {
  dive: Dive;
  actionsIn?: 'header' | 'page';
  /** "Page 6 of 6": said first when a screen reader reaches the head of the page (the book). */
  pageLabel?: string;
  /** Turning to the page before or after from the head, with a screen reader's actions (the book). */
  turn?: { previous?: () => void; next?: () => void };
  /** Under the colophon, above Delete page (the screen's previous and next buttons). */
  footer?: ReactNode;
  /** A delete has begun (true) or failed (false): the screen keeps the page in view while it closes. */
  onDeleting?: (deleting: boolean) => void;
  /** After the page is deleted (the screen closes; the book stays open). */
  onDeleted?: () => void;
}) {
  const theme = useTheme();
  const siteById = useSiteById();
  const myUserId = useMyUserId();
  const allSightings = useAppStore((s) => s.sightings);
  const user = useAppStore((s) => s.user);
  // Whether the sync line has anything to say (signed out, it says nothing: the Logbook's banner does).
  const syncShown = useSyncLineShown();
  const deleteDive = useAppStore((s) => s.deleteDive);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const live = useMemo(
    () => allSightings.filter((s) => s.diveId === dive.id && s.userId === myUserId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [allSightings, dive.id, myUserId],
  );
  // While the page is deleted it goes on showing its animals (the store drops them with the page before the
  // screen has closed), rather than "Nothing logged on this dive yet" on its way out.
  const [kept, setKept] = useState<Sighting[] | null>(null);
  const onPage = kept ?? live;

  const site = siteById(dive.siteId);
  const siteName = site?.name ?? 'Unknown site';
  // When it was written, said only where it adds something: a page written on the day of the dive and never edited says nothing.
  const colophon = [
    !dive.fromSightings && localIsoDate(new Date(dive.createdAt)) !== dive.divedOn ? `Written ${formatTimestamp(dive.createdAt)}` : null,
    dive.updatedAt ? `edited ${formatTimestamp(dive.updatedAt)}` : null,
  ]
    .filter((part): part is string => !!part)
    .join(' · ')
    .replace(/^./, (c) => c.toUpperCase());
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
    setKept(live);
    onDeleting?.(true);
    try {
      await deleteDive(dive.id);
      onDeleted?.();
    } catch (e: any) {
      const message = e.message ?? 'Could not delete this page';
      setKept(null);
      onDeleting?.(false);
      setError(message);
      announce(message);
      setBusy(false);
    }
  };

  const edit = () => !busy && router.push({ pathname: '/dive/edit', params: { id: dive.id } });
  const actions = (
    <>
      <ShareDiveButton variant="header" dive={dive} site={site} sightings={allSightings} />
      <IconButton icon="edit" size={HEADER_BUTTON} accessibilityLabel="Edit page" onPress={edit} style={{ opacity: busy ? 0.4 : 1 }} />
    </>
  );
  // A screen reader turns the book's pages from the head of a page, as well as with the page count at the top.
  const turnActions = [turn?.previous ? { name: 'previous', label: 'Previous page' } : null, turn?.next ? { name: 'next', label: 'Next page' } : null].filter(
    (a): a is { name: string; label: string } => !!a,
  );
  const onTurnAction = (e: AccessibilityActionEvent) => (e.nativeEvent.actionName === 'next' ? turn?.next?.() : turn?.previous?.());

  return (
    <>
      {actionsIn === 'header' ? (
        <Stack.Screen options={{ title: formatDiveNumber(dive.number), headerRight: () => <View style={styles.headerActions}>{actions}</View> }} />
      ) : null}

      {/* The head of the page: the number in the margin, the site and the day beside it. */}
      <View style={styles.headRow}>
        <View
          style={styles.head}
          accessible
          accessibilityRole="header"
          accessibilityLabel={`${pageLabel ? `${pageLabel}, ` : ''}Dive ${dive.number}, ${siteName}, ${formatEntryDate(dive.divedOn)}${times ? `, ${times}` : ''}`}
          accessibilityActions={turnActions.length ? turnActions : undefined}
          onAccessibilityAction={turnActions.length ? onTurnAction : undefined}>
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
        {actionsIn === 'page' ? <View style={styles.pageActions}>{actions}</View> : null}
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
            {dive.fromSightings ? 'Made from earlier sightings. Add the depth and time.' : 'No depth or time on this page yet.'}
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
        return <SightingRow key={s.id} sighting={s} species={species} site={site} detail={aboutAnimal(s, species)} pending={!!user && !s.synced} hideDate quiet onPress={() => router.push(`/sighting/${s.id}`)} />;
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
            No signatures yet.
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
          // The stamp says "not verified" on its face and in its label.
          <View style={styles.stampRow}>
            <CentreStamp name={dive.centreName} divedOn={dive.divedOn} number={dive.number} />
          </View>
        ) : null}
        <OceanButton
          title={signatures.length ? 'Add a signature' : 'Ask your buddy to sign'}
          icon="signature"
          variant="secondary"
          onPress={() => router.push({ pathname: '/dive/sign', params: { id: dive.id } })}
        />
        <Disclosure label="About signatures" hint="Explains how signing works and what is checked">
          <ThemedText type="caption" themeColor="textSecondary">
            Sign on your phone, or let a buddy sign from theirs with a code. Signatures are what the signer wrote; ScubaGo doesn’t check certifications or centres.
          </ThemedText>
        </Disclosure>
      </Paper>

      {colophon || syncShown ? (
        <View style={styles.colophon}>
          {colophon ? (
            <ThemedText type="caption" themeColor="textSecondary">
              {colophon}
            </ThemedText>
          ) : null}
          <SyncLine item={dive} />
        </View>
      ) : null}

      {footer}

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
    </>
  );
}

/** "28" or "28.5". */
const trim = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** The width of a round button in the header, the height of a navigation bar. */
const HEADER_BUTTON = 44;

/**
 * What a row of "What you saw" says under the animal's name: how rare it is and what was written
 * about it. (Every row on this page is at the page's site, on its day, so those aren't said again.)
 * An animal outside the catalogue has no rarity: its notes, or nothing.
 */
function aboutAnimal(sighting: Sighting, species: Species): string {
  const rarity = species.id === UNLISTED_ID ? null : RARITY_LABEL[species.rarity];
  return [rarity, sighting.notes?.trim()].filter(Boolean).join(' · ');
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  // The web's header has no margin at its right end (a phone's has its own).
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingRight: Platform.OS === 'web' ? Spacing.three : 0 },
  headRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  head: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14 },
  // In the book, Share and Edit stand one above the other at the page's top corner, leaving the site its width.
  pageActions: { gap: Spacing.two },
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
  dangerZone: { borderTopWidth: 1, paddingTop: Spacing.four, marginTop: Spacing.two, alignItems: 'center', gap: Spacing.two },
  delete: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: Spacing.three, borderWidth: 1.5, borderRadius: Radius.md },
});
