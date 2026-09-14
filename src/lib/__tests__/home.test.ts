import { test, expect } from '@jest/globals';
import { deriveHome, parseHomePreferences } from '@/lib/home';
import type { Sighting, Species } from '@/lib/types';

const catalog = new Map<string, Species>(Array.from({ length: 65 }, (_, i) => [String(i), {
  id: String(i), commonName: `Fish ${i}`, scientificName: '', category: 'fish', rarity: 'common', blurb: '',
}]));
const sightings = (count: number): Sighting[] => Array.from({ length: count }, (_, i) => ({
  id: `s${i}`, speciesId: String(i), userId: 'local', username: 'you', siteId: 'reef',
  sightedOn: '2026-09-14', createdAt: '2026-09-14', isDemo: false, synced: false,
}));

test('an empty collection starts at a little island with three discoveries to its first reward', () => {
  const home = deriveHome([], catalog);
  expect(home.level).toBe(1);
  expect(home.remaining).toBe(3);
  expect(home.fraction).toBe(0);
  expect(home.residents).toEqual([]);
});

test.each([[2, 1], [3, 2], [7, 2], [8, 3], [15, 4], [30, 5], [60, 6], [65, 6]])(
  '%i unique species produces level %i', (count, level) => {
    expect(deriveHome(sightings(count), catalog).level).toBe(level);
  },
);

test('duplicates, demo sightings and unknown species cannot inflate growth', () => {
  const rows = sightings(2);
  const home = deriveHome([...rows, { ...rows[0], id: 'repeat' },
    { ...rows[0], id: 'demo', speciesId: '5', isDemo: true },
    { ...rows[0], id: 'unknown', speciesId: 'kraken' }], catalog);
  expect(home.residents).toHaveLength(2);
  expect(home.remaining).toBe(1);
  expect(home.sightingCount).toBe(3);
});

test('final rank has complete progress and no next milestone', () => {
  const home = deriveHome(sightings(65), catalog);
  expect(home.next).toBeNull();
  expect(home.remaining).toBe(0);
  expect(home.fraction).toBe(1);
});

test('preferences validate stored values and safely recover corrupted data', () => {
  expect(parseHomePreferences(null)).toEqual({ name: 'My little island', habitat: 'island' });
  expect(parseHomePreferences('{')).toEqual(parseHomePreferences(null));
  expect(parseHomePreferences('null')).toEqual(parseHomePreferences(null));
  expect(parseHomePreferences('{"name":"  Cove  ","habitat":"cove"}')).toEqual({ name: 'Cove', habitat: 'cove' });
  expect(parseHomePreferences('{"name":"   ","habitat":"bad"}')).toEqual(parseHomePreferences(null));
  expect(parseHomePreferences(JSON.stringify({ name: 'a'.repeat(100), habitat: 'lagoon' })).name).toHaveLength(32);
});
