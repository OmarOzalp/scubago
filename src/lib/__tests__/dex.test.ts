import { describe, expect, it } from '@jest/globals';
import { deriveDex, isFirstOfSpecies } from '@/lib/dex';
import type { Sighting, Species } from '@/lib/types';

const species = (id: string, rarity: Species['rarity']): Species => ({
  id,
  commonName: id,
  scientificName: id,
  category: 'fish',
  rarity,
  blurb: '',
});

const sighting = (id: string, speciesId: string, siteId: string, sightedOn: string): Sighting => ({
  id,
  userId: 'local',
  username: 'me',
  speciesId,
  siteId,
  sightedOn,
  isDemo: false,
  synced: false,
  createdAt: `${sightedOn}T12:00:00.000Z`,
});

const speciesById = new Map<string, Species>([
  ['clownfish', species('clownfish', 'common')],
  ['whale-shark', species('whale-shark', 'legendary')],
  ['manta', species('manta', 'epic')],
]);

describe('deriveDex', () => {
  it('returns one entry per species with count and first/last seen', () => {
    const dex = deriveDex(
      [
        sighting('1', 'clownfish', 'site-a', '2026-01-05'),
        sighting('2', 'clownfish', 'site-b', '2026-03-01'),
        sighting('3', 'clownfish', 'site-c', '2025-11-20'),
      ],
      speciesById,
    );
    expect(dex).toHaveLength(1);
    expect(dex[0].count).toBe(3);
    expect(dex[0].firstSeenOn).toBe('2025-11-20');
    expect(dex[0].firstSeenSiteId).toBe('site-c');
    expect(dex[0].lastSeenOn).toBe('2026-03-01');
  });

  it('sorts rarest first', () => {
    const dex = deriveDex(
      [
        sighting('1', 'clownfish', 'site-a', '2026-01-05'),
        sighting('2', 'whale-shark', 'site-b', '2026-01-06'),
        sighting('3', 'manta', 'site-b', '2026-01-07'),
      ],
      speciesById,
    );
    expect(dex.map((d) => d.species.id)).toEqual(['whale-shark', 'manta', 'clownfish']);
  });

  it('ignores sightings of unknown species', () => {
    const dex = deriveDex([sighting('1', 'kraken', 'site-a', '2026-01-05')], speciesById);
    expect(dex).toHaveLength(0);
  });

  it('returns empty for no sightings', () => {
    expect(deriveDex([], speciesById)).toEqual([]);
  });
});

describe('isFirstOfSpecies', () => {
  const seen = [sighting('1', 'clownfish', 'site-a', '2026-01-05')];

  it('is true for a species never logged', () => {
    expect(isFirstOfSpecies(seen, 'whale-shark')).toBe(true);
  });

  it('is false for an already-logged species', () => {
    expect(isFirstOfSpecies(seen, 'clownfish')).toBe(false);
  });
});
