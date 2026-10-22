import type { SupabaseClient } from '@supabase/supabase-js';
import { File } from 'expo-file-system';

import {
  forgetDive,
  forgetSighting,
  getDiveOutbox,
  getRemoteDiveIds,
  getSightingOutbox,
  getUnsyncedUserSites,
  markDeletionSynced,
  markDiveDeletionSynced,
  markDivePushed,
  markDiveSyncFailed,
  markPushed,
  markSitesSynced,
  markSyncFailed,
  mergePulledDives,
  mergePulledSightings,
  upsertUserSites,
  type OutboxDive,
  type OutboxSighting,
  type PullScope,
} from '@/lib/db';
import { discardKeptPhoto } from '@/lib/photo-files';
import { isLocalPhoto, PRIVATE_PHOTO_BUCKET, PrivacyNotReadyError, privatePhotoRef, sharesPhoto } from '@/lib/privacy';
import {
  diveFacts,
  diveToRemoteRow,
  drainOutbox,
  PHOTO_BUCKET,
  PHOTO_CONTENT_TYPES,
  photoExtension,
  photoObjectPath,
  privateDetailsRow,
  pushableSightings,
  remoteRowToDive,
  remoteRowToSighting,
  remoteSiteRowToSite,
  sightingFacts,
  sightingToRemoteRow,
  siteToRemoteRow,
  storedPhoto,
  withPrivateDetails,
  type RemoteDetailsRow,
  type RemoteDiveRow,
  type RemoteDiveSignatureRow,
  type RemoteSightingRow,
  type RemoteSiteRow,
} from '@/lib/sync';
import type { Dive, DiveSite, Sighting, Visibility } from '@/lib/types';

/** The public photo bucket, or the private one (migration 0008) that only each photo's owner can read. */
export type PhotoBucket = typeof PHOTO_BUCKET | typeof PRIVATE_PHOTO_BUCKET;

const PULL_LIMIT = 500;
const OWN_PULL_LIMIT = 2000;
const SIGHTING_COLUMNS = 'id,user_id,species_id,site_id,sighted_on,notes,photo_url,created_at,profiles(username)';
/**
 * Columns later migrations add: status (0006), custom_name (0007) and visibility (0008). A project
 * that doesn't have one yet answers 42703 ("no such column"); pulls then carry on without it for the
 * rest of the session, so sightings sync as before (unverified, "something else" without its name,
 * and every sighting public).
 */
const OPTIONAL_COLUMNS = ['status', 'custom_name', 'visibility', 'dive_id'] as const;
const missingColumns = new Set<string>();

type PostgrestError = { code?: string; message?: string; details?: string };
type PostgrestReply = { data: unknown; error: PostgrestError | null };

/** A write naming a column the project doesn't have (PostgREST checks its schema cache first). */
const isMissingColumn = (error: { code?: string } | null, column: string, message = '') =>
  (error?.code === '42703' || error?.code === 'PGRST204') && message.includes(column);

/** The project has no sighting_details table (no migration 0008). */
const isMissingTable = (error: { code?: string } | null) => error?.code === 'PGRST205' || error?.code === '42P01';

/**
 * The server has no row for the dive site (dives.site_id and sightings.site_id point at dive_sites):
 * a catalogue site added since the project's owner last ran the seed, or a diver's own site whose
 * upload failed this time. Postgres names the column in the details, and the constraint in the message.
 */
const isMissingSite = (error: PostgrestError | null) =>
  error?.code === '23503' && /site_id|dive_sites/.test(`${error.message ?? ''} ${error.details ?? ''}`);

/** The project has no private photo bucket (no migration 0008). */
const isMissingBucket = (error: { message?: string } | null) => /bucket not found/i.test(error?.message ?? '');

/**
 * Write a sighting row. A project without migration 0008 has no visibility column, and every
 * sighting there is public: a public one is written without it, and a private one isn't written at
 * all (it waits, with the reason, until the server is ready). A private one always asks the server,
 * so it goes as soon as the migration is applied. A project without migration 0009 has no dive_id
 * column: the sighting goes without its dive (it keeps it here, and sends it once the server can).
 */
async function writeRow<T extends { visibility?: Visibility | null; dive_id?: string | null }>(
  row: T,
  write: (row: T) => PromiseLike<PostgrestReply>,
): Promise<{ id: string }[] | null> {
  for (;;) {
    let out = row;
    if (row.visibility === 'public' && missingColumns.has('visibility')) {
      const { visibility: _, ...rest } = out;
      out = rest as T;
    }
    if ('dive_id' in out && missingColumns.has('dive_id')) {
      const { dive_id: _, ...rest } = out;
      out = rest as T;
    }
    const { data, error } = await write(out);
    if ('visibility' in out && isMissingColumn(error, 'visibility', error?.message)) {
      missingColumns.add('visibility');
      if (out.visibility === 'private') throw new PrivacyNotReadyError();
      continue;
    }
    if ('dive_id' in out && isMissingColumn(error, 'dive_id', error?.message)) {
      missingColumns.add('dive_id');
      continue;
    }
    if (error) throw isMissingSite(error) ? new SiteNotOnServerError('sighting') : error;
    // The column is there (the migration may have been applied since): pulls ask for it again.
    if ('visibility' in out) missingColumns.delete('visibility');
    if ('dive_id' in out) missingColumns.delete('dive_id');
    return data as { id: string }[] | null;
  }
}

/** The project has no dive log yet (migration 0009): pages wait on this device, with this reason. */
export class DiveLogNotReadyError extends Error {
  constructor() {
    super('Waiting for the server to be updated for the dive log; your pages are safe on this device.');
    this.name = 'DiveLogNotReadyError';
  }
}

/**
 * The server doesn't have the dive site yet (isMissingSite): the page or sighting waits on this
 * device and goes up on a later sync, once the site is there. Nothing is lost.
 */
export class SiteNotOnServerError extends Error {
  constructor(what: 'page' | 'sighting') {
    super(`The server doesn’t have this dive site yet, so the ${what} is waiting on this device`);
    this.name = 'SiteNotOnServerError';
  }
}

/** A sighting whose page couldn't reach the server this time: it waits so it never points at nothing. */
export class DiveNotSyncedError extends Error {
  constructor() {
    super('Waiting for its dive to sync.');
    this.name = 'DiveNotSyncedError';
  }
}

/** Pull sightings with whichever optional columns this project has. */
async function pullSightings(
  query: (columns: string) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>,
): Promise<RemoteSightingRow[]> {
  for (;;) {
    const optional = OPTIONAL_COLUMNS.filter((c) => !missingColumns.has(c));
    const { data, error } = await query([SIGHTING_COLUMNS, ...optional].join(','));
    if (!error) return data as RemoteSightingRow[];
    if (error.code !== '42703' || optional.length === 0) throw error;
    // Postgres names the missing column; if it somehow doesn't, drop the newest one.
    missingColumns.add(optional.find((c) => error.message?.includes(c)) ?? optional[optional.length - 1]);
  }
}

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
  getDiveOutbox: (userId: string) => Promise<OutboxDive[]>;
  /** The diver's pages the server already has. */
  getRemoteDiveIds: (userId: string) => Promise<Set<string>>;
  markDivePushed: (id: string, version: number) => Promise<boolean>;
  markDiveSyncFailed: (id: string, message: string) => Promise<void>;
  markDiveDeletionSynced: (id: string) => Promise<void>;
  forgetDive: (id: string) => Promise<void>;
  mergePulledDives: (pulled: Dive[], ownerId: string, complete: boolean) => Promise<unknown>;
  /** Upload a photo from the device; returns what the sighting points at (a public URL, or a private ref). */
  uploadPhoto: (client: SupabaseClient, userId: string, sightingId: string, uri: string, bucket: PhotoBucket) => Promise<string>;
  /** Copy one of the diver's uploaded photos to the other bucket, at the same path. */
  copyPhoto: (client: SupabaseClient, path: string, from: PhotoBucket, to: PhotoBucket) => Promise<void>;
  removePhotos: (client: SupabaseClient, paths: string[], bucket?: PhotoBucket) => Promise<void>;
  /** Tidy up the device's own copy of a photo once the server has it (or it's deleted). */
  discardLocalPhoto: (uri: string) => void;
}

/** The photo a queued sighting points at is no longer on the device. */
export class MissingPhotoError extends Error {
  constructor() {
    super('The photo is no longer on this device.');
  }
}

/** What a sighting points at for a photo stored at `path`: its public URL, or a private ref. */
export function photoRef(client: SupabaseClient, bucket: PhotoBucket, path: string): string {
  return bucket === PRIVATE_PHOTO_BUCKET ? privatePhotoRef(path) : client.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}

async function uploadPhotoImpl(
  client: SupabaseClient,
  userId: string,
  sightingId: string,
  uri: string,
  bucket: PhotoBucket,
): Promise<string> {
  const path = photoObjectPath(userId, sightingId, uri);
  const file = new File(uri);
  if (!file.exists) throw new MissingPhotoError();
  const { error } = await client.storage
    .from(bucket)
    .upload(path, await file.bytes(), { contentType: PHOTO_CONTENT_TYPES[photoExtension(uri)], upsert: true });
  if (error) throw bucket === PRIVATE_PHOTO_BUCKET && isMissingBucket(error) ? new PrivacyNotReadyError() : error;
  return photoRef(client, bucket, path);
}

async function copyPhotoImpl(client: SupabaseClient, path: string, from: PhotoBucket, to: PhotoBucket): Promise<void> {
  const { error } = await client.storage.from(from).copy(path, path, { destinationBucket: to });
  if (!error) return;
  if (isMissingBucket(error)) throw new PrivacyNotReadyError();
  // A retried move: the copy is already there (and the original may already be gone).
  const { data: there } = await client.storage.from(to).exists(path);
  if (!there) throw error;
}

async function removePhotosImpl(client: SupabaseClient, paths: string[], bucket: PhotoBucket = PHOTO_BUCKET): Promise<void> {
  // Removing a file that isn't there is not an error, so a retry is harmless. Without a private
  // bucket (no migration 0008) there is nothing in it to remove.
  const { error } = await client.storage.from(bucket).remove(paths);
  if (error && !(bucket === PRIVATE_PHOTO_BUCKET && isMissingBucket(error))) throw error;
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
  getDiveOutbox,
  getRemoteDiveIds,
  markDivePushed,
  markDiveSyncFailed,
  markDiveDeletionSynced,
  forgetDive,
  mergePulledDives,
  uploadPhoto: uploadPhotoImpl,
  copyPhoto: copyPhotoImpl,
  removePhotos: removePhotosImpl,
  discardLocalPhoto: discardKeptPhoto,
};

/** Remove photos, each from its own bucket. */
async function removeStored(
  client: SupabaseClient,
  photos: ({ bucket: PhotoBucket; path: string } | null)[],
  deps: SyncDeps,
): Promise<void> {
  const byBucket = new Map<PhotoBucket, Set<string>>();
  for (const photo of photos) {
    if (!photo) continue;
    if (!byBucket.has(photo.bucket)) byBucket.set(photo.bucket, new Set());
    byBucket.get(photo.bucket)!.add(photo.path);
  }
  for (const [bucket, paths] of byBucket) await deps.removePhotos(client, [...paths], bucket);
}

/**
 * An uploaded photo, in the bucket the diver's choice now calls for: moved over if they changed who
 * can see it. Returns what the sighting points at. (Anything that isn't the diver's own upload is
 * left where it is; the public row only ever points at a photo the diver shares.)
 */
async function placePhoto(
  client: SupabaseClient,
  userId: string,
  ref: string | null,
  bucket: PhotoBucket,
  deps: SyncDeps,
): Promise<string | null> {
  const stored = storedPhoto(ref, userId);
  if (!stored || stored.bucket === bucket) return ref;
  await deps.copyPhoto(client, stored.path, stored.bucket, bucket);
  return photoRef(client, bucket, stored.path);
}

/**
 * What only the diver may read (sighting_details): kept, replaced, or removed once nothing is kept
 * back any more. A project without the table (no migration 0008) can't keep anything private: the
 * change waits, and nothing private was sent anywhere.
 */
async function saveDetails(client: SupabaseClient, s: Sighting, photo: string | null): Promise<void> {
  const details = privateDetailsRow(s, photo);
  if (details) {
    const { error } = await client
      .from('sighting_details')
      .upsert({ ...details, updated_at: new Date().toISOString() }, { onConflict: 'sighting_id' });
    if (error) throw isMissingTable(error) ? new PrivacyNotReadyError() : error;
    return;
  }
  const { error } = await client.from('sighting_details').delete().eq('sighting_id', s.id);
  if (error && !isMissingTable(error)) throw error;
}

/**
 * Send one new or edited sighting. Every step can be repeated safely: the photo path is fixed for a
 * given file, a new row is inserted only if it isn't there yet, and an existing row is updated.
 * Notes and a photo the diver keeps private go to sighting_details and the private bucket, never to
 * the public row or bucket. Returns 'dropped' if the sighting turned out to be deleted on the server
 * by another device.
 */
async function pushSighting(
  client: SupabaseClient,
  userId: string,
  s: OutboxSighting,
  deps: SyncDeps,
  dives: DiveState,
): Promise<'pushed' | 'dropped'> {
  // 0. Its page must be on the server first (unless the server has no dive log at all yet).
  const sendDive = !!s.diveId && !dives.notReady && !missingColumns.has('dive_id');
  if (sendDive && !dives.remote.has(s.diveId!)) throw new DiveNotSyncedError();
  // 1. The photo, in the bucket for who may see it.
  const bucket: PhotoBucket = sharesPhoto(s) ? PHOTO_BUCKET : PRIVATE_PHOTO_BUCKET;
  let photo: string | null = s.photoUri ?? null;
  if (isLocalPhoto(s.photoUri)) {
    try {
      photo = await deps.uploadPhoto(client, userId, s.id, s.photoUri, bucket);
    } catch (e) {
      if (!(e instanceof MissingPhotoError)) throw e;
      // Don't hold the sighting back forever for a photo that's gone.
      console.warn(`sighting ${s.id}: photo missing from the device; syncing without it`);
      photo = null;
    }
    // An earlier attempt, made while the photo was still shared, may have left a public copy.
    if (photo && bucket === PRIVATE_PHOTO_BUCKET) {
      await deps.removePhotos(client, [photoObjectPath(userId, s.id, s.photoUri)], PHOTO_BUCKET);
    }
  } else {
    photo = await placePhoto(client, userId, photo, bucket, deps);
  }
  const row = sightingToRemoteRow(s, photo);
  if (!sendDive) delete row.dive_id;

  // 2. The row everyone may read (if the sighting is shared).
  let saved = false;
  if (!s.remote) {
    // New here. If an earlier push landed without us hearing back, the row is already there:
    // leave it alone and update it below.
    const data = await writeRow(row, (r) => client.from('sightings').upsert(r, { onConflict: 'id', ignoreDuplicates: true }).select('id'));
    saved = (data?.length ?? 0) > 0;
  }
  if (!saved) {
    // Only what an owner may change; the id, owner and creation time are fixed.
    const data = await writeRow(sightingFacts(row), (r) =>
      client.from('sightings').update(r).eq('id', s.id).eq('user_id', userId).select('id'));
    if ((data?.length ?? 0) === 0) {
      if (!s.remote) throw new Error('Another sighting on the server already uses this id.');
      // Deleted on another device: the deletion wins over this device's edit.
      await removeStored(client, [storedPhoto(photo, userId), storedPhoto(s.syncedPhotoUrl, userId)], deps).catch(() => undefined);
      await deps.forgetSighting(s.id);
      if (isLocalPhoto(s.photoUri)) deps.discardLocalPhoto(s.photoUri);
      return 'dropped';
    }
  }

  // 3. What only the diver may read.
  await saveDetails(client, s, photo);

  // 4. The server no longer points at the photo it had (replaced, removed, or moved to the other
  // bucket): remove the file. If this fails, the whole push is retried, and every step above
  // repeats harmlessly.
  if (s.syncedPhotoUrl !== photo) await removeStored(client, [storedPhoto(s.syncedPhotoUrl, userId)], deps);

  // The device's copy of the photo can go once the row points at the uploaded one (not before: a
  // newer edit still waiting may need the file for its own push).
  const done = await deps.markPushed(s.id, s.version, photo);
  if (done && isLocalPhoto(s.photoUri) && photo) deps.discardLocalPhoto(s.photoUri);
  return 'pushed';
}

/**
 * Delete one sighting on the server, photo first (its private details go with the row). Deleting
 * what's already gone is not an error.
 */
async function deleteSightingRemote(
  client: SupabaseClient,
  userId: string,
  s: OutboxSighting,
  deps: SyncDeps,
): Promise<void> {
  const photos = [storedPhoto(s.syncedPhotoUrl, userId), storedPhoto(s.photoUri, userId)];
  // A push whose reply never arrived may have uploaded the local photo, to either bucket.
  if (isLocalPhoto(s.photoUri)) {
    const path = photoObjectPath(userId, s.id, s.photoUri);
    photos.push({ bucket: PHOTO_BUCKET, path }, { bucket: PRIVATE_PHOTO_BUCKET, path });
  }
  await removeStored(client, photos, deps);

  const { error } = await client.from('sightings').delete().eq('id', s.id).eq('user_id', userId);
  if (error) throw error;
  await deps.markDeletionSynced(s.id);
  if (isLocalPhoto(s.photoUri)) deps.discardLocalPhoto(s.photoUri);
}

/** The diver's own private notes and photos (none on a project without migration 0008). */
async function pullDetails(client: SupabaseClient, userId: string): Promise<Map<string, RemoteDetailsRow>> {
  const { data, error } = await client
    .from('sighting_details')
    .select('sighting_id,user_id,notes,photo_path')
    .eq('user_id', userId)
    .limit(OWN_PULL_LIMIT);
  if (error) {
    if (isMissingTable(error)) return new Map();
    throw error;
  }
  return new Map((data as RemoteDetailsRow[]).map((d) => [d.sighting_id, d]));
}

/** What a sync knows about the diver's pages while it sends sightings. */
interface DiveState {
  /** Pages the server has. */
  remote: Set<string>;
  /** The server has no dive log (migration 0009). */
  notReady: boolean;
}

/** Why a write to dives failed, in the diver's terms where there is one. */
const diveWriteError = (error: PostgrestError) =>
  isMissingTable(error) ? new DiveLogNotReadyError() : isMissingSite(error) ? new SiteNotOnServerError('page') : error;

/** Send one new or edited page; 'dropped' if it was deleted on another device meanwhile. */
async function pushDive(client: SupabaseClient, userId: string, d: OutboxDive, deps: SyncDeps): Promise<'pushed' | 'dropped'> {
  const row = diveToRemoteRow(d);
  let saved = false;
  if (!d.remote) {
    const { data, error } = await client.from('dives').upsert(row, { onConflict: 'id', ignoreDuplicates: true }).select('id');
    if (error) throw diveWriteError(error);
    saved = ((data as unknown[] | null)?.length ?? 0) > 0;
  }
  if (!saved) {
    const { data, error } = await client.from('dives').update(diveFacts(row)).eq('id', d.id).eq('user_id', userId).select('id');
    if (error) throw diveWriteError(error);
    if (((data as unknown[] | null)?.length ?? 0) === 0) {
      if (!d.remote) throw new Error('Another dive on the server already uses this id.');
      await deps.forgetDive(d.id);
      return 'dropped';
    }
  }
  await deps.markDivePushed(d.id, d.version);
  return 'pushed';
}

async function deleteDiveRemote(client: SupabaseClient, userId: string, d: OutboxDive, deps: SyncDeps): Promise<void> {
  const { error } = await client.from('dives').delete().eq('id', d.id).eq('user_id', userId);
  // Nothing to delete on a project without the dive log: the page never left this device.
  if (error && !isMissingTable(error)) throw error;
  await deps.markDiveDeletionSynced(d.id);
}

/** The diver's own pages and the signatures buddies sent for them; null on a project without the dive log. */
async function pullDives(client: SupabaseClient, userId: string): Promise<{ dives: Dive[]; complete: boolean } | null> {
  const { data, error } = await client.from('dives').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(OWN_PULL_LIMIT);
  if (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }
  const rows = data as RemoteDiveRow[];
  const mine = new Set(rows.map((r) => r.id));
  const { data: signed, error: signedError } = await client
    .from('dive_signatures')
    .select('dive_id,signer_name,role,signature_svg,created_at')
    .limit(OWN_PULL_LIMIT);
  if (signedError && !isMissingTable(signedError)) throw signedError;
  // Row-level security also returns pages this diver signed for others: only their own are kept.
  const signatures = ((signed as RemoteDiveSignatureRow[] | null) ?? []).filter((x) => mine.has(x.dive_id));
  return { dives: rows.map((r) => remoteRowToDive(r, signatures)), complete: rows.length < OWN_PULL_LIMIT };
}

export interface SyncResult {
  pushedSites: number;
  pushedDives: number;
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

  // 2. New and edited pages of the log, before the sightings that point at them.
  const diveOutbox = await deps.getDiveOutbox(userId);
  const dives: DiveState = { remote: new Set(), notReady: false };
  let pushedDives = 0;
  const diveResult = await drainOutbox(
    diveOutbox.filter((d) => !d.deleted),
    async (d) => {
      // Once the server says it has no dive log, the rest wait without asking again.
      if (dives.notReady) throw new DiveLogNotReadyError();
      try {
        if ((await pushDive(client, userId, d, deps)) === 'pushed') pushedDives++;
      } catch (e) {
        if (e instanceof DiveLogNotReadyError) dives.notReady = true;
        throw e;
      }
    },
  );
  for (const id of diveResult.failed) await deps.markDiveSyncFailed(id, diveResult.errors[id]);
  dives.remote = await deps.getRemoteDiveIds(userId);

  // 3. Send the diver's changes: new and edited sightings, then deletions.
  const outbox = pushableSightings(await deps.getSightingOutbox(userId), userId);
  let pushed = 0;
  let deleted = 0;
  let dropped = 0;
  const sightingResult = await drainOutbox(outbox, async (s) => {
    if (s.deleted) {
      await deleteSightingRemote(client, userId, s, deps);
      deleted++;
    } else if ((await pushSighting(client, userId, s, deps, dives)) === 'dropped') {
      dropped++;
    } else {
      pushed++;
    }
  });
  for (const id of sightingResult.failed) await deps.markSyncFailed(id, sightingResult.errors[id]);

  // 4. Deleted pages, once their sightings are gone.
  const diveDeletion = await drainOutbox(diveOutbox.filter((d) => d.deleted), (d) => deleteDiveRemote(client, userId, d, deps));
  for (const id of diveDeletion.failed) await deps.markDiveSyncFailed(id, diveDeletion.errors[id]);

  // 5. Pull: the diver's pages first (sightings point at them), then community + own sightings
  // (restores the log on a fresh install).
  const pulledDives = await pullDives(client, userId);
  if (pulledDives) {
    await deps.mergePulledDives(pulledDives.dives, userId, pulledDives.complete);
    // The dive log is there (migration 0009), so sightings.dive_id is too: pulls ask for it again.
    missingColumns.delete('dive_id');
  }

  const { data: siteRows, error: sitesError } = await client
    .from('dive_sites')
    .select('id,name,lat,lng,region,country,blurb,notable_species,source,created_by')
    .eq('source', 'user');
  if (sitesError) throw sitesError;
  await deps.upsertUserSites((siteRows as RemoteSiteRow[]).map(remoteSiteRowToSite));

  const community = await pullSightings((columns) => client
    .from('sightings')
    .select(columns)
    .order('created_at', { ascending: false })
    .limit(PULL_LIMIT));

  // The community pull above is a global top-N, so a user with more than PULL_LIMIT
  // sightings across the whole app can have their own rows fall out of it. Pull the
  // user's own log directly (a much higher cap) so a reinstall always restores it in
  // full, independent of how much community activity exists.
  const own = await pullSightings((columns) => client
    .from('sightings')
    .select(columns)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(OWN_PULL_LIMIT));
  const byId = new Map<string, RemoteSightingRow>();
  for (const row of community) byId.set(row.id, row);
  for (const row of own) byId.set(row.id, row);
  const details = await pullDetails(client, userId);
  const pulled = [...byId.values()]
    .map(remoteRowToSighting)
    .map((s) => (s.userId === userId ? withPrivateDetails(s, details.get(s.id)) : s));
  await deps.mergePulledSightings(pulled, {
    ownerId: userId,
    ownComplete: own.length < OWN_PULL_LIMIT,
    communitySince:
      community.length < PULL_LIMIT ? null : new Date(community[community.length - 1].created_at).toISOString(),
    diveIds: !missingColumns.has('dive_id'),
  });

  return {
    pushedSites: siteResult.synced.length,
    pushedDives,
    pushedSightings: pushed,
    deletedSightings: deleted,
    droppedSightings: dropped,
    failed: sightingResult.failed.length + siteResult.failed.length + diveResult.failed.length + diveDeletion.failed.length,
    pulled: pulled.length,
  };
}
