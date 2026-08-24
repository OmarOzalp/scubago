import type { DiveSite, Sighting } from '@/lib/types';

export type PushFn = (sighting: Sighting) => Promise<void>;

export interface DrainResult {
  synced: string[];
  failed: string[];
}

/**
 * Push every unsynced sighting through `push`, collecting ids that succeeded.
 * Failures are kept in the outbox for the next drain; one failure never blocks the rest.
 *
 * In the vertical slice there is no remote yet — the app calls this with a no-op pusher
 * once Supabase credentials exist (see supabase/README.md).
 */
export async function drainOutbox(unsynced: Sighting[], push: PushFn): Promise<DrainResult> {
  const synced: string[] = [];
  const failed: string[] = [];
  for (const sighting of unsynced) {
    try {
      await push(sighting);
      synced.push(sighting.id);
    } catch {
      failed.push(sighting.id);
    }
  }
  return { synced, failed };
}

/** Own, unsynced, non-demo sightings — the only rows that ever leave the device. */
export function pushableSightings(all: Sighting[], userId: string): Sighting[] {
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
