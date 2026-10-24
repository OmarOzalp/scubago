import { deriveDex } from '@/lib/dex';
import type { Sighting, Species } from '@/lib/types';

/**
 * The shores an island can be drawn with (sanctuary-environment.tsx). Home's island, the archipelago's
 * Coral Reef (src/lib/archipelago.ts), is the sandy island; the Kelp Forest's is the kelp coast; the
 * Volcanic Pinnacle's the lava cone; the Mangroves & Seagrass' the mangrove cay; the Shipwreck's the wreck cay; the
 * rocky and lagoon shores are there for the archipelago's other islands. The diver no longer picks one.
 */
export const HABITATS = [
  { id: 'island', name: 'Sandy island', description: 'Warm sand & swaying palms', water: '#BCE5DF', deep: '#88CFC8' },
  { id: 'lagoon', name: 'Coral lagoon', description: 'A sheltered, turquoise world', water: '#B9E4E9', deep: '#7EC9D3' },
  { id: 'cove', name: 'Rocky cove', description: 'Wild shores & quiet waters', water: '#CDDCD7', deep: '#9ABDB6' },
  { id: 'kelp', name: 'Kelp coast', description: 'Cold green water & towering kelp', water: '#BFD3CB', deep: '#7FA39A' },
  { id: 'volcanic', name: 'Volcanic pinnacle', description: 'Black lava & clear blue currents', water: '#BCD4E6', deep: '#6E95C2' },
  { id: 'mangrove', name: 'Mangrove cay', description: 'Mangrove roots & seagrass shallows', water: '#C2E4D8', deep: '#7FC2B0' },
  { id: 'wreck', name: 'Wreck cay', description: 'An old wreck in clear water', water: '#C0E2E8', deep: '#7AB4CC' },
] as const;
export type Habitat = typeof HABITATS[number]['id'];
/** The shores Home's island is drawn with: the Coral Reef's sandy island. */
export const HOME_SHORE: Habitat = 'island';
export type HomePreferences = { name: string };
export const DEFAULT_HOME: HomePreferences = { name: 'My little island' };
/** The longest name a home can have: the editor stops there and says so, and a saved name is cut to it. */
export const HOME_NAME_MAX = 32;

export const HOME_STAGES = [
  { at: 0, rank: 'New Explorer', place: 'A little beginning', reward: 'Your own little island' },
  { at: 3, rank: 'Reef Scout', place: 'Life takes root', reward: 'A coral garden' },
  { at: 8, rank: 'Ocean Wanderer', place: 'Room to roam', reward: 'Wider turquoise shallows' },
  { at: 15, rank: 'Reef Guardian', place: 'A thriving sanctuary', reward: 'A lush island grove' },
  { at: 30, rank: 'Ocean Expert', place: 'Beyond the horizon', reward: 'A neighbouring islet' },
  { at: 60, rank: 'Ocean Legend', place: 'Your own archipelago', reward: 'A second islet' },
] as const;

/** The island's level (1 to 6) for a collection of `count` species. */
export function levelForCount(count: number) {
  let index = 0;
  for (let i = 1; i < HOME_STAGES.length; i++) if (count >= HOME_STAGES[i].at) index = i;
  return index + 1;
}

/** Caller supplies the active owner's sightings, as with the existing logbook. */
export function deriveHome(sightings: Sighting[], catalog: Map<string, Species>) {
  const valid = sightings.filter((s) => !s.isDemo && catalog.has(s.speciesId));
  const residents = deriveDex(valid, catalog);
  const count = residents.length;
  const index = levelForCount(count) - 1;
  const stage = HOME_STAGES[index];
  const next = HOME_STAGES[index + 1] ?? null;
  return {
    residents, sightingCount: valid.length, level: index + 1, stage, next,
    remaining: next ? next.at - count : 0,
    fraction: next ? (count - stage.at) / (next.at - stage.at) : 1,
  };
}

export function parseHomePreferences(raw: string | null): HomePreferences {
  try {
    const value = raw ? JSON.parse(raw) : null;
    // (A shore saved before the archipelago, when the diver picked one, is left behind.)
    return { name: typeof value?.name === 'string' && value.name.trim() ? value.name.trim().slice(0, HOME_NAME_MAX) : DEFAULT_HOME.name };
  } catch {
    return { ...DEFAULT_HOME };
  }
}
