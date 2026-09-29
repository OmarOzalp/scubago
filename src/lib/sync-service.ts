import type { SupabaseClient } from '@supabase/supabase-js';
import { File } from 'expo-file-system';

import {
  forgetSighting,
  getSightingOutbox,
  getUnsyncedUserSites,
  markDeletionSynced,
  markPushed,
  markSitesSynced,
  markSyncFailed,
  mergePulledSightings,
  upsertUserSites,
  type OutboxSighting,
  type PullScope,
} from '@/lib/db';
import { discardKeptPhoto } from '@/lib/photo-files';
import {
  drainOutbox,
  ownPhotoPath,
  PHOTO_BUCKET,
  PHOTO_CONTENT_TYPES,
  photoExtension,
  photoObjectPath,
  pushableSightings,
  remoteRowToSighting,
  remoteSiteRowToSite,
  sightingFacts,
  sightingToRemoteRow,
  siteToRemoteRow,
  type RemoteSightingRow,
  type RemoteSiteRow,
} from '@/lib/sync';
import type { DiveSite, Sighting } from '@/lib/types';

const PULL_LIMIT = 500;
const OWN_PULL_LIMIT = 2000;
const SIGHTING_COLUMNS = 'id,user_id,species_id,site_id,sighted_on,notes,photo_url,created_at,profiles(username)';

export interface SyncDeps {
  getUnsyncedUserSites: () => Promise<DiveSite[]>;
  markSitesSynced: (ids: string[]) => Promise<void>;
  upsertUserSites: (sites: DiveSite[]) => Promise<void>;
  getSightingOutbox: (userId: string) => Promise<OutboxSighting[]>;
  /** Returns false if the sighting changed meanwhile (it stays queued with the newer change). */
  markPushed: (id: string, version: number, photoUrl: string | null) => Promise<boolean>;
  markSyncFailed: (id: string, message: string) => Promise<void>;
  markDeletionSynced: (id: string) => Promise<void>;
  forgetSighting: (id: string) => Promise<void>;
  mergePulledSightings: (pulled: Sighting[], scope: PullScope) => Promise<unknown>;
  uploadPhoto: (client: SupabaseClient, userId: string, sightingId: string, uri: string) => Promise<string>;
  removePhotos: (client: SupabaseClient, paths: string[]) => Promise<void>;
  /** Tidy up the device's own copy of a photo once the server has it (or it's deleted). */
  discardLocalPhoto: (uri: string) => void;
}

/** The photo a queued sighting points at is no longer on the device. */
export class MissingPhotoError extends Error {
  constructor() {
    super('The photo is no longer on this device.');
  }
}

async function uploadPhotoImpl(
  client: SupabaseClient,
  userId: string,
  sightingId: string,
  uri: string,
): Promise<string> {
  const path = photoObjectPath(userId, sightingId, uri);
  const file = new File(uri);
  if (!file.exists) throw new MissingPhotoError();
  const { error } = await client.storage
    .from(PHOTO_BUCKET)
    .upload(path, await file.bytes(), { contentType: PHOTO_CONTENT_TYPES[photoExtension(uri)], upsert: true });
  if (error) throw error;
  return client.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}

async function removePhotosImpl(client: SupabaseClient, paths: string[]): Promise<void> {
  // Removing a file that isn't there is not an error, so a retry is harmless.
  const { error } = await client.storage.from(PHOTO_BUCKET).remove(paths);
  if (error) throw error;
}

const defaultDeps: SyncDeps = {
  getUnsyncedUserSites,
  markSitesSynced,
  upsertUserSites,
  getSightingOutbox,
  markPushed,
  markSyncFailed,
  markDeletionSynced,
  forgetSighting,
  mergePulledSightings,
  uploadPhoto: uploadPhotoImpl,
  removePhotos: removePhotosImpl,
  discardLocalPhoto: discardKeptPhoto,
};

const isLocalFile = (uri: string | undefined): uri is string => !!uri && !uri.startsWith('http');

/**
 * Send one new or edited sighting. Every step can be repeated safely: the photo path is fixed for a
 * given file, a new row is inserted only if it isn't there yet, and an existing row is updated.
 * Returns 'dropped' if the sighting turned out to be deleted on the server by another device.
 */
async function pushSighting(
  client: SupabaseClient,
  userId: string,
  s: OutboxSighting,
  deps: SyncDeps,
): Promise<'pushed' | 'dropped'> {
  let photoUrl: string | null = s.photoUri ?? null;
  if (isLocalFile(s.photoUri)) {
    try {
      photoUrl = await deps.uploadPhoto(client, userId, s.id, s.photoUri);
    } catch (e) {
      if (!(e instanceof MissingPhotoError)) throw e;
      // Don't hold the sighting back forever for a photo that's gone.
      console.warn(`sighting ${s.id}: photo missing from the device; syncing without it`);
      photoUrl = null;
    }
  }
  const row = sightingToRemoteRow(s, photoUrl);

  let saved = false;
  if (!s.remote) {
    // New here. If an earlier push landed without us hearing back, the row is already there:
    // leave it alone and update it below.
    const { data, error } = await client
      .from('sightings')
      .upsert(row, { onConflict: 'id', ignoreDuplicates: true })
      .select('id');
    if (error) throw error;
    saved = (data?.length ?? 0) > 0;
  }
  if (!saved) {
    // Only what an owner may change; the id, owner and creation time are fixed.
    const { data, error } = await client
      .from('sightings')
      .update(sightingFacts(row))
      .eq('id', s.id)
      .eq('user_id', userId)
      .select('id');
    if (error) throw error;
    if ((data?.length ?? 0) === 0) {
      if (!s.remote) throw new Error('Another sighting on the server already uses this id.');
      // Deleted on another device: the deletion wins over this device's edit.
      const orphans = new Set([ownPhotoPath(photoUrl ?? undefined, userId), ownPhotoPath(s.syncedPhotoUrl, userId)]);
      const paths = [...orphans].filter((p): p is string => !!p);
      if (paths.length > 0) await deps.removePhotos(client, paths).catch(() => undefined);
      await deps.forgetSighting(s.id);
      if (isLocalFile(s.photoUri)) deps.discardLocalPhoto(s.photoUri);
      return 'dropped';
    }
  }

  // The server no longer points at the photo it had: remove the file (if this fails, the whole
  // push is retried, and every step above repeats harmlessly).
  const stale = ownPhotoPath(s.syncedPhotoUrl, userId);
  if (stale && s.syncedPhotoUrl !== photoUrl) await deps.removePhotos(client, [stale]);

  // The device's copy of the photo can go once the row points at the uploaded one (not before: a
  // newer edit still waiting may need the file for its own push).
  const done = await deps.markPushed(s.id, s.version, photoUrl);
  if (done && isLocalFile(s.photoUri) && photoUrl) deps.discardLocalPhoto(s.photoUri);
  return 'pushed';
}

/** Delete one sighting on the server, photo first. Deleting what's already gone is not an error. */
async function deleteSightingRemote(
  client: SupabaseClient,
  userId: string,
  s: OutboxSighting,
  deps: SyncDeps,
): Promise<void> {
  const paths = new Set<string>();
  for (const url of [s.syncedPhotoUrl, s.photoUri]) {
    const path = ownPhotoPath(url, userId);
    if (path) paths.add(path);
  }
  // A push whose reply never arrived may have uploaded the local photo.
  if (isLocalFile(s.photoUri)) paths.add(photoObjectPath(userId, s.id, s.photoUri));
  if (paths.size > 0) await deps.removePhotos(client, [...paths]);

  const { error } = await client.from('sightings').delete().eq('id', s.id).eq('user_id', userId);
  if (error) throw error;
  await deps.markDeletionSynced(s.id);
  if (isLocalFile(s.photoUri)) deps.discardLocalPhoto(s.photoUri);
}

export interface SyncResult {
  pushedSites: number;
  pushedSightings: number;
  deletedSightings: number;
  /** Local edits dropped because the sighting was deleted on another device. */
  droppedSightings: number;
  /** Changes that couldn't be sent this time (they stay queued, with the reason). */
  failed: number;
  pulled: number;
}

/**
 * Push the outbox (user sites first — sightings FK them), then pull the latest community
 * sightings + user-added sites into SQLite. Per-item failures stay queued with their reason for
 * the next run; one bad row never blocks the rest (drainOutbox).
 */
export async function syncNow(
  client: SupabaseClient,
  userId: string,
  overrides?: Partial<SyncDeps>,
): Promise<SyncResult> {
  const deps: SyncDeps = { ...defaultDeps, ...overrides };

  // 1. Push user-added sites (ignoreDuplicates: dive_sites has no owner UPDATE
  //    policy, so ON CONFLICT DO NOTHING keeps RLS happy on re-push).
  const sites = await deps.getUnsyncedUserSites();
  const siteResult = { synced: [] as string[], failed: [] as string[] };
  for (const site of sites) {
    try {
      const { error } = await client
        .from('dive_sites')
        .upsert(siteToRemoteRow(site, userId), { onConflict: 'id', ignoreDuplicates: true });
      if (error) throw error;
      siteResult.synced.push(site.id);
    } catch (e) {
      console.warn(`push failed for site ${site.id}`, e);
      siteResult.failed.push(site.id);
    }
  }
  await deps.markSitesSynced(siteResult.synced);

  // 2. Send the diver's changes: new and edited sightings, then deletions.
  const outbox = pushableSightings(await deps.getSightingOutbox(userId), userId);
  let pushed = 0;
  let deleted = 0;
  let dropped = 0;
  const sightingResult = await drainOutbox(outbox, async (s) => {
    if (s.deleted) {
      await deleteSightingRemote(client, userId, s, deps);
      deleted++;
    } else if ((await pushSighting(client, userId, s, deps)) === 'dropped') {
      dropped++;
    } else {
      pushed++;
    }
  });
  for (const id of sightingResult.failed) await deps.markSyncFailed(id, sightingResult.errors[id]);

  // 3. Pull: community + own sightings (restores the log on a fresh install).
  const { data: siteRows, error: sitesError } = await client
    .from('dive_sites')
    .select('id,name,lat,lng,region,country,blurb,notable_species,source')
    .eq('source', 'user');
  if (sitesError) throw sitesError;
  await deps.upsertUserSites((siteRows as RemoteSiteRow[]).map(remoteSiteRowToSite));

  const { data: rows, error: pullError } = await client
    .from('sightings')
    .select(SIGHTING_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(PULL_LIMIT);
  if (pullError) throw pullError;

  // The community pull above is a global top-N, so a user with more than PULL_LIMIT
  // sightings across the whole app can have their own rows fall out of it. Pull the
  // user's own log directly (a much higher cap) so a reinstall always restores it in
  // full, independent of how much community activity exists.
  const { data: ownRows, error: ownError } = await client
    .from('sightings')
    .select(SIGHTING_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(OWN_PULL_LIMIT);
  if (ownError) throw ownError;

  const community = rows as unknown as RemoteSightingRow[];
  const own = ownRows as unknown as RemoteSightingRow[];
  const byId = new Map<string, RemoteSightingRow>();
  for (const row of community) byId.set(row.id, row);
  for (const row of own) byId.set(row.id, row);
  const pulled = [...byId.values()].map(remoteRowToSighting);
  await deps.mergePulledSightings(pulled, {
    ownerId: userId,
    ownComplete: own.length < OWN_PULL_LIMIT,
    communitySince:
      community.length < PULL_LIMIT ? null : new Date(community[community.length - 1].created_at).toISOString(),
  });

  return {
    pushedSites: siteResult.synced.length,
    pushedSightings: pushed,
    deletedSightings: deleted,
    droppedSightings: dropped,
    failed: sightingResult.failed.length + siteResult.failed.length,
    pulled: pulled.length,
  };
}
