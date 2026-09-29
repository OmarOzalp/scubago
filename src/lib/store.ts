import { create } from 'zustand';

import { SITES } from '@/data/sites';
import { deleteAccount as deleteRemoteAccount } from '@/lib/account';
import { ensureProfile, getSessionUserId, signOut as authSignOut, usernameForUser } from '@/lib/auth';
import { claimLocalSightings, deleteLocalUserData, initDb, insertSighting, insertUserSite, loadAll } from '@/lib/db';
import { isFirstOfSpecies } from '@/lib/dex';
import { getSupabase } from '@/lib/supabase';
import { syncNow } from '@/lib/sync-service';
import type { DiveSite, Sighting } from '@/lib/types';

/** The device owner until real auth exists. */
export const LOCAL_USER_ID = 'local';
export const LOCAL_USERNAME = 'you';

export function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface NewSighting {
  speciesId: string;
  siteId: string;
  sightedOn: string;
  notes?: string;
  photoUri?: string;
}

export interface NewSite {
  name: string;
  lat: number;
  lng: number;
  region: string;
  country: string;
  blurb: string;
}

interface AppState {
  ready: boolean;
  /** All sightings: the user's own + community ones (demo community data only in local-only builds). */
  sightings: Sighting[];
  userSites: DiveSite[];
  user: { id: string; username: string } | null;
  backendEnabled: boolean;
  init: () => Promise<void>;
  /** Logs a sighting; returns whether it was the user's first of this species. */
  addSighting: (input: NewSighting) => Promise<{ sighting: Sighting; isNewSpecies: boolean }>;
  addSite: (input: NewSite) => Promise<DiveSite>;
  onSignedIn: (user: { id: string; username: string }) => Promise<void>;
  signOutUser: () => Promise<void>;
  /** Permanently deletes the signed-in account, its sightings and photos (server and device). Throws on failure. */
  deleteAccount: () => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  sightings: [],
  userSites: [],
  user: null,
  backendEnabled: getSupabase() !== null,

  init: async () => {
    if (get().ready) return;
    // Demo community sightings only keep a local-only build's map alive; with a real backend
    // they would pass for other divers' reports.
    const { sightings, userSites } = await initDb({ demo: !get().backendEnabled });
    set({ sightings, userSites, ready: true });

    // Restore a persisted session, then sync in the background.
    const client = getSupabase();
    if (!client) return;
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
    const owner = get().user;
    const ownerId = owner?.id ?? LOCAL_USER_ID;
    const mine = get().sightings.filter((s) => s.userId === ownerId);
    const isNewSpecies = isFirstOfSpecies(mine, input.speciesId);
    const sighting: Sighting = {
      id: uid('s'),
      userId: ownerId,
      username: owner?.username ?? LOCAL_USERNAME,
      speciesId: input.speciesId,
      siteId: input.siteId,
      sightedOn: input.sightedOn,
      notes: input.notes || undefined,
      photoUri: input.photoUri,
      isDemo: false,
      synced: false, // stays in the outbox until a Supabase backend is configured
      createdAt: new Date().toISOString(),
    };
    await insertSighting(sighting);
    set({ sightings: [...get().sightings, sighting] });

    const client = getSupabase();
    if (client && owner) {
      // Fire-and-forget: failures stay queued in the outbox for the next sync.
      syncNow(client, owner.id)
        .then(async () => set(await loadAll()))
        .catch((e) => console.warn('background sync failed', e));
    }
    return { sighting, isNewSpecies };
  },

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

    const client = getSupabase();
    const owner = get().user;
    if (client && owner) {
      // Fire-and-forget: failures stay queued in the outbox for the next sync.
      syncNow(client, owner.id)
        .then(async () => set(await loadAll()))
        .catch((e) => console.warn('background sync failed', e));
    }
    return site;
  },

  onSignedIn: async (user) => {
    set({ user });
    await claimLocalSightings(user.id, user.username);
    const client = getSupabase();
    if (client) {
      try {
        await syncNow(client, user.id);
      } catch (e) {
        console.warn('initial sync failed; outbox will retry', e);
      }
    }
    set(await loadAll());
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
    set({ user: null });
  },

  deleteAccount: async () => {
    const client = getSupabase();
    const owner = get().user;
    if (!client || !owner) return;
    await deleteRemoteAccount(client, owner.id);
    await deleteLocalUserData(owner.id);
    set({ user: null, ...(await loadAll()) });
  },
}));

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
