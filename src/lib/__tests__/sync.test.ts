import { describe, expect, it } from '@jest/globals';
import {
  drainOutbox,
  pushableSightings,
  remoteRowToSighting,
  remoteSiteRowToSite,
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
  });

  it('handles an empty outbox', async () => {
    const result = await drainOutbox([], async () => {});
    expect(result).toEqual({ synced: [], failed: [] });
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
