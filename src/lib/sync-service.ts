import type { SupabaseClient } from '@supabase/supabase-js';
import { File } from 'expo-file-system';

import {
  getUnsyncedUserSites,
  loadAll,
  markSitesSynced,
  markSynced,
  upsertSightings,
  upsertUserSites,
} from '@/lib/db';
import {
  drainOutbox,
  pushableSightings,
  remoteRowToSighting,
  remoteSiteRowToSite,
  sightingToRemoteRow,
  siteToRemoteRow,
  type RemoteSightingRow,
  type RemoteSiteRow,
} from '@/lib/sync';
import type { DiveSite, Sighting } from '@/lib/types';

const PULL_LIMIT = 500;

export interface SyncDeps {
  getUnsyncedSightings: () => Promise<Sighting[]>;
  getUnsyncedUserSites: () => Promise<DiveSite[]>;
  markSynced: (ids: string[]) => Promise<void>;
  markSitesSynced: (ids: string[]) => Promise<void>;
  upsertSightings: (sightings: Sighting[]) => Promise<void>;
  upsertUserSites: (sites: DiveSite[]) => Promise<void>;
  uploadPhoto: (client: SupabaseClient, userId: string, sightingId: string, uri: string) => Promise<string>;
}

const CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', heic: 'image/heic', webp: 'image/webp',
};

async function uploadPhotoImpl(
  client: SupabaseClient,
  userId: string,
  sightingId: string,
  uri: string,
): Promise<string> {
  const ext = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
  const path = `${userId}/${sightingId}.${ext}`;
  const bytes = await new File(uri).bytes();
  const { error } = await client.storage
    .from('sighting-photos')
    .upload(path, bytes, { contentType: CONTENT_TYPES[ext] ?? 'image/jpeg', upsert: true });
  if (error) throw error;
  return client.storage.from('sighting-photos').getPublicUrl(path).data.publicUrl;
}

const defaultDeps: SyncDeps = {
  getUnsyncedSightings: async () => (await loadAll()).sightings.filter((s) => !s.synced),
  getUnsyncedUserSites,
  markSynced,
  markSitesSynced,
  upsertSightings,
  upsertUserSites,
  uploadPhoto: uploadPhotoImpl,
};

/**
 * Push the outbox (user sites first — sightings FK them), then pull the latest
 * community sightings + user-added sites into SQLite. Per-item failures stay
 * queued for the next drain; one bad row never blocks the rest (drainOutbox).
 */
export async function syncNow(
  client: SupabaseClient,
  userId: string,
  overrides?: Partial<SyncDeps>,
): Promise<{ pushedSites: number; pushedSightings: number; pulled: number }> {
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
    } catch {
      siteResult.failed.push(site.id);
    }
  }
  await deps.markSitesSynced(siteResult.synced);

  // 2. Push sightings, uploading any local photo first.
  const unsynced = pushableSightings(await deps.getUnsyncedSightings(), userId);
  const sightingResult = await drainOutbox(unsynced, async (s) => {
    let photoUrl: string | null = null;
    if (s.photoUri && !s.photoUri.startsWith('http')) {
      photoUrl = await deps.uploadPhoto(client, userId, s.id, s.photoUri);
    }
    const { error } = await client.from('sightings').upsert(sightingToRemoteRow(s, photoUrl));
    if (error) throw error;
  });
  await deps.markSynced(sightingResult.synced);

  // 3. Pull: community + own sightings (restores the log on a fresh install).
  const { data: siteRows, error: sitesError } = await client
    .from('dive_sites')
    .select('id,name,lat,lng,region,country,blurb,notable_species,source')
    .eq('source', 'user');
  if (sitesError) throw sitesError;
  await deps.upsertUserSites((siteRows as RemoteSiteRow[]).map(remoteSiteRowToSite));

  const { data: rows, error: pullError } = await client
    .from('sightings')
    .select('id,user_id,species_id,site_id,sighted_on,notes,photo_url,created_at,profiles(username)')
    .order('created_at', { ascending: false })
    .limit(PULL_LIMIT);
  if (pullError) throw pullError;
  const pulled = (rows as unknown as RemoteSightingRow[]).map(remoteRowToSighting);
  await deps.upsertSightings(pulled);

  return {
    pushedSites: siteResult.synced.length,
    pushedSightings: sightingResult.synced.length,
    pulled: pulled.length,
  };
}
