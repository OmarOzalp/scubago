import { SPECIES_ALIASES } from '@/data/species-aliases';
import type { DiveSite, Species } from '@/lib/types';

/** British spellings searched as American ones (and vice versa), so "grey reef" finds "Grey Reef Shark" either way. */
const SPELLINGS: Record<string, string> = { grey: 'gray', harbour: 'harbor', colour: 'color', armour: 'armor' };

/**
 * Text as search compares it: lower case, accents dropped ("Galápagos" → "galapagos"), apostrophes
 * of any kind removed ("Munk’s" and "Munk's" → "munks"), punctuation as spaces, one spelling per word.
 */
export function normalizeSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’‘`´]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .map((w) => SPELLINGS[w] ?? w)
    .join(' ');
}

const compact = (normalized: string) => normalized.replace(/ /g, '');

/** Optimal string alignment distance: insertions, deletions, substitutions and swapped neighbours. */
export function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** One typo allowed in words of 4–6 letters, two from 7; shorter words must match exactly. */
function closeEnough(typed: string, word: string): boolean {
  if (typed.length < 4) return false;
  const allowed = typed.length >= 7 ? 2 : 1;
  // Compare with the whole word and with its start, so a typo mid-typing ("hamerh") still counts.
  return editDistance(typed, word) <= allowed || editDistance(typed, word.slice(0, typed.length)) <= allowed;
}

/**
 * How well `query` matches an item named `primary` (shown names) and known by `secondary` (other
 * names, scientific names, regions): 0 for no match, higher for better ones.
 */
export function matchScore(query: string, primary: string[], secondary: string[] = []): number {
  const q = normalizeSearch(query);
  if (!q) return 0;
  const words = q.split(' ');
  const fields = [
    ...primary.map((text) => ({ text: normalizeSearch(text), weight: 1 })),
    ...secondary.map((text) => ({ text: normalizeSearch(text), weight: 0.75 })),
  ];
  let best = 0;
  for (const { text, weight } of fields) {
    if (!text) continue;
    const fieldWords = text.split(' ');
    let score = 0;
    if (text === q) score = 100;
    else if (text.startsWith(q)) score = 90;
    else if (words.every((w) => fieldWords.some((fw) => fw.startsWith(w)))) score = 75;
    // "seahorse" for "Sea horse", "sea dragon" for "Seadragon", or a fragment of one word.
    else if (compact(text).includes(compact(q))) score = 60;
    else if (words.every((w) => fieldWords.some((fw) => fw.startsWith(w) || closeEnough(w, fw)))) score = 35;
    best = Math.max(best, score * weight);
  }
  return best;
}

/** Items that match `query`, best first; ties keep their original order. Everything when the query is empty. */
export function rankByText<T>(items: T[], query: string, names: (item: T) => { primary: string[]; secondary?: string[] }): T[] {
  if (!normalizeSearch(query)) return items;
  return items
    .map((item, index) => {
      const { primary, secondary } = names(item);
      return { item, index, score: matchScore(query, primary, secondary) };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((r) => r.item);
}

/** Species matching what the diver typed: common name first, then other names, then the scientific name. */
export function searchSpecies(species: Species[], query: string): Species[] {
  return rankByText(species, query, (s) => ({
    primary: [s.commonName],
    secondary: [...(SPECIES_ALIASES[s.id] ?? []), s.scientificName],
  }));
}

/** Dive sites matching a name, region or country. */
export function searchSites(sites: DiveSite[], query: string): DiveSite[] {
  return rankByText(sites, query, (s) => ({ primary: [s.name], secondary: [s.region, s.country] }));
}
