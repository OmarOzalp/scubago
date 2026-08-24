import { create } from 'zustand';

import { SITES } from '@/data/sites';
import { ensureProfile, getSessionUserId, signOut as authSignOut } from '@/lib/auth';
import { claimLocalSightings, initDb, insertSighting, insertUserSite, loadAll } from '@/lib/db';
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
  /** All sightings: the user's own + seeded demo community data. */
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
}

export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  sightings: [],
  userSites: [],
  user: null,
  backendEnabled: getSupabase() !== null,

  init: async () => {
    if (get().ready) return;
    const { sightings, userSites } = await initDb();
    set({ sightings, userSites, ready: true });

    // Restore a persisted session, then sync in the background.
    const client = getSupabase();
    if (!client) return;
    try {
      const sessionUid = await getSessionUserId(client);
      if (sessionUid) {
        const username = await ensureProfile(client, sessionUid);
        await get().onSignedIn({ id: sessionUid, username });
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
}));

/** Seeded sites + the user's own additions. */
export function useAllSites(): DiveSite[] {
  const userSites = useAppStore((s) => s.userSites);
  return userSites.length === 0 ? SITES : [...SITES, ...userSites];
}

/** The signed-in user's sightings, or the device-local ones before sign-in. */
export function useMySightings(): Sighting[] {
  const sightings = useAppStore((s) => s.sightings);
  const user = useAppStore((s) => s.user);
  const mineId = user?.id ?? LOCAL_USER_ID;
  return sightings.filter((s) => s.userId === mineId);
}
