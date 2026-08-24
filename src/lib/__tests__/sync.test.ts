import { describe, expect, it } from '@jest/globals';
import { drainOutbox } from '@/lib/sync';
import type { Sighting } from '@/lib/types';

const sighting = (id: string): Sighting => ({
  id,
  userId: 'local',
  username: 'me',
  speciesId: 'clownfish',
  siteId: 'site-a',
  sightedOn: '2026-01-05',
  isDemo: false,
  synced: false,
  createdAt: '2026-01-05T12:00:00.000Z',
});

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
