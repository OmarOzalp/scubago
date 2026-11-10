import { Stack, router } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type AccessibilityActionEvent } from 'react-native';

import { FactRow } from '@/components/dive/fact-row';
import { Bookplate, CentreStamp } from '@/components/dive/marks';
import { SignatureView } from '@/components/dive/signature';
import { Icon, type IconName } from '@/components/icon';
import { Ledger, type LedgerItem } from '@/components/journal/ledger';
import { ShareDiveButton } from '@/components/share/share-buttons';
import { formatEntryDate, SightingRow } from '@/components/sighting-row';
import { SyncLine, useSyncLineShown } from '@/components/sync-line';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { IconButton } from '@/components/ui/icon-button';
import { List } from '@/components/ui/list';
import { MoreMenu } from '@/components/ui/more-menu';
import { Section } from '@/components/ui/screen';
import { Radius, Size, Space, TypeScale } from '@/constants/theme';
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
      <IconButton icon="edit" accessibilityLabel="Edit page" onPress={edit} disabled={busy} />
      <MoreMenu
        accessibilityLabel="More actions for this page"
        disabled={busy}
        items={[{ label: 'Delete page', icon: 'trash', destructive: true, onPress: () => void remove() }]}
      />
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
          <View style={[styles.numberBox, { backgroundColor: theme.backgroundSelected }]}>
            <Text style={[TypeScale.stamp, { color: theme.textSecondary }]}>NO.</Text>
            <Text numberOfLines={1} adjustsFontSizeToFit style={[TypeScale.figure, { color: theme.text }]}>
              {dive.number.toLocaleString('en')}
            </Text>
          </View>
          <View style={styles.flex}>
            <Text style={[TypeScale.footnoteStrong, { color: theme.textSecondary }]}>{formatEntryDate(dive.divedOn)}</Text>
            <Text style={[TypeScale.title, { color: theme.text }]}>{siteName}</Text>
            {times ? (
              <Text style={[TypeScale.subhead, { color: theme.textSecondary }]}>
                In {dive.timeIn}
                {out ? ` · out ${out}` : ''}
              </Text>
            ) : null}
          </View>
        </View>
      </View>
      {site || actionsIn === 'page' ? (
        <View style={styles.linkRow}>
          {site ? (
            <Pressable onPress={() => router.push(`/site/${site.id}`)} accessibilityRole="link" style={styles.siteLink}>
              <Icon name="pin" size={16} color={theme.tint} />
              <Text style={[TypeScale.subheadStrong, { color: theme.tint }]}>
                {site.region}, {site.country} ›
              </Text>
            </Pressable>
          ) : (
            <View style={styles.flex} />
          )}
          {/* In the book there is no header bar, so Share, Edit and More stand at the page's own corner. */}
          {actionsIn === 'page' ? <View style={styles.pageActions}>{actions}</View> : null}
        </View>
      ) : null}

      {milestone ? <Bookplate at={milestone} siteName={siteName} /> : null}

      {measures.length > 0 ? (
        <Ledger items={measures} />
      ) : (
        <Pressable onPress={edit} accessibilityRole="link" accessibilityLabel="Add depth and time" style={styles.addLink}>
          <Icon name="plus" size={16} color={theme.tint} />
          <Text style={[TypeScale.subheadStrong, { color: theme.tint }]}>Add depth and time</Text>
        </Pressable>
      )}

      {facts.length > 0 || dive.rating ? (
        <Card padded={false}>
          {facts.map((f, i) => (
            <FactRow key={`${f.label}-${i}`} icon={f.icon} label={f.label} separator={i > 0}>
              {f.value}
            </FactRow>
          ))}
          {dive.rating ? (
            <FactRow icon="star" label="Rating" separator={facts.length > 0} accessibilityLabel={`Rating: ${dive.rating} of 5 stars`}>
              <View style={styles.stars}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Icon key={n} name="star" size={18} color={n <= dive.rating! ? theme.text : theme.textTertiary} wash={n <= dive.rating! ? theme.sun : 'transparent'} washOpacity={n <= dive.rating! ? 1 : 0} weight={n <= dive.rating! ? 'duotone' : 'regular'} />
                ))}
              </View>
            </FactRow>
          ) : null}
        </Card>
      ) : null}

      {dive.notes ? (
        <Card style={styles.notes}>
          <Text style={[TypeScale.footnoteStrong, { color: theme.textSecondary }]}>Notes</Text>
          <Text style={[TypeScale.body, { color: theme.text }]}>{dive.notes}</Text>
        </Card>
      ) : null}

      <Section title="What you saw">
        {onPage.length > 0 ? (
          <List>
            {onPage.map((s) => {
              const species = speciesForSighting(s);
              if (!species) return null;
              return <SightingRow key={s.id} sighting={s} species={species} site={site} detail={aboutAnimal(s, species)} pending={!!user && !s.synced} hideDate quiet onPress={() => router.push(`/sighting/${s.id}`)} />;
            })}
          </List>
        ) : (
          <Text style={[TypeScale.subhead, { color: theme.textSecondary }]}>Nothing logged on this dive yet.</Text>
        )}
        <Button title="Add what you saw" icon="plus" variant="secondary" onPress={() => router.push({ pathname: '/log/new', params: { dive: dive.id } })} />
      </Section>

      <Section title="Buddy signature">
        {/* Signatures and the centre's stamp sit together at the foot of the page, as on paper. */}
        <Card style={styles.signed}>
          {signatures.length === 0 && !dive.centreName ? <Text style={[TypeScale.subhead, { color: theme.textSecondary }]}>No signatures yet.</Text> : null}
          {signatures.map((s, i) => (
            <View key={`${s.name}-${s.at}`} style={[styles.signature, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.rule }]}>
              <SignatureView svg={s.svg} height={56} />
              <View style={[styles.signLine, { borderTopColor: theme.textTertiary }]}>
                <Text style={[TypeScale.subheadStrong, { color: theme.text }]}>{s.name}</Text>
                <Text style={[TypeScale.subhead, { color: theme.textSecondary }]}>
                  {s.role ? `${SIGNER_ROLE_LABEL[s.role]} · ` : ''}
                  {s.here ? 'signed on your phone' : 'signed from their own account'} · {formatTimestamp(s.at)}
                </Text>
              </View>
            </View>
          ))}
          {dive.centreName ? (
            // The stamp says "not verified" on its face and in its label.
            <View style={styles.stampRow}>
              <CentreStamp name={dive.centreName} divedOn={dive.divedOn} number={dive.number} />
            </View>
          ) : null}
          <Button
            title={signatures.length ? 'Add a signature' : 'Ask your buddy to sign this page'}
            icon="signature"
            variant="secondary"
            style={styles.signButton}
            onPress={() => router.push({ pathname: '/dive/sign', params: { id: dive.id } })}
          />
          {signatures.length === 0 ? (
            <Text style={[TypeScale.subhead, { color: theme.textSecondary }]}>Your buddy signs on your phone or from theirs. ScubaGo doesn’t check certifications.</Text>
          ) : null}
        </Card>
      </Section>

      {colophon || syncShown ? (
        <View style={styles.colophon}>
          {colophon ? <Text style={[TypeScale.footnote, { color: theme.textSecondary }]}>{colophon}</Text> : null}
          <SyncLine item={dive} />
        </View>
      ) : null}

      {footer}

      {error ? (
        <Text accessibilityLiveRegion="polite" style={[TypeScale.subhead, styles.center, { color: theme.danger }]}>
          {error}
        </Text>
      ) : null}
    </>
  );
}

/** "28" or "28.5". */
const trim = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

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
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: Space.s2, paddingRight: Platform.OS === 'web' ? Space.s4 : 0 },
  headRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Space.s2 },
  head: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Space.s4 },
  // In the book, Share and Edit stand at the page's top corner, leaving the site its width.
  // Beside the region when there is room, under it (at the right) when there is not: a link never breaks across two lines.
  pageActions: { flexDirection: 'row', alignItems: 'center', gap: Space.s2, marginLeft: 'auto' },
  linkRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: Space.s2, marginTop: -Space.s2 },
  addLink: { alignSelf: 'flex-start', minHeight: Size.hit, flexDirection: 'row', alignItems: 'center', gap: Space.s2 },
  numberBox: { minWidth: 76, borderRadius: Radius.md, paddingHorizontal: Space.s2, paddingVertical: Space.s2, alignItems: 'center' },
  siteLink: { minHeight: Size.hit, flexDirection: 'row', alignItems: 'center', gap: Space.s2 },
  stars: { flexDirection: 'row', gap: 2 },
  notes: { gap: Space.s1 },
  signed: { gap: Space.s3 },
  // On a logbook page the card is narrow: less padding so "Ask your buddy to sign this page" stays on one line at 393.
  signButton: { paddingHorizontal: Space.s3 },
  signature: { gap: 2, paddingTop: Space.s1 },
  signLine: { borderTopWidth: 1, paddingTop: Space.s1 },
  stampRow: { flexDirection: 'row', alignItems: 'center', gap: Space.s3, paddingVertical: Space.s2 },
  colophon: { gap: Space.s1 },
});
