import { describe, expect, it } from '@jest/globals';

import type { OutboxSighting, PullScope } from '@/lib/db';
import { syncNow, type SyncDeps } from '@/lib/sync-service';
import type { DiveSite, Sighting } from '@/lib/types';
import { FakeServer } from '@/test-support/fake-supabase';

const UID = 'uid-1';

function outbox(overrides: Partial<OutboxSighting>): OutboxSighting {
  return {
    id: 's-1', userId: UID, username: 'diver-uid1', speciesId: 'manta',
    siteId: 'site-new', sightedOn: '2026-08-20', isDemo: false, synced: false,
    createdAt: '2026-08-20T10:00:00.000Z', deleted: false, remote: false, version: 0, ...overrides,
  };
}

const userSite: DiveSite = {
  id: 'site-new', name: 'Secret Reef', lat: 1, lng: 2, region: '', country: '',
  blurb: '', notableSpecies: [], source: 'user',
};

function remoteRow(overrides: Record<string, unknown>) {
  return {
    id: 'r-9', user_id: 'uid-2', species_id: 'manta', site_id: 'blue-corner',
    sighted_on: '2026-08-01', notes: null, photo_url: null,
    created_at: '2026-08-01T09:00:00+00:00', ...overrides,
  };
}

/** syncNow against the in-memory server, with the local database replaced by recorders. */
function setup(queued: OutboxSighting[], sites: DiveSite[] = []) {
  const server = new FakeServer();
  server.tables.profiles.push({ user_id: UID, username: 'diver-uid1' }, { user_id: 'uid-2', username: 'nemo' });
  const device = server.device('phone', UID);
  const calls = {
    markSitesSynced: [] as string[][], upsertUserSites: [] as DiveSite[][], markPushed: [] as unknown[][],
    markSyncFailed: [] as string[][], markDeletionSynced: [] as string[], merged: [] as [Sighting[], PullScope][],
    uploadPhoto: [] as unknown[][],
  };
  const deps: SyncDeps = {
    getUnsyncedUserSites: async () => sites,
    markSitesSynced: async (ids) => { calls.markSitesSynced.push(ids); },
    upsertUserSites: async (s) => { calls.upsertUserSites.push(s); },
    getSightingOutbox: async () => queued,
    markPushed: async (...args) => { calls.markPushed.push(args); return true; },
    markSyncFailed: async (id, message) => { calls.markSyncFailed.push([id, message]); },
    markDeletionSynced: async (id) => { calls.markDeletionSynced.push(id); },
    forgetSighting: async () => {},
    mergePulledSightings: async (pulled, scope) => { calls.merged.push([pulled, scope]); },
    uploadPhoto: async (client, userId, sightingId, uri) => {
      calls.uploadPhoto.push([client, userId, sightingId, uri]);
      return `https://test-project.supabase.co/storage/v1/object/public/sighting-photos/${userId}/${sightingId}-x.jpg`;
    },
    removePhotos: async (client, paths) => {
      const { error } = await client.storage.from('sighting-photos').remove(paths);
      if (error) throw error;
    },
    discardLocalPhoto: () => {},
  };
  return { server, device, deps, calls, run: () => syncNow(device.client, UID, deps) };
}

describe('syncNow', () => {
  it('pushes sites before sightings and marks both synced', async () => {
    const { server, calls, run } = setup([outbox({})], [userSite]);
    const result = await run();
    const order = server.calls.map((c) => `${c.table}:${c.op}`);
    expect(order.indexOf('dive_sites:upsert')).toBeLessThan(order.indexOf('sightings:upsert'));
    expect(server.sighting('s-1')).toMatchObject({ user_id: UID, species_id: 'manta' });
    expect(calls.markSitesSynced).toEqual([['site-new']]);
    expect(calls.markPushed).toEqual([['s-1', 0, null]]);
    expect(result).toMatchObject({ pushedSites: 1, pushedSightings: 1, failed: 0 });
  });

  it('uploads local photos and sends the public url', async () => {
    const { server, calls, run } = setup([outbox({ photoUri: 'file:///p.jpg' })]);
    await run();
    expect(server.sighting('s-1')?.photo_url).toMatch(/sighting-photos\/uid-1\/s-1-x\.jpg$/);
    // Pins the Storage RLS contract: the file goes in the owner's folder, so the uploader must
    // be called with exactly the owning user's id and sighting id.
    expect(calls.uploadPhoto).toEqual([[expect.anything(), UID, 's-1', 'file:///p.jpg']]);
  });

  it('does not re-upload a photo that is already a remote url', async () => {
    const { calls, run } = setup([outbox({ photoUri: 'https://cdn/already.jpg' })]);
    await run();
    expect(calls.uploadPhoto).toEqual([]);
  });

  it('updates a sighting the server already has, instead of inserting it', async () => {
    const { server, run } = setup([outbox({ remote: true, notes: 'edited', version: 3 })]);
    server.seedSighting({ id: 's-1', user_id: UID, species_id: 'manta', notes: 'before' });
    await run();
    const ops = server.calls.filter((c) => c.table === 'sightings').map((c) => c.op);
    expect(ops).toEqual(['update']);
    expect(server.sighting('s-1')?.notes).toBe('edited');
  });

  it('sends deletions, removing the photo first', async () => {
    const photo = 'https://test-project.supabase.co/storage/v1/object/public/sighting-photos/uid-1/s-1.jpg';
    const { server, calls, run } = setup([outbox({ deleted: true, remote: true, syncedPhotoUrl: photo, photoUri: photo })]);
    server.seedSighting({ id: 's-1', user_id: UID, photo_url: photo });
    server.files.set('uid-1/s-1.jpg', UID);
    const result = await run();
    expect(server.calls.map((c) => c.op)).toEqual(expect.arrayContaining(['remove', 'delete']));
    expect(server.calls.findIndex((c) => c.op === 'remove')).toBeLessThan(server.calls.findIndex((c) => c.op === 'delete'));
    expect(server.sighting('s-1')).toBeUndefined();
    expect(server.files.size).toBe(0);
    expect(calls.markDeletionSynced).toEqual(['s-1']);
    expect(result.deletedSightings).toBe(1);
  });

  it('pulls remote sightings and user sites into the local db', async () => {
    const { server, calls, run } = setup([]);
    server.seedSighting(remoteRow({}));
    server.tables.dive_sites.push({
      id: 'site-x', name: 'X', lat: 3, lng: 4, region: '', country: '', blurb: '', notable_species: [], source: 'user',
    });
    const result = await run();
    expect(result.pulled).toBe(1);
    expect(calls.merged[0][0][0]).toMatchObject({ id: 'r-9', username: 'nemo', synced: true });
    expect(calls.upsertUserSites[0][0].id).toBe('site-x');
  });

  it('records why a push failed and carries on with the next one', async () => {
    const { server, calls, run } = setup([outbox({ id: 'taken' }), outbox({ id: 'good' })]);
    server.seedSighting({ id: 'taken', user_id: 'uid-2' }); // another diver's row with the same id
    const result = await run();
    expect(result).toMatchObject({ pushedSightings: 1, failed: 1 });
    expect(calls.markPushed.map((c) => c[0])).toEqual(['good']);
    expect(calls.markSyncFailed).toEqual([['taken', 'Another sighting on the server already uses this id.']]);
  });

  it("pulls the user's own rows even when absent from the community top-N pull", async () => {
    const { server, calls, run } = setup([]);
    for (let i = 0; i < 500; i++) {
      server.seedSighting(remoteRow({ id: `c-${i}`, created_at: `2026-09-01T00:00:${String(i % 60).padStart(2, '0')}.${String(i).padStart(3, '0')}Z` }));
    }
    server.seedSighting(remoteRow({ id: 'own-1', user_id: UID, created_at: '2026-08-05T09:00:00+00:00' }));
    const result = await run();
    expect(result.pulled).toBe(501);
    const [pulled, scope] = calls.merged[0];
    expect(pulled.some((s) => s.id === 'own-1')).toBe(true);
    // The community pull hit its limit: only rows newer than its oldest are known to be complete.
    expect(scope.communitySince).not.toBeNull();
    expect(scope.ownComplete).toBe(true);
  });

  it('de-duplicates a row present in both the community and own pulls', async () => {
    const { server, calls, run } = setup([]);
    server.seedSighting(remoteRow({ user_id: UID }));
    const result = await run();
    expect(result.pulled).toBe(1);
    expect(calls.merged[0][0]).toHaveLength(1);
    expect(calls.merged[0][1]).toEqual({ ownerId: UID, ownComplete: true, communitySince: null });
  });
});
