import type { DiveSite, Sighting, Species } from '@/lib/types';

/** Deterministic PRNG so demo data is stable for a given seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DEMO_USERNAMES = [
  'reefwanderer', 'bubbletrouble', 'mantamagnet', 'nitroxnora', 'wreckdiverwill',
  'coralcarla', 'deepbluedan', 'muckmaster', 'finfanatic', 'oceanoyuki',
  'sealegssam', 'driftqueen', 'apnea_andre', 'torchbearer', 'saltysiren',
];

const DEMO_NOTES = [
  'Incredible encounter, came right up to us!',
  'Spotted near the end of the dive.',
  'Quick glimpse but unmistakable.',
  'Hung around the cleaning station for ages.',
  'Guide called it mid-dive — everyone heard the tank banger.',
  'Third dive here, finally saw one!',
  '',
  '',
  '',
];

export interface DemoOptions {
  seed: number;
  /** Timestamp demo history counts back from (ms since epoch). */
  now: number;
  /** Days of history to spread sightings over. */
  historyDays?: number;
}

/**
 * Generate plausible community sightings: each site's notable species get 1–3
 * sightings spread over the past `historyDays`, logged by demo users. Roughly a
 * third carry the species reference photo so the credibility badge has data.
 * Deterministic for a given seed + now.
 */
export function generateDemoSightings(
  sites: DiveSite[],
  speciesById: Map<string, Species>,
  opts: DemoOptions,
): Sighting[] {
  const rand = mulberry32(opts.seed);
  const historyDays = opts.historyDays ?? 540;
  const sightings: Sighting[] = [];

  for (const site of sites) {
    for (const speciesId of site.notableSpecies) {
      const species = speciesById.get(speciesId);
      if (!species) continue;
      const count = 1 + Math.floor(rand() * 3); // 1–3
      for (let i = 0; i < count; i++) {
        const daysAgo = Math.floor(rand() * historyDays);
        const date = new Date(opts.now - daysAgo * 24 * 60 * 60 * 1000);
        const username = DEMO_USERNAMES[Math.floor(rand() * DEMO_USERNAMES.length)];
        const withPhoto = rand() < 0.33 && !!species.photoUrl;
        sightings.push({
          id: `demo-${site.id}-${speciesId}-${i}`,
          userId: `demo-${username}`,
          username,
          speciesId,
          siteId: site.id,
          sightedOn: date.toISOString().slice(0, 10),
          notes: DEMO_NOTES[Math.floor(rand() * DEMO_NOTES.length)] || undefined,
          photoUri: withPhoto ? species.photoUrl : undefined,
          isDemo: true,
          synced: true,
          createdAt: date.toISOString(),
        });
      }
    }
  }
  return sightings;
}
