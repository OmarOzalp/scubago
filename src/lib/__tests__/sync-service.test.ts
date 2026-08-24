import { describe, expect, it } from '@jest/globals';
import { syncNow, type SyncDeps } from '@/lib/sync-service';
import type { DiveSite, Sighting } from '@/lib/types';

const UID = 'uid-1';

function sighting(overrides: Partial<Sighting>): Sighting {
  return {
    id: 's-1', userId: UID, username: 'diver-uid1', speciesId: 'manta',
    siteId: 'site-new', sightedOn: '2026-08-20', isDemo: false, synced: false,
    createdAt: '2026-08-20T10:00:00.000Z', ...overrides,
  };
}

const userSite: DiveSite = {
  id: 'site-new', name: 'Secret Reef', lat: 1, lng: 2, region: '', country: '',
  blurb: '', notableSpecies: [], source: 'user',
};

/** Minimal fake PostgREST/storage surface — records writes, replays pulls. */
function makeFakeClient(pullRows: any[] = [], pullSites: any[] = []) {
  const writes: Record<string, any[]> = { dive_sites: [], sightings: [] };
  const client = {
    from(table: string) {
      return {
        upsert: async (row: any) => { writes[table].push(row); return { error: null }; },
        select: () => ({
          eq: () => Promise.resolve({ data: pullSites, error: null }),
          order: () => ({ limit: () => Promise.resolve({ data: pullRows, error: null }) }),
        }),
      };
    },
  };
  return { client: client as any, writes };
}

function makeDeps(unsyncedSightings: Sighting[], unsyncedSites: DiveSite[]) {
  const calls: Record<string, any[]> = {
    markSynced: [], markSitesSynced: [], upsertSightings: [], upsertUserSites: [],
  };
  const deps: SyncDeps = {
    getUnsyncedSightings: async () => unsyncedSightings,
    getUnsyncedUserSites: async () => unsyncedSites,
    markSynced: async (ids) => { calls.markSynced.push(ids); },
    markSitesSynced: async (ids) => { calls.markSitesSynced.push(ids); },
    upsertSightings: async (s) => { calls.upsertSightings.push(s); },
    upsertUserSites: async (s) => { calls.upsertUserSites.push(s); },
    uploadPhoto: async () => 'https://cdn/uploaded.jpg',
  };
  return { deps, calls };
}

describe('syncNow', () => {
  it('pushes sites before sightings and marks both synced', async () => {
    const { client, writes } = makeFakeClient();
    const { deps, calls } = makeDeps([sighting({})], [userSite]);
    const result = await syncNow(client, UID, deps);
    expect(writes.dive_sites).toHaveLength(1);
    expect(writes.sightings).toHaveLength(1);
    expect(calls.markSitesSynced).toEqual([['site-new']]);
    expect(calls.markSynced).toEqual([['s-1']]);
    expect(result.pushedSites).toBe(1);
    expect(result.pushedSightings).toBe(1);
  });

  it('uploads local photos and sends the public url', async () => {
    const { client, writes } = makeFakeClient();
    const { deps } = makeDeps([sighting({ photoUri: 'file:///p.jpg' })], []);
    await syncNow(client, UID, deps);
    expect(writes.sightings[0].photo_url).toBe('https://cdn/uploaded.jpg');
  });

  it('pulls remote sightings and user sites into the local db', async () => {
    const remoteRow = {
      id: 'r-9', user_id: 'uid-2', species_id: 'manta', site_id: 'blue-corner',
      sighted_on: '2026-08-01', notes: null, photo_url: null,
      created_at: '2026-08-01T09:00:00+00:00', profiles: { username: 'nemo' },
    };
    const remoteSite = {
      id: 'site-x', name: 'X', lat: 3, lng: 4, region: '', country: '',
      blurb: '', notable_species: [], source: 'user',
    };
    const { client } = makeFakeClient([remoteRow], [remoteSite]);
    const { deps, calls } = makeDeps([], []);
    const result = await syncNow(client, UID, deps);
    expect(result.pulled).toBe(1);
    expect(calls.upsertSightings[0][0].username).toBe('nemo');
    expect(calls.upsertUserSites[0][0].id).toBe('site-x');
  });

  it('keeps failed pushes queued without blocking the rest', async () => {
    const { deps, calls } = makeDeps([sighting({ id: 'bad' }), sighting({ id: 'good' })], []);
    const client = {
      from: (table: string) => ({
        upsert: async (row: any) =>
          table === 'sightings' && row.id === 'bad'
            ? { error: { message: 'boom' } }
            : { error: null },
        select: () => ({
          eq: () => Promise.resolve({ data: [], error: null }),
          order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
        }),
      }),
    } as any;
    const result = await syncNow(client, UID, deps);
    expect(calls.markSynced).toEqual([['good']]);
    expect(result.pushedSightings).toBe(1);
  });
});
