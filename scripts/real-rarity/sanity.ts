/**
 * The sanity check for the encounter metric (docs/real-rarity.md): does it measure how likely a
 * diver is to meet an animal, or only how much the animal is photographed?
 *
 * Two lists of animals whose real-world standing nobody argues about. The lists are used to judge a
 * result and to print it; they are never an input. Nothing here adjusts a tier: if the check fails
 * the method is rethought, not the output.
 *
 * Relative imports on purpose (see requests.ts).
 */
import { BASINS_BY_ID } from '../../src/lib/encounter-rarity';
import type { EncounterData } from '../../src/lib/encounter-rarity';
import { rarityRank } from '../../src/lib/rarity';
import type { Rarity } from '../../src/lib/types';

/** Big animals divers rarely meet, even where they live: they should mostly land rare or rarer. */
export const ICONIC_SPECIES: readonly string[] = [
  'whale-shark',
  'humpback-whale',
  'sperm-whale',
  'orca',
  'great-white-shark',
  'basking-shark',
  'dugong',
  'leatherback-turtle',
  'oceanic-manta',
  'mola-mola',
];

/** Reef staples that a diver meets on most dives in their waters: they should mostly land common or uncommon. */
export const STAPLE_SPECIES: readonly string[] = [
  'clownfish',
  'blue-tang',
  'moorish-idol',
  'giant-moray',
  'lionfish',
  'french-angelfish',
  'queen-angelfish',
];

export interface SanityRow {
  id: string;
  group: 'iconic' | 'staple';
  /** Null when the animal has no tier in the data (it is unresolved). */
  tier: Rarity | null;
  share: number | null;
  /** Sites (cells, with the cell option) where it is recorded. */
  recordedAt: number | null;
  /** Sites (cells) in its waters. */
  sites: number | null;
  basins: string[];
  /** The tier the group expects, met or not. Null without a tier. */
  expected: boolean | null;
}

export interface SanityReport {
  rows: SanityRow[];
  iconic: { total: number; met: number };
  staple: { total: number; met: number };
  /** Both groups are met by at least two thirds of the animals that have a tier. */
  passes: boolean;
}

const RARE_OR_RARER = rarityRank('rare');
const UNCOMMON_OR_COMMONER = rarityRank('uncommon');

/** The check: iconic animals rare or rarer, staples common or uncommon, each by at least two thirds of those with a tier. */
export function sanityReport(data: Pick<EncounterData, 'species'>): SanityReport {
  const rows: SanityRow[] = [];
  for (const [group, ids] of [['iconic', ICONIC_SPECIES], ['staple', STAPLE_SPECIES]] as const) {
    for (const id of ids) {
      const entry = Object.prototype.hasOwnProperty.call(data.species, id) ? data.species[id] : undefined;
      const rank = entry ? rarityRank(entry.tier) : undefined;
      rows.push({
        id,
        group,
        tier: entry?.tier ?? null,
        share: entry?.share ?? null,
        recordedAt: entry?.recordedAt ?? null,
        sites: entry?.sites ?? null,
        basins: entry ? entry.basins.map((basin) => BASINS_BY_ID.get(basin)?.short ?? basin) : [],
        expected: rank === undefined ? null : group === 'iconic' ? rank >= RARE_OR_RARER : rank <= UNCOMMON_OR_COMMONER,
      });
    }
  }
  const tally = (group: SanityRow['group']) => {
    const tiered = rows.filter((row) => row.group === group && row.expected !== null);
    return { total: tiered.length, met: tiered.filter((row) => row.expected).length };
  };
  const iconic = tally('iconic');
  const staple = tally('staple');
  const enough = (t: { total: number; met: number }) => t.total > 0 && t.met * 3 >= t.total * 2;
  return { rows, iconic, staple, passes: enough(iconic) && enough(staple) };
}

const percent = (share: number) => `${(share * 100).toFixed(0)}%`;

/** The table as plain text lines, for the log and for pasting into the docs. `unit` is what the counts are of: sites, or cells with the cell option. */
export function sanityLines(report: SanityReport, unit: 'sites' | 'cells' = 'sites'): string[] {
  const lines = ['  Sanity check (iconic animals should land rare or rarer, staples common or uncommon):'];
  for (const row of report.rows) {
    const where = row.tier === null ? 'no tier (unresolved)' : `${row.tier.padEnd(9)} ${percent(row.share ?? 0).padStart(4)}  ${row.recordedAt}/${row.sites} ${unit}  ${row.basins.join(' + ')}`;
    lines.push(`    ${row.group.padEnd(6)} ${row.id.padEnd(20)} ${where}${row.expected === false ? '   <- against expectation' : ''}`);
  }
  lines.push(`  Iconic rare or rarer: ${report.iconic.met} of ${report.iconic.total}. Staples common or uncommon: ${report.staple.met} of ${report.staple.total}. ${report.passes ? 'Passes.' : 'Does not pass.'}`);
  return lines;
}
