import AsyncStorage from '@react-native-async-storage/async-storage';
import { memo, useCallback, useEffect, useState } from 'react';

import { SiteList } from '@/components/site-list';
import type { SiteMapProps } from '@/components/site-map';

const NOTE_KEY = 'scubago.mapNote.v1';

/** The web's note about the map, until the diver closes it: never again once they have. */
function useMapNote(): { show: boolean; dismiss: () => void } {
  // Hidden until the stored answer is in, so a note that was closed never flashes up first.
  const [show, setShow] = useState(false);
  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(NOTE_KEY)
      .then((closed) => {
        if (live && !closed) setShow(true);
      })
      .catch(() => {
        // No storage: the note shows, and closing it lasts until the page is reloaded.
        if (live) setShow(true);
      });
    return () => {
      live = false;
    };
  }, []);
  const dismiss = useCallback(() => {
    setShow(false);
    AsyncStorage.setItem(NOTE_KEY, new Date().toISOString()).catch(() => undefined);
  }, []);
  return { show, dismiss };
}

/**
 * Web fallback: the interactive map is native-only (react-native-maps has no web map), so show a
 * browsable site list. No markers are drawn here, so there is nothing to cluster: the list is
 * windowed instead (site-list.tsx) and carries the OpenStreetMap credit under it. The Explore
 * header sits above it on the page (not over it), so the list needs no top inset. Where the native
 * map flies to the site or place the search picked, the list scrolls to it.
 */
export const SiteMap = memo(function SiteMap({ sites, highlightedSiteIds, focus, selectedSiteId, onSelectSite }: SiteMapProps) {
  const note = useMapNote();
  return (
    <SiteList
      sites={sites}
      highlightedSiteIds={highlightedSiteIds}
      onSelectSite={onSelectSite}
      reveal={focus}
      selectedSiteId={selectedSiteId}
      note={note.show ? 'The map is in the iOS and Android apps.' : undefined}
      onDismissNote={note.dismiss}
    />
  );
});
