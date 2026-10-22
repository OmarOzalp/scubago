/**
 * The Share buttons on the species page, a dive's page and Home. Each works out its card from the
 * records the screen already has (only what the diver shared: see card-data.ts), opens the preview
 * and draws nothing until then. The species and dive buttons are paper buttons in the app's
 * style; Home's is a round icon beside "customize".
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { IconButton } from '@/components/journal/icon-button';
import { OceanButton } from '@/components/ocean-button';
import { cardFileName } from '@/components/share/card-spec';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { CATALOG_BY_ID, speciesForSighting } from '@/lib/catalog';
import { releaseSnapshot } from '@/lib/scene-snapshot';
import type { Dive, DiveSite, Sighting, Species } from '@/lib/types';

import { ArchipelagoCard } from './archipelago-card';
import {
  archipelagoData,
  describeArchipelago,
  describeDive,
  describeDiscovery,
  diveCardData,
  discoveryData,
  privateCount,
} from './card-data';
import { DiscoveryCard } from './discovery-card';
import { DiveLogCard } from './dive-log-card';
import { SharePreview, type ShareApi } from './share-preview';

/**
 * What the card says about the diver's private sightings: "1 private sighting is left off this card.",
 * or, when they chose to put them on it, that nothing goes anywhere until they tap Share.
 */
function privateNote(count: number, included: boolean): string | undefined {
  if (count === 0) return undefined;
  const what = `${count} private ${count === 1 ? 'sighting is' : 'sightings are'}`;
  return included ? `${what} on this card. They stay private in your log; nothing is shared until you tap Share.` : `${what} left off this card.`;
}

/**
 * Whether the card shows the diver's private ("Only me") sightings. It starts off when the card has
 * something else to show, and on when everything it would show is private: a diver who logs
 * everything privately shouldn't be handed an empty card, and the preview shows exactly what would
 * go before anything does. `reset` sets it afresh each time the preview opens.
 */
function usePrivateChoice(kept: number, nothingElse: boolean) {
  const [include, setInclude] = useState(false);
  const reset = useCallback(() => setInclude(kept > 0 && nothingElse), [kept, nothingElse]);
  return { include, setInclude, reset };
}

/** "Include my private sightings", with a switch, under the card. */
function PrivateSwitch({ count, value, onChange }: { count: number; value: boolean; onChange: (value: boolean) => void }) {
  const theme = useTheme();
  const label = `Include my private ${count === 1 ? 'sighting' : 'sightings'}`;
  return (
    <View style={styles.choice}>
      <ThemedText type="smallBold" style={styles.choiceLabel} importantForAccessibility="no" accessibilityElementsHidden>
        {label}
      </ThemedText>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label} trackColor={{ true: theme.tint, false: theme.rule }} />
    </View>
  );
}

/** "Share this discovery": one species the diver has found, as a card. Nothing is drawn unless they have shared a sighting of it. */
export function ShareDiscoveryButton({
  species,
  sightings,
  sites,
  ownerId,
  observedNote,
  api,
}: {
  species: Species;
  /** The diver's sightings (the screen's). */
  sightings: readonly Sighting[];
  sites: readonly Pick<DiveSite, 'id' | 'name'>[];
  ownerId?: string;
  /** A line about the species from real data, set under the card's facts. */
  observedNote?: string;
  api?: ShareApi;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const shared = useMemo(() => discoveryData(species, sightings, sites, ownerId), [species, sightings, sites, ownerId]);
  const kept = useMemo(() => privateCount(sightings.filter((s) => s.speciesId === species.id), ownerId), [sightings, species.id, ownerId]);
  const withPrivate = useMemo(
    () => (kept > 0 ? discoveryData(species, sightings, sites, ownerId, CATALOG_BY_ID, { includePrivate: true }) : null),
    [kept, species, sightings, sites, ownerId],
  );
  const choice = usePrivateChoice(kept, shared === null);
  const data = (choice.include ? withPrivate : shared) ?? shared ?? withPrivate;
  if (!data) return null;
  return (
    <>
      <OceanButton
        title="Share this discovery"
        variant="secondary"
        icon="share"
        accessibilityHint="Shows a picture of this discovery to share"
        onPress={() => {
          choice.reset();
          setOpen(true);
        }}
      />
      <SharePreview
        visible={open}
        onClose={close}
        title="Share your discovery"
        cardLabel={describeDiscovery(data, observedNote)}
        fileName={cardFileName(species.commonName)}
        content={choice.include ? 'private' : 'shared'}
        note={privateNote(kept, choice.include)}
        controls={kept > 0 && shared ? <PrivateSwitch count={kept} value={choice.include} onChange={choice.setInclude} /> : null}
        api={api}>
        <DiscoveryCard species={species} firstSeenOn={data.firstSeenOn} siteName={data.siteName} collectionNumber={data.collectionNumber} observedNote={observedNote} />
      </SharePreview>
    </>
  );
}

/** "Share this page": a dive's page of the logbook as a card. Its notes stay off the card. */
export function ShareDiveButton({
  dive,
  site,
  sightings,
  api,
}: {
  dive: Dive;
  site: Pick<DiveSite, 'name' | 'region' | 'country'> | undefined;
  /** The diver's sightings (the screen's). */
  sightings: readonly Sighting[];
  api?: ShareApi;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const shared = useMemo(() => diveCardData(dive, site, sightings), [dive, site, sightings]);
  // Only the private sightings the page could show count (not one of a species the catalogue no longer has).
  const kept = useMemo(
    () => privateCount(sightings.filter((s) => s.diveId === dive.id && speciesForSighting(s)), dive.userId),
    [sightings, dive.id, dive.userId],
  );
  const choice = usePrivateChoice(kept, shared.species.length === 0);
  const withPrivate = useMemo(() => (choice.include ? diveCardData(dive, site, sightings, { includePrivate: true }) : null), [choice.include, dive, site, sightings]);
  const data = withPrivate ?? shared;
  return (
    <>
      <OceanButton
        title="Share this page"
        variant="secondary"
        icon="share"
        accessibilityHint="Shows a picture of this logbook page to share"
        onPress={() => {
          choice.reset();
          setOpen(true);
        }}
      />
      <SharePreview
        visible={open}
        onClose={close}
        title="Share this dive"
        cardLabel={describeDive(data)}
        fileName={cardFileName('dive', data.number, data.siteName)}
        content={choice.include ? 'private' : 'shared'}
        note={privateNote(kept, choice.include)}
        controls={kept > 0 ? <PrivateSwitch count={kept} value={choice.include} onChange={choice.setInclude} /> : null}
        api={api}>
        <DiveLogCard {...data} keptPrivate={kept > 0 && data.species.length === 0} />
      </SharePreview>
    </>
  );
}

/**
 * A round Share button for Home: the diver's archipelago as a card. Nothing shows until they have found a species.
 *
 * The hero is a picture of the live 3D scene when there is one. Home passes `captureSnapshot` (it
 * owns the scene, so it says which one and how big); it is called afresh each time the preview
 * opens, while the preview says "Framing your islands…" and holds Share, and the card shows its
 * illustration if the picture can't be taken. A prop rather than a global lookup here keeps the cards
 * and buttons free of any knowledge of the scene, and lets a test hand in a fake.
 */
export function ShareArchipelagoButton({
  name,
  sightings,
  dives,
  ownerId,
  snapshot,
  captureSnapshot,
  api,
}: {
  /** The diver's name for their island. */
  name: string;
  sightings: readonly Sighting[];
  dives: readonly Pick<Dive, 'siteId' | 'userId'>[];
  ownerId?: string;
  /** A picture of the 3D scene (an image URI) for the card's hero; without one the card draws an illustration. */
  snapshot?: string;
  /** Takes a fresh picture of the 3D scene each time the preview opens (null if it can't). Unused when `snapshot` is given. */
  captureSnapshot?: () => Promise<string | null>;
  api?: ShareApi;
}) {
  const [open, setOpen] = useState(false);
  // The picture taken for this opening of the preview, and whether it is still being taken.
  const [taken, setTaken] = useState<{ uri?: string; framing: boolean }>({ framing: false });
  const attempt = useRef(0);
  // A taken picture is let go when it is replaced, when the preview closes, and on unmount.
  useEffect(() => () => releaseSnapshot(taken.uri), [taken.uri]);
  useEffect(() => () => void attempt.current++, []);

  const shared = useMemo(() => archipelagoData(name, sightings, dives, ownerId), [name, sightings, dives, ownerId]);
  // Only the private sightings the islands could show count: a catalogue species, not an animal outside it.
  const kept = useMemo(() => privateCount(sightings.filter((s) => CATALOG_BY_ID.has(s.speciesId)), ownerId), [sightings, ownerId]);
  const withPrivate = useMemo(
    () => (kept > 0 ? archipelagoData(name, sightings, dives, ownerId, CATALOG_BY_ID, { includePrivate: true }) : null),
    [kept, name, sightings, dives, ownerId],
  );
  const choice = usePrivateChoice(kept, shared === null);
  const { reset } = choice;

  // Home's scene shows all the diver's animals, private ones too. While those are left off the card
  // and they add a species to it (and so perhaps an island or a level), a picture of the scene would
  // show what the card leaves out, so the card draws its illustration instead. Private sightings only
  // ever add, so the same number of species is the same island.
  const pictureOff = !choice.include && (withPrivate?.speciesCount ?? 0) > (shared?.speciesCount ?? 0);
  const shown = pictureOff ? undefined : snapshot ?? taken.uri;
  // A picture the card won't use doesn't hold Share (it is still taken, for the switch to bring in).
  const framing = taken.framing && !pictureOff;
  // With a snapshot, the card isn't ready to capture until that picture has loaded (or failed to).
  const [settledFor, setSettledFor] = useState<string | undefined>();
  const onSettled = useCallback(() => setSettledFor(shown), [shown]);

  const show = useCallback(() => {
    reset();
    setOpen(true);
    if (!captureSnapshot || snapshot) return;
    const mine = ++attempt.current;
    setTaken({ framing: true });
    new Promise<string | null>((resolve) => resolve(captureSnapshot())).then(
      (uri) => uri,
      () => null,
    ).then((uri) => {
      if (mine !== attempt.current) return releaseSnapshot(uri); // closed meanwhile
      setTaken({ uri: uri ?? undefined, framing: false });
    });
  }, [captureSnapshot, snapshot, reset]);
  const close = useCallback(() => {
    attempt.current++;
    setTaken({ framing: false });
    // The next opening loads its picture afresh, even the same one: it isn't ready until then.
    setSettledFor(undefined);
    setOpen(false);
  }, []);

  const data = (choice.include ? withPrivate : shared) ?? shared ?? withPrivate;
  if (!data) return null;
  return (
    <>
      <IconButton icon="share" accessibilityLabel="Share your archipelago" accessibilityHint="Shows a picture of your islands to share" onPress={show} />
      <SharePreview
        visible={open}
        onClose={close}
        title="Share your archipelago"
        cardLabel={describeArchipelago(data)}
        fileName={cardFileName('archipelago', data.name)}
        ready={!framing && (!shown || settledFor === shown)}
        content={`${choice.include ? 'private' : 'shared'} ${shown ?? 'illustration'}`}
        note={framing ? 'Framing your islands…' : privateNote(kept, choice.include)}
        controls={kept > 0 && shared ? <PrivateSwitch count={kept} value={choice.include} onChange={choice.setInclude} /> : null}
        api={api}>
        <ArchipelagoCard
          name={data.name}
          rank={data.rank}
          level={data.level}
          speciesCount={data.speciesCount}
          islandsFound={data.islandsFound}
          islands={data.islands}
          sitesDived={data.sitesDived}
          rarest={data.rarest}
          snapshot={shown}
          framing={framing}
          onSettled={onSettled}
        />
      </SharePreview>
    </>
  );
}

const styles = StyleSheet.create({
  choice: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44 },
  choiceLabel: { flex: 1 },
});
