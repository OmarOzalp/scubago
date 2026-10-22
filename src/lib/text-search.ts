import { regionPath } from '@/data/regions';
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

/** The three rows of the matrix `editDistance` works through, kept between calls: it runs thousands of times a search. */
let matrixRows = new Int32Array(3 * 64);

/** Optimal string alignment distance: insertions, deletions, substitutions and swapped neighbours. */
export function editDistance(a: string, b: string): number {
  const n = a.length;
  const m = b.length;
  if (n === 0) return m;
  if (m === 0) return n;
  const width = m + 1;
  if (matrixRows.length < 3 * width) matrixRows = new Int32Array(3 * width);
  const rows = matrixRows;
  // Where, in `rows`, the row before the previous, the previous and the current one start.
  let beforePrev = 0;
  let prev = width;
  let cur = 2 * width;
  for (let j = 0; j <= m; j++) rows[prev + j] = j;
  for (let i = 1; i <= n; i++) {
    rows[cur] = i;
    const ai = a.charCodeAt(i - 1);
    for (let j = 1; j <= m; j++) {
      const cost = ai === b.charCodeAt(j - 1) ? 0 : 1;
      let best = Math.min(rows[prev + j] + 1, rows[cur + j - 1] + 1, rows[prev + j - 1] + cost);
      if (i > 1 && j > 1 && ai === b.charCodeAt(j - 2) && a.charCodeAt(i - 2) === b.charCodeAt(j - 1)) {
        best = Math.min(best, rows[beforePrev + j - 2] + 1);
      }
      rows[cur + j] = best;
    }
    const spare = beforePrev;
    beforePrev = prev;
    prev = cur;
    cur = spare;
  }
  return rows[prev + m];
}

/** One typo allowed in words of 4–6 letters, two from 7; shorter words must match exactly. */
function closeEnough(typed: string, word: string): boolean {
  if (typed.length < 4) return false;
  const allowed = typed.length >= 7 ? 2 : 1;
  // Words too different in length can't be close, which saves the matrix for most of them.
  if (word.length <= typed.length) return typed.length - word.length <= allowed && editDistance(typed, word) <= allowed;
  // Compare with the start of the word, so a typo mid-typing ("hamerh") still counts, and with the whole word.
  return editDistance(typed, word.slice(0, typed.length)) <= allowed || (word.length - typed.length <= allowed && editDistance(typed, word) <= allowed);
}

/** A name, normalised once: the matching below runs on these, so a search doesn't normalise every name again. */
interface PreparedField {
  text: string;
  words: string[];
  compact: string;
  weight: number;
}

function prepareField(raw: string, weight: number): PreparedField | null {
  const text = normalizeSearch(raw);
  return text ? { text, words: text.split(' '), compact: compact(text), weight } : null;
}

interface PreparedQuery {
  text: string;
  words: string[];
  compact: string;
}

function prepareQuery(raw: string): PreparedQuery | null {
  const text = normalizeSearch(raw);
  return text ? { text, words: text.split(' '), compact: compact(text) } : null;
}

/** The names an item is searched by: shown names, other names, and text that joins several (see `JOINED_WEIGHT`). */
interface Names {
  primary: string[];
  secondary?: string[];
  joined?: string[];
}

/** Secondary names count for less than shown ones; a query that spans several names ("cod hole australia") for less still. */
const SECONDARY_WEIGHT = 0.75;
const JOINED_WEIGHT = 0.7;

function prepareNames({ primary, secondary = [], joined = [] }: Names): PreparedField[] {
  const fields: PreparedField[] = [];
  for (const [list, weight] of [[primary, 1], [secondary, SECONDARY_WEIGHT], [joined, JOINED_WEIGHT]] as const) {
    for (const text of list) {
      const field = prepareField(text, weight);
      if (field) fields.push(field);
    }
  }
  return fields;
}

/** 0 for no match, else the best score over an item's names. */
function scoreFields(q: PreparedQuery, fields: readonly PreparedField[]): number {
  let best = 0;
  for (const { text, words: fieldWords, compact: fieldCompact, weight } of fields) {
    // A field can't beat the best so far if even its top score (100) wouldn't.
    if (best >= 100 * weight) continue;
    let score = 0;
    if (text === q.text) score = 100;
    else if (text.startsWith(q.text)) score = 90;
    else if (q.words.every((w) => fieldWords.some((fw) => fw.startsWith(w)))) score = 75;
    // "seahorse" for "Sea horse", "sea dragon" for "Seadragon", or a fragment of one word.
    else if (fieldCompact.includes(q.compact)) score = 60;
    else if (q.words.every((w) => fieldWords.some((fw) => fw.startsWith(w) || closeEnough(w, fw)))) score = 35;
    best = Math.max(best, score * weight);
  }
  return best;
}

/**
 * How well `query` matches an item named `primary` (shown names) and known by `secondary` (other
 * names, scientific names, regions): 0 for no match, higher for better ones.
 */
export function matchScore(query: string, primary: string[], secondary: string[] = []): number {
  const q = prepareQuery(query);
  return q ? scoreFields(q, prepareNames({ primary, secondary })) : 0;
}

/** Items that match `query`, best first; ties keep their original order. Everything when the query is empty. */
export function rankByText<T>(items: T[], query: string, names: (item: T) => { primary: string[]; secondary?: string[] }): T[] {
  const q = prepareQuery(query);
  if (!q) return items;
  return items
    .map((item, index) => ({ item, index, score: scoreFields(q, prepareNames(names(item))) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((r) => r.item);
}

// ── Species ──────────────────────────────────────────────────────────────────

/** Each list of species' names, normalised once for as long as the list lives (the catalogue lives for ever). */
const speciesIndexes = new WeakMap<readonly Species[], PreparedField[][]>();

function speciesIndex(species: readonly Species[]): PreparedField[][] {
  let index = speciesIndexes.get(species);
  if (!index) {
    index = species.map((s) => prepareNames({ primary: [s.commonName], secondary: [...(SPECIES_ALIASES[s.id] ?? []), s.scientificName] }));
    speciesIndexes.set(species, index);
  }
  return index;
}

/** Species matching what the diver typed, best first, with how well each matched (1–100). Nothing for an empty query. */
export function scoreSpecies(species: readonly Species[], query: string): { species: Species; score: number }[] {
  const q = prepareQuery(query);
  if (!q) return [];
  const index = speciesIndex(species);
  const hits: { species: Species; score: number; order: number }[] = [];
  species.forEach((s, order) => {
    const score = scoreFields(q, index[order]);
    if (score > 0) hits.push({ species: s, score, order });
  });
  return hits.sort((a, b) => b.score - a.score || a.order - b.order);
}

/** Species matching what the diver typed: common name first, then other names, then the scientific name. */
export function searchSpecies(species: Species[], query: string): Species[] {
  return prepareQuery(query) ? scoreSpecies(species, query).map((r) => r.species) : species;
}

// ── Dive sites ───────────────────────────────────────────────────────────────

interface SiteEntry {
  fields: PreparedField[];
  /** The name as searched, to put sites that match equally well in alphabetical order. */
  key: string;
  imported: boolean;
}

const siteIndexes = new WeakMap<readonly DiveSite[], SiteEntry[]>();

/**
 * A site is found by its name first; then by its region and country (also by the region's place in
 * regions.ts, since a seeded site's own `region` may be just "Dahab"); and by name, region and country
 * together ("manta point egypt").
 */
function siteEntry(site: DiveSite): SiteEntry {
  const path = regionPath(site.regionId);
  const where = [site.region, ...(path && normalizeSearch(path) !== normalizeSearch(site.region) ? [path] : []), site.country];
  return {
    fields: prepareNames({ primary: [site.name], secondary: where, joined: [[site.name, ...where].join(' ')] }),
    key: normalizeSearch(site.name),
    // Listed from the import, by its id: a curated seed that borrows a detail from OpenStreetMap is still curated.
    imported: site.id.startsWith('osm-'),
  };
}

function siteIndex(sites: readonly DiveSite[]): SiteEntry[] {
  let index = siteIndexes.get(sites);
  if (!index) {
    index = sites.map(siteEntry);
    siteIndexes.set(sites, index);
  }
  return index;
}

/**
 * Dive sites matching a name, region or country, best first, with how well each matched (1–100).
 * Sites that match equally well (every site in "Egypt") list the curated ones first, then by name.
 * Nothing for an empty query.
 */
export function scoreSites(sites: readonly DiveSite[], query: string): { site: DiveSite; score: number }[] {
  const q = prepareQuery(query);
  if (!q) return [];
  const index = siteIndex(sites);
  const hits: { site: DiveSite; score: number; entry: SiteEntry; order: number }[] = [];
  sites.forEach((site, order) => {
    const entry = index[order];
    const score = scoreFields(q, entry.fields);
    if (score > 0) hits.push({ site, score, entry, order });
  });
  return hits
    .sort(
      (a, b) =>
        b.score - a.score ||
        Number(a.entry.imported) - Number(b.entry.imported) ||
        (a.entry.key < b.entry.key ? -1 : a.entry.key > b.entry.key ? 1 : 0) ||
        a.order - b.order,
    )
    .map(({ site, score }) => ({ site, score }));
}

/** Dive sites matching a name, region or country. Every site when the query is empty. */
export function searchSites(sites: DiveSite[], query: string): DiveSite[] {
  return prepareQuery(query) ? scoreSites(sites, query).map((r) => r.site) : sites;
}
