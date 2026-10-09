import { describe, expect, it } from '@jest/globals';
import {
  displayablePhoto,
  drainOutbox,
  errorMessage,
  ownPhotoPath,
  photoExtension,
  photoObjectPath,
  pushableSightings,
  remoteRowToSighting,
  remoteSiteRowToSite,
  sightingFacts,
  sightingToRemoteRow,
  siteToRemoteRow,
} from '@/lib/sync';
import type { DiveSite, Sighting } from '@/lib/types';

function sighting(idOrOverrides?: string | Partial<Sighting>): Sighting {
  const defaults = {
    id: 's-1',
    userId: 'uid-1',
    username: 'you',
    speciesId: 'whale-shark',
    siteId: 'richelieu-rock',
    sightedOn: '2026-08-20',
    isDemo: false,
    synced: false,
    createdAt: '2026-08-20T10:00:00.000Z',
  };

  // Support legacy string-based id calls
  if (typeof idOrOverrides === 'string') {
    return {
      id: idOrOverrides,
      userId: 'local',
      username: 'me',
      speciesId: 'clownfish',
      siteId: 'site-a',
      sightedOn: '2026-01-05',
      isDemo: false,
      synced: false,
      createdAt: '2026-01-05T12:00:00.000Z',
    };
  }

  return {
    ...defaults,
    ...(idOrOverrides || {}),
  };
}

describe('drainOutbox', () => {
  it('marks everything synced when pushes succeed', async () => {
    const result = await drainOutbox([sighting('a'), sighting('b')], async () => {});
    expect(result.synced).toEqual(['a', 'b']);
    expect(result.failed).toEqual([]);
  });

  it('one failure does not block the rest', async () => {
    const result = await drainOutbox(
      [sighting('a'), sighting('b'), sighting('c')],
      async (s) => {
        if (s.id === 'b') throw new Error('network');
      },
    );
    expect(result.synced).toEqual(['a', 'c']);
    expect(result.failed).toEqual(['b']);
    expect(result.errors).toEqual({ b: 'network' });
  });

  it('handles an empty outbox', async () => {
    const result = await drainOutbox([], async () => {});
    expect(result).toEqual({ synced: [], failed: [], errors: {} });
  });

  it('keeps a readable reason from any kind of failure', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
    expect(errorMessage({ message: 'permission denied', code: '42501' })).toBe('permission denied');
    expect(errorMessage('plain')).toBe('plain');
    expect(errorMessage(undefined)).toBe('Unknown error');
  });
});

describe('pushableSightings', () => {
  it('keeps only own, unsynced, non-demo sightings', () => {
    const all = [
      sighting({ id: 'keep' }),
      sighting({ id: 'demo', isDemo: true }),
      sighting({ id: 'synced', synced: true }),
      sighting({ id: 'other-user', userId: 'uid-2' }),
      sighting({ id: 'local-unclaimed', userId: 'local' }),
    ];
    expect(pushableSightings(all, 'uid-1').map((s) => s.id)).toEqual(['keep']);
  });
});

describe('sighting mapping', () => {
  it('maps to a remote row, preferring the uploaded photo url', () => {
    const row = sightingToRemoteRow(
      sighting({ notes: 'huge!', photoUri: 'file:///tmp/p.jpg' }),
      'https://cdn/x.jpg',
    );
    expect(row).toEqual({
      id: 's-1',
      user_id: 'uid-1',
      species_id: 'whale-shark',
      site_id: 'richelieu-rock',
      sighted_on: '2026-08-20',
      notes: 'huge!',
      photo_url: 'https://cdn/x.jpg',
      created_at: '2026-08-20T10:00:00.000Z',
    });
  });

  it('never sends a local file uri as photo_url', () => {
    const row = sightingToRemoteRow(sighting({ photoUri: 'file:///tmp/p.jpg' }), null);
    expect(row.photo_url).toBeNull();
  });

  it('passes through an already-remote photo url', () => {
    const row = sightingToRemoteRow(sighting({ photoUri: 'https://cdn/old.jpg' }), null);
    expect(row.photo_url).toBe('https://cdn/old.jpg');
  });

  it('maps a remote row back, normalizing created_at and defaulting username', () => {
    const s = remoteRowToSighting({
      id: 'r-1',
      user_id: 'uid-9',
      species_id: 'manta',
      site_id: 'blue-corner',
      sighted_on: '2026-08-01',
      notes: null,
      photo_url: 'https://cdn/m.jpg',
      created_at: '2026-08-01T09:00:00+00:00',
      profiles: null,
    });
    expect(s).toEqual({
      id: 'r-1',
      userId: 'uid-9',
      username: 'diver',
      speciesId: 'manta',
      siteId: 'blue-corner',
      sightedOn: '2026-08-01',
      notes: undefined,
      photoUri: 'https://cdn/m.jpg',
      isDemo: false,
      synced: true,
      createdAt: '2026-08-01T09:00:00.000Z',
    });
  });
});

describe('site mapping', () => {
  const site: DiveSite = {
    id: 'site-abc',
    name: 'Secret Reef',
    lat: 1.5,
    lng: 100.2,
    region: 'Andaman',
    country: 'Thailand',
    blurb: '',
    notableSpecies: [],
    source: 'user',
  };

  it('round-trips a user site', () => {
    const row = siteToRemoteRow(site, 'uid-1');
    expect(row.created_by).toBe('uid-1');
    expect(row.source).toBe('user');
    expect(remoteSiteRowToSite(row)).toEqual(site);
  });
});

describe('owner-editable columns', () => {
  it('are the facts, notes and photo: never the id, owner or creation time', () => {
    const facts = sightingFacts(sightingToRemoteRow(sighting({ notes: 'n' }), 'https://cdn/x.jpg'));
    expect(facts).toEqual({
      species_id: 'whale-shark', site_id: 'richelieu-rock', sighted_on: '2026-08-20', notes: 'n', photo_url: 'https://cdn/x.jpg',
    });
  });
});

describe('photo storage paths', () => {
  const base = 'https://proj.supabase.co/storage/v1/object/public/sighting-photos';

  it('puts each photo in the owner\'s folder, stable for a file and different for another', () => {
    const a = photoObjectPath('uid-1', 's-1', 'file:///docs/sighting-photos/A.jpg');
    expect(a).toMatch(/^uid-1\/s-1-[0-9a-z]+\.jpg$/);
    expect(photoObjectPath('uid-1', 's-1', 'file:///docs/sighting-photos/A.jpg')).toBe(a);
    expect(photoObjectPath('uid-1', 's-1', 'file:///docs/sighting-photos/B.jpg')).not.toBe(a);
  });

  it('reads the image type from the file name, defaulting to JPEG', () => {
    expect(photoExtension('file:///x/IMG_1.HEIC')).toBe('heic');
    expect(photoExtension('file:///x/p.png?v=2')).toBe('png');
    expect(photoExtension('blob:http://localhost:8081/5d1c')).toBe('jpg');
    expect(photoExtension('file:///x/archive.tar.gz')).toBe('jpg');
  });

  it('only ever resolves the owner\'s own files for removal', () => {
    expect(ownPhotoPath(`${base}/uid-1/s-1-abc.jpg`, 'uid-1')).toBe('uid-1/s-1-abc.jpg');
    expect(ownPhotoPath(`${base}/uid-2/s-1-abc.jpg`, 'uid-1')).toBeNull();
    expect(ownPhotoPath(`${base}/uid-1/../uid-2/x.jpg`, 'uid-1')).toBeNull();
    expect(ownPhotoPath(`${base}/uid-1/nested/x.jpg`, 'uid-1')).toBeNull();
    expect(ownPhotoPath('https://elsewhere.example/uid-1/x.jpg', 'uid-1')).toBeNull();
    expect(ownPhotoPath('file:///local.jpg', 'uid-1')).toBeNull();
    expect(ownPhotoPath(undefined, 'uid-1')).toBeNull();
  });

  it("shows another diver's photo only from their folder in the app's own bucket", () => {
    const url = 'https://proj.supabase.co';
    const theirs = sighting({ userId: 'uid-2', photoUri: `${base}/uid-2/s-9-x.jpg` });
    expect(displayablePhoto(theirs, 'uid-1', url)).toBe(theirs.photoUri);
    expect(displayablePhoto({ ...theirs, photoUri: 'https://tracker.example/pixel.jpg' }, 'uid-1', url)).toBeUndefined();
    expect(displayablePhoto({ ...theirs, photoUri: `${base}/uid-3/s-9-x.jpg` }, 'uid-1', url)).toBeUndefined();
    expect(displayablePhoto(theirs, 'uid-1', undefined)).toBeUndefined();
    // Your own photo shows wherever it is (a local file until it syncs).
    expect(displayablePhoto(sighting({ photoUri: 'file:///p.jpg' }), 'uid-1', url)).toBe('file:///p.jpg');
  });
});
