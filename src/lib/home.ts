import { deriveDex } from '@/lib/dex';
import type { Sighting, Species } from '@/lib/types';

export const HABITATS = [
  { id: 'island', name: 'Sandy island', description: 'Warm sand & swaying palms', water: '#BCE5DF', deep: '#88CFC8' },
  { id: 'lagoon', name: 'Coral lagoon', description: 'A sheltered, turquoise world', water: '#B9E4E9', deep: '#7EC9D3' },
  { id: 'cove', name: 'Rocky cove', description: 'Wild shores & quiet waters', water: '#CDDCD7', deep: '#9ABDB6' },
] as const;
export type Habitat = typeof HABITATS[number]['id'];
export type HomePreferences = { name: string; habitat: Habitat };
export const DEFAULT_HOME: HomePreferences = { name: 'My little island', habitat: 'island' };

export const HOME_STAGES = [
  { at: 0, rank: 'New Explorer', place: 'A little beginning', reward: 'Your own little island' },
  { at: 3, rank: 'Reef Scout', place: 'Life takes root', reward: 'A coral garden' },
  { at: 8, rank: 'Ocean Wanderer', place: 'Room to roam', reward: 'Wider turquoise shallows' },
  { at: 15, rank: 'Reef Guardian', place: 'A thriving sanctuary', reward: 'A lush island grove' },
  { at: 30, rank: 'Ocean Expert', place: 'Beyond the horizon', reward: 'A neighbouring island' },
  { at: 60, rank: 'Ocean Legend', place: 'Your own archipelago', reward: 'A little archipelago' },
] as const;

/** Caller supplies the active owner's sightings, as with the existing logbook. */
export function deriveHome(sightings: Sighting[], catalog: Map<string, Species>) {
  const valid = sightings.filter((s) => !s.isDemo && catalog.has(s.speciesId));
  const residents = deriveDex(valid, catalog);
  const count = residents.length;
  let index = 0;
  for (let i = 1; i < HOME_STAGES.length; i++) if (count >= HOME_STAGES[i].at) index = i;
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
    return {
      name: typeof value?.name === 'string' && value.name.trim() ? value.name.trim().slice(0, 32) : DEFAULT_HOME.name,
      habitat: HABITATS.some((h) => h.id === value?.habitat) ? value.habitat : DEFAULT_HOME.habitat,
    };
  } catch {
    return { ...DEFAULT_HOME };
  }
}
