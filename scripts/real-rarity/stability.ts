/**
 * How steady are the tiers when one site is dropped? (docs/real-rarity.md, "The minimum".)
 *
 * For every animal that could be given a share, take away one site from its waters (one cell, when
 * cells are on), once for a site where it is recorded and once for one where it is not, and give it the
 * share it would then have. Rank that against everyone else’s unchanged shares. If the tier changes, one
 * site was enough to move the animal, and the more animals that happens to, the less the share over that
 * many sites can be trusted. Grouped by how many sites the animal’s waters hold, this is what to read the
 * minimum against.
 *
 * Pure. Nothing here reads a file or the network; `--stability` on encounters.ts prints it.
 * Relative imports on purpose (see requests.ts).
 */
import { tiersFromShares, type EncounterShare } from '../../src/lib/encounter-rarity';
import { rarityRank } from '../../src/lib/rarity';

export interface StabilityRow {
  id: string;
  /** Sites (cells, with the cell option) in the animal’s waters. */
  cells: number;
  recordedCells: number;
  /** True when dropping one site (recorded or not) moves its tier. */
  changes: boolean;
  /** The most tiers it moves by. */
  steps: number;
}

/** Groups of counts, by the number of sites (cells) in the animal’s waters. */
export const STABILITY_BINS: readonly { label: string; from: number; to: number }[] = [
  { label: '1 to 4', from: 1, to: 4 },
  { label: '5 to 9', from: 5, to: 9 },
  { label: '10 to 19', from: 10, to: 19 },
  { label: '20 to 39', from: 20, to: 39 },
  { label: '40 or more', from: 40, to: Number.POSITIVE_INFINITY },
];

/** The animals that have a share, each tested against the unchanged shares of the others. An animal with one site has none to drop and is left out. */
export function leaveOneCellOut(shares: ReadonlyMap<string, Pick<EncounterShare, 'share' | 'sites' | 'recordedAt'>>): StabilityRow[] {
  const base = new Map([...shares].map(([id, entry]) => [id, entry.share] as const));
  const tiers = tiersFromShares(base);
  const rows: StabilityRow[] = [];
  for (const [id, { sites: cells, recordedAt: recordedCells }] of shares) {
    const own = tiers.get(id);
    if (own === undefined || cells < 2) continue;
    const without: number[] = [];
    if (recordedCells > 0) without.push((recordedCells - 1) / (cells - 1));
    if (recordedCells < cells) without.push(recordedCells / (cells - 1));
    let steps = 0;
    for (const share of without) {
      const moved = tiersFromShares(new Map(base).set(id, share)).get(id);
      if (moved !== undefined) steps = Math.max(steps, Math.abs(rarityRank(moved) - rarityRank(own)));
    }
    rows.push({ id, cells, recordedCells, changes: steps > 0, steps });
  }
  return rows;
}

/** The table as plain text lines, for the log and for pasting into the docs. */
export function stabilityLines(rows: readonly StabilityRow[], unit: 'site' | 'cell' = 'site'): string[] {
  const lines = [`  Stability: tiers that change if one ${unit} is dropped from an animal’s waters, by ${unit}s in its waters (run with --min-sites 1 to see every animal):`];
  for (const { label, from, to } of STABILITY_BINS) {
    const inBin = rows.filter((row) => row.cells >= from && row.cells <= to);
    if (inBin.length === 0) {
      lines.push(`    ${label.padEnd(11)} no animals`);
      continue;
    }
    const changed = inBin.filter((row) => row.changes).length;
    const twoOrMore = inBin.filter((row) => row.steps >= 2).length;
    lines.push(`    ${label.padEnd(11)} ${String(inBin.length).padStart(3)} animals, ${String(changed).padStart(3)} change tier (${Math.round((100 * changed) / inBin.length)}%), ${twoOrMore} by two tiers or more`);
  }
  return lines;
}
