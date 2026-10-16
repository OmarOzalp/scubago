import { columnsToDive, diveToColumns } from '@/lib/dive-rows';
import { isSignaturePath } from '@/lib/dives';
import { isPrivatePhotoRef, PRIVATE_PHOTO_BUCKET, privatePhotoPath, privatePhotoRef, sharesNotes, sharesPhoto } from '@/lib/privacy';
import type { Dive, DiveSignature, DiveSite, Sighting, SightingStatus, Visibility } from '@/lib/types';

export type PushFn<T extends { id: string } = Sighting> = (item: T) => Promise<void>;

export interface DrainResult {
  synced: string[];
  failed: string[];
  /** Why each failed push failed, by sighting id (shown to the diver). */
  errors: Record<string, string>;
}

/** A readable reason from whatever a failed push threw (Error, PostgREST error object, string). */
export function errorMessage(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  if (e && typeof e === 'object' && 'message' in e && typeof e.message === 'string' && e.message) return e.message;
  return typeof e === 'string' && e ? e : 'Unknown error';
}

/**
 * Push every unsynced item (sighting or page) through `push`, collecting ids that succeeded.
 * Failures are kept in the outbox for the next drain; one failure never blocks the rest.
 */
export async function drainOutbox<T extends { id: string }>(unsynced: T[], push: PushFn<T>): Promise<DrainResult> {
  const synced: string[] = [];
  const failed: string[] = [];
  const errors: Record<string, string> = {};
  for (const item of unsynced) {
    try {
      await push(item);
      synced.push(item.id);
    } catch (e) {
      console.warn(`push failed for ${item.id}`, e);
      failed.push(item.id);
      errors[item.id] = errorMessage(e);
    }
  }
  return { synced, failed, errors };
}

/** Own, unsynced, non-demo sightings — the only rows that ever leave the device. */
export function pushableSightings<T extends Sighting>(all: T[], userId: string): T[] {
  return all.filter((s) => !s.synced && !s.isDemo && s.userId === userId);
}

export interface RemoteSightingRow {
  id: string;
  user_id: string;
  species_id: string;
  site_id: string;
  sighted_on: string;
  notes: string | null;
  photo_url: string | null;
  created_at: string;
  profiles: { username: string } | null;
  /** Set only by the server (migration 0006); absent from projects without it. */
  status?: SightingStatus | null;
  /** The diver's name for a "something else" sighting (migration 0007). */
  custom_name?: string | null;
  /** Who can see it (migration 0008); absent from projects without it, where every sighting is public. */
  visibility?: Visibility | null;
  /** The dive it was made on (migration 0009); absent from projects without it. */
  dive_id?: string | null;
}

/** What only the owner can read about one of their sightings (sighting_details, migration 0008). */
export interface RemoteDetailsRow {
  sighting_id: string;
  user_id: string;
  notes: string | null;
  /** The photo's path in the private bucket. */
  photo_path: string | null;
}

/**
 * The sighting as the public row holds it. Notes and a photo the diver keeps to themselves are left
 * out here, whatever the caller passes: they go to sighting_details and the private bucket instead.
 */
export function sightingToRemoteRow(
  s: Sighting,
  photoUrl: string | null,
): Omit<RemoteSightingRow, 'profiles'> {
  const existingRemotePhoto = s.photoUri?.startsWith('http') ? s.photoUri : null;
  const photo = photoUrl ?? existingRemotePhoto;
  return {
    id: s.id,
    user_id: s.userId,
    species_id: s.speciesId,
    site_id: s.siteId,
    sighted_on: s.sightedOn,
    notes: sharesNotes(s) ? (s.notes ?? null) : null,
    photo_url: sharesPhoto(s) && photo?.startsWith('http') ? photo : null,
    created_at: s.createdAt,
    // Only sent when there is one, so projects without migration 0007 keep syncing everything else.
    ...(s.customName ? { custom_name: s.customName } : {}),
    // Likewise for 0008 (a project without it has only public sightings; see sync-service.ts).
    ...(s.visibility ? { visibility: s.visibility } : {}),
    // And 0009: the dive goes with the sighting once the server has the page (sync-service.ts).
    ...(s.diveId ? { dive_id: s.diveId } : {}),
  };
}

/** The columns an owner may change after logging (the rest are fixed once the row exists). */
export type SightingFacts = Pick<
  RemoteSightingRow,
  'species_id' | 'site_id' | 'sighted_on' | 'notes' | 'photo_url' | 'custom_name' | 'visibility' | 'dive_id'
>;

export function sightingFacts(row: Omit<RemoteSightingRow, 'profiles'>): SightingFacts {
  return {
    species_id: row.species_id,
    site_id: row.site_id,
    sighted_on: row.sighted_on,
    notes: row.notes,
    photo_url: row.photo_url,
    ...(row.custom_name ? { custom_name: row.custom_name } : {}),
    ...(row.visibility ? { visibility: row.visibility } : {}),
    ...('dive_id' in row ? { dive_id: row.dive_id } : {}),
  };
}

/**
 * What only the owner may read: the notes and photo the public row leaves out. Null when nothing is
 * kept back (any earlier details row then goes). `photo` is the photo as it now is on the server.
 */
export function privateDetailsRow(s: Sighting, photo: string | null): RemoteDetailsRow | null {
  const notes = !sharesNotes(s) && s.notes ? s.notes : null;
  const photoPath = !sharesPhoto(s) ? privatePhotoPath(photo, s.userId) : null;
  if (!notes && !photoPath) return null;
  return { sighting_id: s.id, user_id: s.userId, notes, photo_path: photoPath };
}

/**
 * One of the diver's own pulled sightings with what only they can read put back. Anything found in
 * sighting_details was kept private, so it stays private if the sighting is shared later.
 */
export function withPrivateDetails(s: Sighting, details: RemoteDetailsRow | undefined): Sighting {
  const notesPrivate = !!details?.notes;
  const photoPrivate = !!details?.photo_path;
  return {
    ...s,
    ...(notesPrivate ? { notes: details!.notes! } : {}),
    ...(photoPrivate ? { photoUri: privatePhotoRef(details!.photo_path!) } : {}),
    notesPrivate,
    photoPrivate,
  };
}

export function remoteRowToSighting(row: RemoteSightingRow): Sighting {
  return {
    id: row.id,
    userId: row.user_id,
    username: row.profiles?.username ?? 'diver',
    speciesId: row.species_id,
    siteId: row.site_id,
    sightedOn: row.sighted_on,
    notes: row.notes ?? undefined,
    photoUri: row.photo_url ?? undefined,
    isDemo: false,
    synced: true,
    createdAt: new Date(row.created_at).toISOString(),
    ...(row.status ? { status: row.status } : {}),
    // A name left behind after an edit to a catalogue species means nothing any more.
    ...(row.species_id === 'unlisted' && row.custom_name ? { customName: row.custom_name } : {}),
    ...(row.visibility === 'public' || row.visibility === 'private' ? { visibility: row.visibility } : {}),
    ...(row.dive_id ? { diveId: row.dive_id } : {}),
  };
}

// ── Dives (migration 0009) ───────────────────────────────────────────────────

/** A page of the log as the server's dives table holds it: only its owner can read or write it. */
export type RemoteDiveRow = Record<string, unknown> & { id: string; user_id: string; created_at: string; updated_at?: string | null };

/** A signature sent from a buddy's own phone with a code (dive_signatures). */
export interface RemoteDiveSignatureRow {
  dive_id: string;
  signer_name: string;
  role: string | null;
  signature_svg: string | null;
  created_at: string;
}

export function diveToRemoteRow(d: Dive): RemoteDiveRow {
  return {
    id: d.id,
    user_id: d.userId,
    created_at: d.createdAt,
    updated_at: d.updatedAt ?? d.createdAt,
    ...diveToColumns(d, 'array'),
  };
}

/** The columns an owner may change once the page exists (id, owner and creation time are fixed). */
export function diveFacts(row: RemoteDiveRow): Record<string, unknown> {
  const { id: _id, user_id: _user, created_at: _created, ...facts } = row;
  return facts;
}

const SIGNER_ROLES = new Set(['buddy', 'instructor', 'divemaster', 'guide', 'other']);

export function remoteRowToDive(row: RemoteDiveRow, signatures: RemoteDiveSignatureRow[] = []): Dive {
  const remoteSignatures: DiveSignature[] = signatures
    .filter((x) => x.dive_id === row.id)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((x) => ({
      name: x.signer_name,
      at: new Date(x.created_at).toISOString(),
      // Drawn on someone else's phone: only path data the app understands is kept.
      ...(isSignaturePath(x.signature_svg ?? undefined) ? { svg: x.signature_svg! } : {}),
      ...(x.role && SIGNER_ROLES.has(x.role) ? { role: x.role as DiveSignature['role'] } : {}),
    }));
  return {
    ...columnsToDive(row),
    id: row.id,
    userId: row.user_id,
    synced: true,
    createdAt: new Date(row.created_at).toISOString(),
    ...(row.updated_at ? { updatedAt: new Date(row.updated_at).toISOString() } : {}),
    ...(remoteSignatures.length ? { remoteSignatures } : {}),
  };
}

export interface RemoteSiteRow {
  id: string;
  name: string;
  lat: number;
  lng: number;
  region: string;
  country: string;
  blurb: string;
  notable_species: string[];
  source: 'seed' | 'user';
  created_by?: string | null;
}

export function siteToRemoteRow(
  site: DiveSite,
  createdBy: string,
): RemoteSiteRow & { created_by: string } {
  return {
    id: site.id,
    name: site.name,
    lat: site.lat,
    lng: site.lng,
    region: site.region,
    country: site.country,
    blurb: site.blurb,
    notable_species: site.notableSpecies,
    source: 'user',
    created_by: createdBy,
  };
}

export function remoteSiteRowToSite(row: RemoteSiteRow): DiveSite {
  return {
    id: row.id,
    name: row.name,
    lat: row.lat,
    lng: row.lng,
    region: row.region,
    country: row.country,
    blurb: row.blurb,
    notableSpecies: row.notable_species,
    source: row.source,
    ...(row.created_by ? { createdBy: row.created_by } : {}),
  };
}

export const PHOTO_BUCKET = 'sighting-photos';

export const PHOTO_CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', heic: 'image/heic', webp: 'image/webp',
};

/** The image type from a local file's name (a web blob: URI has none, and the picker's default is JPEG). */
export function photoExtension(uri: string): string {
  const name = uri.split(/[?#]/)[0].split('/').pop() ?? '';
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
  return ext in PHOTO_CONTENT_TYPES ? ext : 'jpg';
}

/** FNV-1a: a short, stable tag for a local file, so a retried upload reuses its path. */
function fileTag(uri: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < uri.length; i++) {
    hash ^= uri.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

/**
 * Where a sighting's photo goes in the bucket: `<uid>/<sighting-id>-<tag>.<ext>`. The folder is the
 * Storage RLS contract (users write only under their own id). The tag differs for each photo, so a
 * replaced photo gets a new public URL instead of a cached copy of the old one, and the same file
 * always maps to the same path, so retrying an upload never leaves a copy behind.
 */
export function photoObjectPath(userId: string, sightingId: string, uri: string): string {
  return `${userId}/${sightingId}-${fileTag(uri)}.${photoExtension(uri)}`;
}

/**
 * The bucket path behind one of this user's public photo URLs, or null for anything else (another
 * user's photo, another host's URL): only the owner's own files are ever removed.
 */
export function ownPhotoPath(url: string | undefined, userId: string): string | null {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${PHOTO_BUCKET}/`;
  const at = url.indexOf(marker);
  if (at < 0) return null;
  let path: string;
  try {
    path = decodeURIComponent(url.slice(at + marker.length).split(/[?#]/)[0]);
  } catch {
    return null;
  }
  const [folder, file, ...rest] = path.split('/');
  if (folder !== userId || !file || rest.length > 0 || file.startsWith('.')) return null;
  return path;
}

/** Where one of this user's photos is stored, from its public URL or private ref; null for anything else. */
export function storedPhoto(
  ref: string | undefined | null,
  userId: string,
): { bucket: typeof PHOTO_BUCKET | typeof PRIVATE_PHOTO_BUCKET; path: string } | null {
  if (isPrivatePhotoRef(ref)) {
    const path = privatePhotoPath(ref, userId);
    return path ? { bucket: PRIVATE_PHOTO_BUCKET, path } : null;
  }
  const path = ownPhotoPath(ref ?? undefined, userId);
  return path ? { bucket: PHOTO_BUCKET, path } : null;
}

/**
 * A sighting's photo as it may be shown to `viewerId`. Divers see their own photos wherever they
 * are; another diver's photo is shown only from that diver's folder in ScubaGo's own bucket, never
 * from an arbitrary address (anyone can write any URL into their row, and loading it would tell
 * that server who is looking).
 */
export function displayablePhoto(
  s: Pick<Sighting, 'photoUri' | 'userId'>,
  viewerId: string,
  supabaseUrl: string | undefined,
): string | undefined {
  if (!s.photoUri) return undefined;
  if (s.userId === viewerId) return s.photoUri;
  if (!supabaseUrl) return undefined;
  const base = `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/${PHOTO_BUCKET}/`;
  return s.photoUri.startsWith(base) && ownPhotoPath(s.photoUri, s.userId) ? s.photoUri : undefined;
}
