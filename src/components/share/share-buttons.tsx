/**
 * The Share buttons on the species page, a dive's page and Home. Each works out its card from the
 * records the screen already has (only what the diver shared: see card-data.ts), opens the preview
 * and draws nothing until then. The species and dive buttons are paper buttons in the app's
 * style; Home's is a round icon beside "customize".
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { IconButton } from '@/components/journal/icon-button';
import { OceanButton } from '@/components/ocean-button';
import { cardFileName } from '@/components/share/card-spec';
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

/** "1 private sighting is left off this card." */
function privateNote(count: number): string | undefined {
  return count > 0 ? `${count} private ${count === 1 ? 'sighting is' : 'sightings are'} left off this card.` : undefined;
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
  const data = useMemo(() => discoveryData(species, sightings, sites, ownerId), [species, sightings, sites, ownerId]);
  const kept = useMemo(() => privateCount(sightings.filter((s) => s.speciesId === species.id), ownerId), [sightings, species.id, ownerId]);
  if (!data) return null;
  return (
    <>
      <OceanButton title="Share this discovery" variant="secondary" icon="share" accessibilityHint="Shows a picture of this discovery to share" onPress={() => setOpen(true)} />
      <SharePreview
        visible={open}
        onClose={close}
        title="Share your discovery"
        cardLabel={describeDiscovery(data, observedNote)}
        fileName={cardFileName(species.commonName)}
        note={privateNote(kept)}
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
  const data = useMemo(() => diveCardData(dive, site, sightings), [dive, site, sightings]);
  const kept = useMemo(() => privateCount(sightings.filter((s) => s.diveId === dive.id), dive.userId), [sightings, dive.id, dive.userId]);
  return (
    <>
      <OceanButton title="Share this page" variant="secondary" icon="share" accessibilityHint="Shows a picture of this logbook page to share" onPress={() => setOpen(true)} />
      <SharePreview
        visible={open}
        onClose={close}
        title="Share this dive"
        cardLabel={describeDive(data)}
        fileName={cardFileName('dive', data.number, data.siteName)}
        note={privateNote(kept)}
        api={api}>
        <DiveLogCard {...data} />
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
  const shown = snapshot ?? taken.uri;
  // With a snapshot, the card isn't ready to capture until that picture has loaded (or failed to).
  const [settledFor, setSettledFor] = useState<string | undefined>();
  const onSettled = useCallback(() => setSettledFor(shown), [shown]);
  // A taken picture is let go when it is replaced, when the preview closes, and on unmount.
  useEffect(() => () => releaseSnapshot(taken.uri), [taken.uri]);
  useEffect(() => () => void attempt.current++, []);

  const show = useCallback(() => {
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
  }, [captureSnapshot, snapshot]);
  const close = useCallback(() => {
    attempt.current++;
    setTaken({ framing: false });
    setOpen(false);
  }, []);

  const data = useMemo(() => archipelagoData(name, sightings, dives, ownerId), [name, sightings, dives, ownerId]);
  const kept = useMemo(() => privateCount(sightings, ownerId), [sightings, ownerId]);
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
        ready={!taken.framing && (!shown || settledFor === shown)}
        note={taken.framing ? 'Framing your islands…' : privateNote(kept)}
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
          framing={taken.framing}
          onSettled={onSettled}
        />
      </SharePreview>
    </>
  );
}
