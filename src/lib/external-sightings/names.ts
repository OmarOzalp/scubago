import { SPECIES } from '@/data/species';
import { SYNONYMS } from '@/lib/external-sightings/synonyms';
import type { Species } from '@/lib/types';

/** Words that stand where a species epithet would, but mean the animal was not identified to species. */
const NOT_AN_EPITHET = new Set(['sp', 'spp', 'cf', 'aff', 'gen', 'indet', 'complex', 'group', 'unidentified', 'var', 'subsp']);

/** Ranks above species: records at these ranks say nothing about one species and are ignored. */
const ABOVE_SPECIES = new Set([
  'stateofmatter', 'kingdom', 'subkingdom', 'phylum', 'subphylum', 'superclass', 'class', 'subclass',
  'infraclass', 'superorder', 'order', 'suborder', 'infraorder', 'parvorder', 'zoosection', 'zoosubsection',
  'superfamily', 'epifamily', 'family', 'subfamily', 'supertribe', 'tribe', 'subtribe', 'genus',
  'genushybrid', 'subgenus', 'section', 'subsection', 'complex',
]);

/** True for a rank name that is above species. Unknown or missing ranks are not (the name decides then). */
export function isAboveSpecies(rank: unknown): boolean {
  return typeof rank === 'string' && ABOVE_SPECIES.has(rank.trim().toLowerCase());
}

/**
 * The binomial a scientific name stands for, lowercase and single-spaced, or null when the name is not
 * a species: "Mobula alfredi (Krefft, 1868)" and "Mobula alfredi" are both "mobula alfredi";
 * "Chelonia mydas japonica" collapses to "chelonia mydas"; "Mobula", "Mobula sp." and
 * "Mobula cf. alfredi" are null, as are hybrids.
 */
export function normalizeScientificName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let text = raw.normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (!text || text.includes('×')) return null;
  // A name typed in capitals would read every word as an author.
  if (/[A-Z]/.test(text) && text === text.toUpperCase()) text = text.toLowerCase();
  // Authors in brackets, and a subgenus: "Sepia (Sepia) apama", "Mobula alfredi (Krefft, 1868)".
  text = text.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  const [genus, epithet] = text.split(' ');
  if (!genus || !epithet) return null;
  if (!/^[A-Za-z]{2,}$/.test(genus)) return null;
  // A capital here is an author ("Mobula Rafinesque, 1810"), a dot is an abbreviation ("sp.").
  if (!/^[a-z][a-z-]+$/.test(epithet) || NOT_AN_EPITHET.has(epithet)) return null;
  return `${genus.toLowerCase()} ${epithet}`;
}

/** How a record's taxon relates to the catalogue. */
export type TaxonMatch =
  | { kind: 'matched'; speciesId: string }
  /** A species (or below), but not one in the catalogue. */
  | { kind: 'unmatched' }
  /** Above species, unidentified or unreadable: not counted at all. */
  | { kind: 'ignored' };

export interface NameMatcher {
  /** The catalogue species id for a scientific name, if there is one. */
  match(rawName: unknown): string | undefined;
  /** Match any of several names for the same record (its name, then its accepted name); the first hit wins. */
  classify(names: readonly unknown[], rank?: unknown): TaxonMatch;
}

/**
 * A matcher over a catalogue: each species' own scientific name, plus the synonym table for the ids
 * the catalogue holds. A name is looked up as its normalised binomial, so authors, subspecies and
 * case do not matter.
 */
export function createNameMatcher(
  catalog: readonly Pick<Species, 'id' | 'scientificName'>[] = SPECIES,
  synonyms: Readonly<Record<string, string>> = SYNONYMS,
): NameMatcher {
  const ids = new Set(catalog.map((species) => species.id));
  const byName = new Map<string, string>();
  for (const [name, id] of Object.entries(synonyms)) {
    if (ids.has(id)) byName.set(name, id);
  }
  // The catalogue's own names go in last, so a synonym can never take a name from its owner.
  for (const species of catalog) {
    const name = normalizeScientificName(species.scientificName);
    if (name) byName.set(name, species.id);
  }

  const match = (rawName: unknown): string | undefined => {
    const name = normalizeScientificName(rawName);
    return name ? byName.get(name) : undefined;
  };

  const classify = (names: readonly unknown[], rank?: unknown): TaxonMatch => {
    if (isAboveSpecies(rank)) return { kind: 'ignored' };
    let readable = false;
    for (const name of names) {
      const normalised = normalizeScientificName(name);
      if (!normalised) continue;
      readable = true;
      const id = byName.get(normalised);
      if (id) return { kind: 'matched', speciesId: id };
    }
    return readable ? { kind: 'unmatched' } : { kind: 'ignored' };
  };

  return { match, classify };
}

/** The matcher for the app's catalogue. */
export const catalogMatcher: NameMatcher = createNameMatcher();
