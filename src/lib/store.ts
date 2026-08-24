import { create } from 'zustand';

import { SITES } from '@/data/sites';
import { initDb, insertSighting, insertUserSite } from '@/lib/db';
import { isFirstOfSpecies } from '@/lib/dex';
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
  init: () => Promise<void>;
  /** Logs a sighting; returns whether it was the user's first of this species. */
  addSighting: (input: NewSighting) => Promise<{ sighting: Sighting; isNewSpecies: boolean }>;
  addSite: (input: NewSite) => Promise<DiveSite>;
}

export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  sightings: [],
  userSites: [],

  init: async () => {
    if (get().ready) return;
    const { sightings, userSites } = await initDb();
    set({ sightings, userSites, ready: true });
  },

  addSighting: async (input) => {
    const mine = get().sightings.filter((s) => s.userId === LOCAL_USER_ID);
    const isNewSpecies = isFirstOfSpecies(mine, input.speciesId);
    const sighting: Sighting = {
      id: uid('s'),
      userId: LOCAL_USER_ID,
      username: LOCAL_USERNAME,
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
    return site;
  },
}));

/** Seeded sites + the user's own additions. */
export function useAllSites(): DiveSite[] {
  const userSites = useAppStore((s) => s.userSites);
  return userSites.length === 0 ? SITES : [...SITES, ...userSites];
}

export function useMySightings(): Sighting[] {
  const sightings = useAppStore((s) => s.sightings);
  return sightings.filter((s) => s.userId === LOCAL_USER_ID);
}
