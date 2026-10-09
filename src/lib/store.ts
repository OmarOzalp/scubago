import { AppState } from 'react-native';
import { create } from 'zustand';

import { SITES } from '@/data/sites';
import { deleteAccount as deleteRemoteAccount } from '@/lib/account';
import { ensureProfile, getSessionUserId, signOut as authSignOut, usernameForUser } from '@/lib/auth';
import { CATALOG_BY_ID } from '@/lib/catalog';
import {
  claimLocalSightings,
  deleteLocalUserData,
  deleteSighting as deleteSightingRow,
  initDb,
  insertSighting,
  insertUserSite,
  loadAll,
  updateSighting as updateSightingRow,
  type PendingDeletion,
} from '@/lib/db';
import { isFirstOfSpecies } from '@/lib/dex';
import { discardKeptPhoto } from '@/lib/photo-files';
import { applyEdit, canEditSighting, localIsoDate, validateSightingInput, type SightingInput } from '@/lib/sighting-edit';
import { getSupabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/sync';
import { createSyncScheduler } from '@/lib/sync-scheduler';
import { syncNow } from '@/lib/sync-service';
import type { DiveSite, Sighting } from '@/lib/types';

/** The device owner until real auth exists. */
export const LOCAL_USER_ID = 'local';
export const LOCAL_USERNAME = 'you';

export function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export type NewSighting = SightingInput;

export interface NewSite {
  name: string;
  lat: number;
  lng: number;
  region: string;
  country: string;
  blurb: string;
}

interface StoreState {
  ready: boolean;
  /** All sightings: the user's own + community ones (demo community data only in local-only builds). Never deleted ones. */
  sightings: Sighting[];
  userSites: DiveSite[];
  /** Deletions waiting to reach the server (the sightings are already gone from the app). */
  deletions: PendingDeletion[];
  user: { id: string; username: string } | null;
  backendEnabled: boolean;
  /** A sync is running. */
  syncing: boolean;
  /** Why the last sync couldn't run (usually no connection), or null once one succeeds. */
  syncProblem: string | null;
  init: () => Promise<void>;
  /** Logs a sighting; returns whether it was the user's first of this species. */
  addSighting: (input: NewSighting) => Promise<{ sighting: Sighting; isNewSpecies: boolean }>;
  /** Edits one of the user's sightings; returns whether the edit brought a species new to their collection. */
  updateSighting: (id: string, input: NewSighting) => Promise<{ sighting: Sighting; isNewSpecies: boolean }>;
  /** Deletes one of the user's sightings, here at once and on the server as soon as it can. */
  deleteSighting: (id: string) => Promise<void>;
  /** Sync now (after a change, or when the diver asks). */
  requestSync: () => Promise<void>;
  addSite: (input: NewSite) => Promise<DiveSite>;
  onSignedIn: (user: { id: string; username: string }) => Promise<void>;
  signOutUser: () => Promise<void>;
  /** Permanently deletes the signed-in account, its sightings and photos (server and device). Throws on failure. */
  deleteAccount: () => Promise<void>;
}

const isLocalFile = (uri: string | undefined): uri is string => !!uri && !uri.startsWith('http');

export const useAppStore = create<StoreState>((set, get) => {
  /** Owner of "my" rows: the signed-in user, or the device before sign-in. */
  const ownerId = () => get().user?.id ?? LOCAL_USER_ID;

  const checkInput = (input: NewSighting) => {
    const problem = validateSightingInput(input, {
      species: (id) => CATALOG_BY_ID.has(id),
      site: (id) => SITES.some((s) => s.id === id) || get().userSites.some((s) => s.id === id),
      today: localIsoDate(new Date()),
    });
    if (problem) throw new Error(problem);
  };

  // One sync at a time, retried with backoff until the outbox is empty (sync-scheduler.ts).
  const scheduler = createSyncScheduler(async () => {
    const client = getSupabase();
    const owner = get().user;
    if (!client || !owner) return { ok: true };
    set({ syncing: true });
    try {
      const result = await syncNow(client, owner.id);
      set({ syncProblem: null });
      return { ok: result.failed === 0 };
    } catch (e) {
      set({ syncProblem: errorMessage(e) });
      throw e;
    } finally {
      set({ syncing: false, ...(await loadAll()) });
    }
  });

  return {
    ready: false,
    sightings: [],
    userSites: [],
    deletions: [],
    user: null,
    backendEnabled: getSupabase() !== null,
    syncing: false,
    syncProblem: null,

    init: async () => {
      if (get().ready) return;
      // Demo community sightings only keep a local-only build's map alive; with a real backend
      // they would pass for other divers' reports.
      const local = await initDb({ demo: !get().backendEnabled });
      set({ ...local, ready: true });

      // Restore a persisted session, then sync in the background.
      const client = getSupabase();
      if (!client) return;
      // Back in the app (often back online too): send whatever is waiting.
      AppState.addEventListener('change', (state) => {
        if (state === 'active') void scheduler.wake();
      });
      try {
        const sessionUid = await getSessionUserId(client);
        if (!sessionUid) return;
        // Set the user from the persisted session immediately, before any network call —
        // offline launch must not leave a signed-in user looking local. Provisional
        // username; refined below once the network is reachable. Safe because username
        // is never pushed — it comes from the profiles embed on pull.
        await get().onSignedIn({ id: sessionUid, username: usernameForUser(sessionUid) });
        try {
          set({ user: { id: sessionUid, username: await ensureProfile(client, sessionUid) } });
        } catch (e) {
          console.warn('profile fetch failed; using derived username', e);
        }
      } catch (e) {
        console.warn('session restore failed; staying local', e);
      }
    },

    addSighting: async (input) => {
      checkInput(input);
      const owner = get().user;
      const mine = get().sightings.filter((s) => s.userId === ownerId());
      const isNewSpecies = isFirstOfSpecies(mine, input.speciesId);
      const sighting: Sighting = {
        id: uid('s'),
        userId: ownerId(),
        username: owner?.username ?? LOCAL_USERNAME,
        speciesId: input.speciesId,
        siteId: input.siteId,
        sightedOn: input.sightedOn,
        notes: input.notes?.trim() || undefined,
        photoUri: input.photoUri,
        isDemo: false,
        synced: false, // stays in the outbox until it reaches the server
        createdAt: new Date().toISOString(),
      };
      await insertSighting(sighting);
      set({ sightings: [...get().sightings, sighting] });
      void get().requestSync();
      return { sighting, isNewSpecies };
    },

    updateSighting: async (id, input) => {
      const before = get().sightings.find((s) => s.id === id);
      if (!before || !canEditSighting(before, ownerId())) throw new Error('You can only edit your own sightings.');
      checkInput(input);
      const others = get().sightings.filter((s) => s.userId === ownerId() && s.id !== id);
      const isNewSpecies = input.speciesId !== before.speciesId && isFirstOfSpecies(others, input.speciesId);
      const after = applyEdit(before, input, new Date().toISOString());
      await updateSightingRow(after);
      // A replaced photo that never left the device isn't needed any more.
      if (before.photoUri !== after.photoUri && isLocalFile(before.photoUri)) discardKeptPhoto(before.photoUri);
      set({ sightings: get().sightings.map((s) => (s.id === id ? after : s)) });
      void get().requestSync();
      return { sighting: after, isNewSpecies };
    },

    deleteSighting: async (id) => {
      const target = get().sightings.find((s) => s.id === id);
      if (!target || !canEditSighting(target, ownerId())) throw new Error('You can only delete your own sightings.');
      // Signed in, the server has to hear about it: keep a tombstone until it confirms. A log that
      // never leaves the device just loses the row.
      const pendingSync = get().user !== null;
      await deleteSightingRow(id, { pendingSync });
      if (!pendingSync && isLocalFile(target.photoUri)) discardKeptPhoto(target.photoUri);
      set({
        sightings: get().sightings.filter((s) => s.id !== id),
        deletions: pendingSync ? [...get().deletions, { id, userId: target.userId }] : get().deletions,
      });
      void get().requestSync();
    },

    requestSync: () => scheduler.request(),

    addSite: async (input) => {
      const site: DiveSite = {
        id: uid('site'),
        name: input.name,
        lat: input.lat,
        lng: input.lng,
        region: input.region,
        country: input.country,
        blurb: input.blurb,
        notableSpecies: [],
        source: 'user',
      };
      await insertUserSite(site);
      set({ userSites: [...get().userSites, site] });
      void get().requestSync();
      return site;
    },

    onSignedIn: async (user) => {
      set({ user });
      await claimLocalSightings(user.id, user.username);
      set(await loadAll());
      // Failures stay queued and are retried (sync-scheduler.ts).
      await scheduler.wake();
    },

    signOutUser: async () => {
      const client = getSupabase();
      if (client) {
        try {
          await authSignOut(client);
        } catch (e) {
          console.warn('sign-out failed remotely; clearing local session anyway', e);
        }
      }
      set({ user: null, syncProblem: null });
    },

    deleteAccount: async () => {
      const client = getSupabase();
      const owner = get().user;
      if (!client || !owner) return;
      await deleteRemoteAccount(client, owner.id);
      await deleteLocalUserData(owner.id);
      set({ user: null, ...(await loadAll()) });
    },
  };
});

/** Seeded sites + the user's own additions. */
export function useAllSites(): DiveSite[] {
  const userSites = useAppStore((s) => s.userSites);
  return userSites.length === 0 ? SITES : [...SITES, ...userSites];
}

/** The id that owns "my" rows: the signed-in user, or the device before sign-in. */
export function useMyUserId(): string {
  return useAppStore((s) => s.user?.id) ?? LOCAL_USER_ID;
}

/** The signed-in user's sightings, or the device-local ones before sign-in. */
export function useMySightings(): Sighting[] {
  const sightings = useAppStore((s) => s.sightings);
  const mineId = useMyUserId();
  return sightings.filter((s) => s.userId === mineId);
}

/**
 * The signed-in diver's changes still on their way to the server: new or edited sightings and
 * deletions, and how many of those have failed at least once. Zero when not signed in (a log that
 * stays on the device has nothing to wait for).
 */
export function pendingChanges(
  sightings: Sighting[],
  deletions: PendingDeletion[],
  userId: string | undefined,
): { count: number; failing: number } {
  if (!userId) return { count: 0, failing: 0 };
  const waiting = sightings.filter((s) => s.userId === userId && !s.isDemo && !s.synced);
  const deleting = deletions.filter((d) => d.userId === userId);
  return {
    count: waiting.length + deleting.length,
    failing: waiting.filter((s) => s.syncError).length + deleting.filter((d) => d.syncError).length,
  };
}

export function usePendingChanges(): { count: number; failing: number } {
  const sightings = useAppStore((s) => s.sightings);
  const deletions = useAppStore((s) => s.deletions);
  const userId = useAppStore((s) => s.user?.id);
  return pendingChanges(sightings, deletions, userId);
}
