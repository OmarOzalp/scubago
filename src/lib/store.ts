import { useCallback, useMemo } from 'react';
import { AppState } from 'react-native';
import { create } from 'zustand';

import { SITES, SITES_BY_ID } from '@/data/sites';
import { deleteAccount as deleteRemoteAccount } from '@/lib/account';
import { ensureProfile, getSessionUserId, signOut as authSignOut, usernameForUser } from '@/lib/auth';
import { CATALOG_BY_ID, UNLISTED_ID } from '@/lib/catalog';
import {
  bindSightingsToDives,
  claimLocalSightings,
  DatabaseBusyError,
  deleteDive as deleteDiveRows,
  deleteLocalUserData,
  deleteSighting as deleteSightingRow,
  deleteSightings as deleteSightingRows,
  forgetSyncedUserData,
  initDb,
  insertDive,
  insertSighting,
  insertUserSite,
  loadAll,
  setDivesBefore as saveDivesBefore,
  updateDive as updateDiveRows,
  updateSighting as updateSightingRow,
  type LocalData,
  type PendingDeletion,
} from '@/lib/db';
import { isFirstOfSpecies } from '@/lib/dex';
import { bindPastSightings, cleanDive, nextDiveNumber, validateDive } from '@/lib/dives';
import { discardKeptPhoto } from '@/lib/photo-files';
import { asSeenBy, isLocalPhoto } from '@/lib/privacy';
import { applyEdit, canEditSighting, cleanCustomName, localIsoDate, privacyChoice, validateSightingInput, type SightingInput } from '@/lib/sighting-edit';
import { getSupabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/sync';
import { createSyncScheduler } from '@/lib/sync-scheduler';
import { syncNow } from '@/lib/sync-service';
import type { Dive, DiveFields, DiveSignature, DiveSite, Sighting } from '@/lib/types';

/** The device owner until real auth exists. */
export const LOCAL_USER_ID = 'local';
export const LOCAL_USERNAME = 'you';

export function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export type NewSighting = SightingInput;

/** A page being written: the dive's fields and the animals seen on it (their site and date come from the dive). */
export interface NewDive {
  dive: DiveFields;
  sightings: Omit<NewSighting, 'siteId' | 'sightedOn' | 'diveId'>[];
}

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
  /** Every page of the log on this device (the diver's own; others' dives are never pulled). */
  dives: Dive[];
  /** Page deletions waiting to reach the server. */
  diveDeletions: PendingDeletion[];
  /** Dives each diver logged before ScubaGo, by owner id. */
  divesBefore: Record<string, number>;
  user: { id: string; username: string } | null;
  backendEnabled: boolean;
  /** A sync is running. */
  syncing: boolean;
  /** Why the last sync couldn't run (usually no connection), or null once one succeeds. */
  syncProblem: string | null;
  /**
   * The log couldn't be opened: 'busy' when the web app is open in another tab, otherwise why.
   * Nothing works until it is (init() tries again).
   */
  storageProblem: 'busy' | string | null;
  init: () => Promise<void>;
  /** Logs a sighting; returns whether it was the user's first of this species. */
  addSighting: (input: NewSighting) => Promise<{ sighting: Sighting; isNewSpecies: boolean }>;
  /**
   * Logs several sightings at once (a whole dive). All are checked before any is saved; returns
   * them with the species that are new to the diver's collection, in the order given.
   */
  addSightings: (inputs: NewSighting[]) => Promise<{ sightings: Sighting[]; newSpeciesIds: string[] }>;
  /** Edits one of the user's sightings; returns whether the edit brought a species new to their collection. */
  updateSighting: (id: string, input: NewSighting) => Promise<{ sighting: Sighting; isNewSpecies: boolean }>;
  /** Deletes one of the user's sightings, here at once and on the server as soon as it can. */
  deleteSighting: (id: string) => Promise<void>;
  /**
   * Deletes all of the user's own sightings of one species (its whole log, so it leaves their collection
   * and islands); returns how many went. Their dive pages stay.
   */
  deleteSpeciesLog: (speciesId: string) => Promise<number>;
  /**
   * Writes a page of the log and the sightings made on it. Returns the page, its sightings and the
   * species new to the diver's collection.
   */
  logDive: (input: NewDive) => Promise<{ dive: Dive; sightings: Sighting[]; newSpeciesIds: string[] }>;
  /**
   * Changes a page. A new site or date moves the sightings on it too (and, as with any sighting,
   * voids their confirmations). Returns the page as saved.
   */
  updateDive: (id: string, fields: DiveFields) => Promise<Dive>;
  /** Puts a signature on a page (signed on this phone), or takes it off (null). */
  signDive: (id: string, signature: DiveSignature | null) => Promise<Dive>;
  /** Deletes a page and the sightings on it. */
  deleteDive: (id: string) => Promise<void>;
  /** Sets how many dives the diver logged before ScubaGo, renumbering every page to match. */
  setDivesBefore: (count: number) => Promise<void>;
  /** Sync now (after a change, or when the diver asks). */
  requestSync: () => Promise<void>;
  addSite: (input: NewSite) => Promise<DiveSite>;
  onSignedIn: (user: { id: string; username: string }) => Promise<void>;
  signOutUser: () => Promise<void>;
  /** Permanently deletes the signed-in account, its sightings and photos (server and device). Throws on failure. */
  deleteAccount: () => Promise<void>;
}

/**
 * The device's data as `viewerId` may see it. Every screen reads the store, so none ever shows
 * another diver's private sightings, notes or photos (asSeenBy), or their pages: those are on this
 * device only if that diver signed out here with changes still to sync.
 */
function forViewer<T extends Pick<LocalData, 'sightings' | 'dives'>>(local: T, viewerId: string): T {
  return {
    ...local,
    sightings: local.sightings.flatMap((s) => asSeenBy(s, viewerId) ?? []),
    dives: local.dives.filter((d) => d.userId === viewerId),
  };
}

export const useAppStore = create<StoreState>((set, get) => {
  /** Owner of "my" rows: the signed-in user, or the device before sign-in. */
  const ownerId = () => get().user?.id ?? LOCAL_USER_ID;

  /** Read the database again, as the diver now using the app may see it. */
  const reload = async () => set(forViewer(await loadAll(), ownerId()));

  const checkInput = (input: NewSighting) => {
    const problem = validateSightingInput(input, {
      species: (id) => CATALOG_BY_ID.has(id),
      site: (id) => SITES_BY_ID.has(id) || get().userSites.some((s) => s.id === id),
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
      // Signed out while this ran: what it pulled for them goes too.
      if (get().user?.id !== owner.id) await forgetSyncedUserData(owner.id).catch(() => undefined);
      set({ syncing: false, ...forViewer(await loadAll(), ownerId()) });
      // Sightings from an older version of the app on another phone get their pages here.
      if (await bindLoose().catch(() => false)) void scheduler.request();
    }
  });

  /**
   * Put the diver's sightings that belong to no page (logged before dives, or by an older version of
   * the app) onto past pages, one per site and day. Returns whether anything changed.
   */
  const bindLoose = async (): Promise<boolean> => {
    const owner = ownerId();
    const { sightings, dives, divesBefore } = get();
    const bound = bindPastSightings(owner, sightings, dives.filter((d) => d.userId === owner), divesBefore[owner] ?? 0, new Date().toISOString());
    if (bound.links.length === 0) return false;
    await bindSightingsToDives(bound.dives, bound.links);
    await reload();
    return true;
  };

  const myDive = (id: string) => {
    const dive = get().dives.find((d) => d.id === id);
    if (!dive || dive.userId !== ownerId()) throw new Error('This dive isn’t in your log.');
    return dive;
  };

  const checkDive = (fields: DiveFields) => {
    const problem = validateDive(fields, {
      site: (id) => SITES_BY_ID.has(id) || get().userSites.some((s) => s.id === id),
      today: localIsoDate(new Date()),
    });
    if (problem) throw new Error(problem);
  };

  return {
    ready: false,
    sightings: [],
    userSites: [],
    deletions: [],
    dives: [],
    diveDeletions: [],
    divesBefore: {},
    user: null,
    backendEnabled: getSupabase() !== null,
    syncing: false,
    syncProblem: null,
    storageProblem: null,

    init: async () => {
      if (get().ready) return;
      // Demo community sightings only keep a local-only build's map alive; with a real backend
      // they would pass for other divers' reports.
      let local: Awaited<ReturnType<typeof initDb>>;
      try {
        local = await initDb({ demo: !get().backendEnabled });
      } catch (e) {
        set({ storageProblem: e instanceof DatabaseBusyError ? 'busy' : errorMessage(e) });
        return;
      }
      set({ ...forViewer(local, ownerId()), ready: true, storageProblem: null });
      // Sightings from before the dive log become past pages (once; new sightings always have a page).
      try {
        await bindLoose();
      } catch (e) {
        console.warn('could not bind past sightings into pages', e);
      }

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
      const { sightings, newSpeciesIds } = await get().addSightings([input]);
      return { sighting: sightings[0], isNewSpecies: newSpeciesIds.length > 0 };
    },

    addSightings: async (inputs) => {
      // A sighting on a page takes the page's site and date.
      inputs = inputs.map((input) => {
        if (!input.diveId) return input;
        const dive = myDive(input.diveId);
        return { ...input, siteId: dive.siteId, sightedOn: dive.divedOn };
      });
      inputs.forEach(checkInput);
      const owner = get().user;
      const mine = get().sightings.filter((s) => s.userId === ownerId());
      const created: Sighting[] = [];
      const newSpeciesIds: string[] = [];
      const now = Date.now();
      inputs.forEach((input, index) => {
        // "Something else" is never a new species: it isn't part of the collection.
        if (input.speciesId !== UNLISTED_ID && isFirstOfSpecies([...mine, ...created], input.speciesId)) {
          newSpeciesIds.push(input.speciesId);
        }
        created.push({
          id: uid('s'),
          userId: ownerId(),
          username: owner?.username ?? LOCAL_USERNAME,
          speciesId: input.speciesId,
          siteId: input.siteId,
          sightedOn: input.sightedOn,
          notes: input.notes?.trim() || undefined,
          photoUri: input.photoUri,
          customName: cleanCustomName(input),
          ...privacyChoice(input),
          ...(input.diveId ? { diveId: input.diveId } : {}),
          isDemo: false,
          synced: false, // stays in the outbox until it reaches the server
          // A millisecond apart, so the dive's sightings keep the order they were picked in.
          createdAt: new Date(now + index).toISOString(),
        });
      });
      for (const sighting of created) await insertSighting(sighting);
      set({ sightings: [...get().sightings, ...created] });
      void get().requestSync();
      return { sightings: created, newSpeciesIds };
    },

    updateSighting: async (id, input) => {
      const before = get().sightings.find((s) => s.id === id);
      if (!before || !canEditSighting(before, ownerId())) throw new Error('You can only edit your own sightings.');
      checkInput(input);
      const others = get().sightings.filter((s) => s.userId === ownerId() && s.id !== id);
      const isNewSpecies =
        input.speciesId !== UNLISTED_ID && input.speciesId !== before.speciesId && isFirstOfSpecies(others, input.speciesId);
      const after = applyEdit(before, input, new Date().toISOString());
      await updateSightingRow(after);
      // A replaced photo that never left the device isn't needed any more.
      if (before.photoUri !== after.photoUri && isLocalPhoto(before.photoUri)) discardKeptPhoto(before.photoUri);
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
      if (!pendingSync && isLocalPhoto(target.photoUri)) discardKeptPhoto(target.photoUri);
      set({
        sightings: get().sightings.filter((s) => s.id !== id),
        deletions: pendingSync ? [...get().deletions, { id, userId: target.userId }] : get().deletions,
      });
      void get().requestSync();
    },

    deleteSpeciesLog: async (speciesId) => {
      const owner = ownerId();
      const targets = get().sightings.filter((s) => s.speciesId === speciesId && canEditSighting(s, owner));
      if (targets.length === 0) return 0;
      const pendingSync = get().user !== null;
      await deleteSightingRows(targets.map((s) => s.id), { pendingSync });
      if (!pendingSync) {
        for (const s of targets) if (isLocalPhoto(s.photoUri)) discardKeptPhoto(s.photoUri);
      }
      const gone = new Set(targets.map((s) => s.id));
      set({
        sightings: get().sightings.filter((s) => !gone.has(s.id)),
        deletions: pendingSync ? [...get().deletions, ...targets.map((s) => ({ id: s.id, userId: s.userId }))] : get().deletions,
      });
      void get().requestSync();
      return targets.length;
    },

    logDive: async ({ dive: fields, sightings: picks }) => {
      const owner = ownerId();
      const clean = cleanDive(fields);
      checkDive(clean);
      const now = new Date();
      const dive: Dive = { ...clean, id: uid('d'), userId: owner, synced: false, createdAt: now.toISOString() };
      const inputs: NewSighting[] = picks.map((p) => ({ ...p, siteId: dive.siteId, sightedOn: dive.divedOn }));
      inputs.forEach(checkInput);
      const mine = get().sightings.filter((s) => s.userId === owner);
      const username = get().user?.username ?? LOCAL_USERNAME;
      const created: Sighting[] = [];
      const newSpeciesIds: string[] = [];
      inputs.forEach((input, index) => {
        if (input.speciesId !== UNLISTED_ID && isFirstOfSpecies([...mine, ...created], input.speciesId)) newSpeciesIds.push(input.speciesId);
        created.push({
          id: uid('s'),
          userId: owner,
          username,
          speciesId: input.speciesId,
          siteId: dive.siteId,
          sightedOn: dive.divedOn,
          notes: input.notes?.trim() || undefined,
          photoUri: input.photoUri,
          customName: cleanCustomName(input),
          ...privacyChoice(input),
          diveId: dive.id,
          isDemo: false,
          synced: false,
          createdAt: new Date(now.getTime() + index + 1).toISOString(),
        });
      });
      await insertDive(dive, created);
      set({ dives: [...get().dives, dive], sightings: [...get().sightings, ...created] });
      void get().requestSync();
      return { dive, sightings: created, newSpeciesIds };
    },

    updateDive: async (id, fields) => {
      const before = myDive(id);
      // A page moved to another site or day loses its signatures: they were given for the old facts
      // (the server does the same, migration 0009). A new number keeps them.
      const moved = before.siteId !== fields.siteId || before.divedOn !== fields.divedOn;
      const clean = cleanDive({ ...fields, signature: moved ? undefined : fields.signature });
      checkDive(clean);
      const now = new Date().toISOString();
      const after: Dive = {
        ...clean,
        id,
        userId: before.userId,
        createdAt: before.createdAt,
        updatedAt: now,
        synced: false,
        ...(before.remoteSignatures && !moved ? { remoteSignatures: before.remoteSignatures } : {}),
      };
      // Its sightings follow the page to a new site or day (and lose any confirmation, as an edit would).
      const onPage = moved ? get().sightings.filter((s) => s.diveId === id && canEditSighting(s, ownerId())) : [];
      const movedSightings = onPage.map((s) => applyEdit(s, { ...s, siteId: after.siteId, sightedOn: after.divedOn }, now));
      await updateDiveRows(after, movedSightings);
      const byId = new Map(movedSightings.map((s) => [s.id, s]));
      set({
        dives: get().dives.map((d) => (d.id === id ? after : d)),
        sightings: byId.size ? get().sightings.map((s) => byId.get(s.id) ?? s) : get().sightings,
      });
      void get().requestSync();
      return after;
    },

    signDive: async (id, signature) => {
      const before = myDive(id);
      const { id: _id, userId: _u, synced: _s, createdAt: _c, updatedAt: _up, syncError: _e, remoteSignatures: _r, ...fields } = before;
      return get().updateDive(id, { ...fields, signature: signature ?? undefined });
    },

    deleteDive: async (id) => {
      const target = myDive(id);
      const sightingIds = get().sightings.filter((s) => s.diveId === id && canEditSighting(s, ownerId())).map((s) => s.id);
      const pendingSync = get().user !== null;
      await deleteDiveRows(id, sightingIds, { pendingSync });
      const gone = new Set(sightingIds);
      if (!pendingSync) {
        for (const s of get().sightings) if (gone.has(s.id) && isLocalPhoto(s.photoUri)) discardKeptPhoto(s.photoUri);
      }
      set({
        dives: get().dives.filter((d) => d.id !== id),
        sightings: get().sightings.filter((s) => !gone.has(s.id)),
        diveDeletions: pendingSync ? [...get().diveDeletions, { id, userId: target.userId }] : get().diveDeletions,
        deletions: pendingSync ? [...get().deletions, ...sightingIds.map((sid) => ({ id: sid, userId: target.userId }))] : get().deletions,
      });
      void get().requestSync();
    },

    setDivesBefore: async (count) => {
      const owner = ownerId();
      const value = Math.max(0, Math.min(99000, Math.floor(count)));
      const delta = value - (get().divesBefore[owner] ?? 0);
      // Never renumber a page below No. 1.
      const lowest = Math.min(...get().dives.filter((d) => d.userId === owner).map((d) => d.number), Infinity);
      if (lowest + delta < 1) throw new Error('That would number a page below No. 1.');
      await saveDivesBefore(owner, value, delta);
      await reload();
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
        createdBy: get().user?.id ?? LOCAL_USER_ID,
      };
      await insertUserSite(site);
      set({ userSites: [...get().userSites, site] });
      void get().requestSync();
      return site;
    },

    onSignedIn: async (user) => {
      set({ user });
      await claimLocalSightings(user.id, user.username);
      await reload();
      await bindLoose().catch((e) => console.warn('could not bind past sightings into pages', e));
      // Failures stay queued and are retried (sync-scheduler.ts).
      await scheduler.wake();
    },

    signOutUser: async () => {
      const client = getSupabase();
      const owner = get().user;
      if (client) {
        try {
          await authSignOut(client);
        } catch (e) {
          console.warn('sign-out failed remotely; clearing local session anyway', e);
        }
      }
      const { sightings, dives } = get();
      set({ user: null, syncProblem: null, ...forViewer({ sightings, dives }, LOCAL_USER_ID) });
      // The device may be shared: what the server has goes from it. Changes still waiting stay,
      // out of sight, until the diver signs back in.
      if (owner) {
        await forgetSyncedUserData(owner.id).catch((e) => console.warn('could not clear the signed-out log', e));
      }
      await reload();
    },

    deleteAccount: async () => {
      const client = getSupabase();
      const owner = get().user;
      if (!client || !owner) return;
      await deleteRemoteAccount(client, owner.id);
      await deleteLocalUserData(owner.id);
      set({ user: null, ...forViewer(await loadAll(), LOCAL_USER_ID) });
    },
  };
});

/** Seeded sites + the user's own additions. */
export function useAllSites(): DiveSite[] {
  const userSites = useAppStore((s) => s.userSites);
  return useMemo(() => (userSites.length === 0 ? SITES : [...SITES, ...userSites]), [userSites]);
}

/**
 * A site by id: a seed or imported site, the diver's own, or an imported site OpenStreetMap no longer
 * lists (retired: never in useAllSites, but a past sighting or dive may still name it).
 */
export function useSiteById(): (id: string | null | undefined) => DiveSite | undefined {
  const userSites = useAppStore((s) => s.userSites);
  return useCallback((id: string | null | undefined) => (id == null ? undefined : SITES_BY_ID.get(id) ?? userSites.find((s) => s.id === id)), [userSites]);
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
  dives: Dive[] = [],
  diveDeletions: PendingDeletion[] = [],
): { count: number; failing: number } {
  if (!userId) return { count: 0, failing: 0 };
  const waiting = [
    ...sightings.filter((s) => s.userId === userId && !s.isDemo && !s.synced),
    ...dives.filter((d) => d.userId === userId && !d.synced),
  ];
  const deleting = [...deletions, ...diveDeletions].filter((d) => d.userId === userId);
  return {
    count: waiting.length + deleting.length,
    failing: waiting.filter((s) => s.syncError).length + deleting.filter((d) => d.syncError).length,
  };
}

export function usePendingChanges(): { count: number; failing: number } {
  const sightings = useAppStore((s) => s.sightings);
  const deletions = useAppStore((s) => s.deletions);
  const dives = useAppStore((s) => s.dives);
  const diveDeletions = useAppStore((s) => s.diveDeletions);
  const userId = useAppStore((s) => s.user?.id);
  return pendingChanges(sightings, deletions, userId, dives, diveDeletions);
}

/** The diver's own pages (the signed-in diver's, or this device's before sign-in). */
export function useMyDives(): Dive[] {
  const dives = useAppStore((s) => s.dives);
  const mineId = useMyUserId();
  return useMemo(() => dives.filter((d) => d.userId === mineId), [dives, mineId]);
}

/** How many dives the diver logged before ScubaGo. */
export function useDivesBefore(): number {
  const mineId = useMyUserId();
  return useAppStore((s) => s.divesBefore[mineId] ?? 0);
}

/** The number the diver's next page will get. */
export function useNextDiveNumber(): number {
  const dives = useMyDives();
  const before = useDivesBefore();
  return nextDiveNumber(dives, before);
}
