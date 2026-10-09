import type { DiveSite, Sighting, SightingStatus } from '@/lib/types';

export type PushFn<T extends Sighting = Sighting> = (sighting: T) => Promise<void>;

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
 * Push every unsynced sighting through `push`, collecting ids that succeeded.
 * Failures are kept in the outbox for the next drain; one failure never blocks the rest.
 */
export async function drainOutbox<T extends Sighting>(unsynced: T[], push: PushFn<T>): Promise<DrainResult> {
  const synced: string[] = [];
  const failed: string[] = [];
  const errors: Record<string, string> = {};
  for (const sighting of unsynced) {
    try {
      await push(sighting);
      synced.push(sighting.id);
    } catch (e) {
      console.warn(`push failed for sighting ${sighting.id}`, e);
      failed.push(sighting.id);
      errors[sighting.id] = errorMessage(e);
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
}

export function sightingToRemoteRow(
  s: Sighting,
  photoUrl: string | null,
): Omit<RemoteSightingRow, 'profiles'> {
  const existingRemotePhoto = s.photoUri?.startsWith('http') ? s.photoUri : null;
  return {
    id: s.id,
    user_id: s.userId,
    species_id: s.speciesId,
    site_id: s.siteId,
    sighted_on: s.sightedOn,
    notes: s.notes ?? null,
    photo_url: photoUrl ?? existingRemotePhoto,
    created_at: s.createdAt,
  };
}

/** The columns an owner may change after logging (the rest are fixed once the row exists). */
export type SightingFacts = Pick<RemoteSightingRow, 'species_id' | 'site_id' | 'sighted_on' | 'notes' | 'photo_url'>;

export function sightingFacts(row: Omit<RemoteSightingRow, 'profiles'>): SightingFacts {
  return {
    species_id: row.species_id,
    site_id: row.site_id,
    sighted_on: row.sighted_on,
    notes: row.notes,
    photo_url: row.photo_url,
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
