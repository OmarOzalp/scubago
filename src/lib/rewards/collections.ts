import { AREAS, type AreaId, residentsOf } from '@/lib/archipelago';
import type { Facts } from '@/lib/rewards/facts';
import type { Emblem } from '@/lib/rewards/types';
import type { Category, Species } from '@/lib/types';

/** Where a collection's species come from: an archipelago area, a catalog category, or a hand-picked list of species ids. */
export type CollectionSource =
  | { type: 'area'; area: AreaId }
  | { type: 'category'; category: Category }
  | { type: 'species'; ids: readonly string[] };

export type CollectionKind = 'area' | 'family' | 'curated';

/** A named set of species. Completing one also earns a badge (`badge`, in the logbook's voice). */
export interface CollectionDefinition {
  /** Stable, safe to store: 'area-<area id>', 'family-<category>' or 'set-<name>'. */
  id: string;
  title: string;
  description: string;
  kind: CollectionKind;
  emblem: Emblem;
  /** The singular and plural of what the set holds, for hints such as "2 more reef sharks". */
  unit: readonly [string, string];
  source: CollectionSource;
  /**
   * The fewest species the catalog must have for the set to exist at all (default 1, so a family
   * with a single species is still a family). A hand-picked set says what it needs: the hammerheads
   * are a pair, so both must be in the catalog, and the Red Sea classics need three of their seven.
   */
  minMembers?: number;
  /** The badge for completing it. */
  badge: { title: string; description: string };
}

const AREA_COLLECTIONS: CollectionDefinition[] = AREAS.map((area) => ({
  id: `area-${area.id}`,
  title: area.name,
  description: area.blurb,
  kind: 'area',
  emblem: 'island',
  unit: [`${area.name} animal`, `${area.name} animals`],
  source: { type: 'area', area: area.id },
  badge: { title: `${area.name} keeper`, description: `Log every animal that lives in the ${area.name}.` },
}));

const FAMILY_COLLECTIONS: CollectionDefinition[] = [
  { id: 'family-shark', title: 'Sharks', description: 'Every shark in the catalog, from the nurse shark to the whale shark.', kind: 'family', emblem: 'shark',
    unit: ['shark', 'sharks'], source: { type: 'category', category: 'shark' },
    badge: { title: 'Every shark', description: 'Every shark in the catalog, logged in your own hand.' } },
  { id: 'family-ray', title: 'Rays', description: 'Every ray in the catalog, from the ribbontail to the manta.', kind: 'family', emblem: 'ray',
    unit: ['ray', 'rays'], source: { type: 'category', category: 'ray' },
    badge: { title: 'Every ray', description: 'Every ray in the catalog: a whole sky of wings.' } },
  { id: 'family-turtle', title: 'Turtles', description: 'Every sea turtle in the catalog.', kind: 'family', emblem: 'turtle',
    unit: ['turtle', 'turtles'], source: { type: 'category', category: 'turtle' },
    badge: { title: 'Every turtle', description: 'Every sea turtle in the catalog, slow and steady.' } },
  { id: 'family-mammal', title: 'Marine mammals', description: 'Every whale, dolphin, seal and other sea mammal in the catalog.', kind: 'family', emblem: 'mammal',
    unit: ['marine mammal', 'marine mammals'], source: { type: 'category', category: 'mammal' },
    badge: { title: 'Every marine mammal', description: 'Every warm-blooded sea mammal in the catalog.' } },
  { id: 'family-cephalopod', title: 'Cephalopods', description: 'Every octopus, cuttlefish, squid and nautilus in the catalog.', kind: 'family', emblem: 'cephalopod',
    unit: ['cephalopod', 'cephalopods'], source: { type: 'category', category: 'cephalopod' },
    badge: { title: 'Every cephalopod', description: 'Every octopus, cuttlefish, squid and nautilus in the catalog.' } },
];

/**
 * Hand-picked sets, by species id. A set must not repeat another collection: an area's residents
 * are already its collection (the Shipwreck's nine were once a second "Wreck regulars" set, which
 * earned two badges for finishing one), so a curated set is a different cut across the catalog.
 * The hammerheads are the one set of two, kept because it crosses two islands (the scalloped
 * hammerhead is a Volcanic Pinnacle animal, the great hammerhead a Mangroves one): `minMembers: 2`
 * means it exists only while the catalog holds both, and "a pair" is what its badge celebrates.
 * The Red Sea classics are species seen on the Red Sea sites in src/data/sites.ts (and well known
 * there), picked by hand rather than counted from records; they are left out of a catalog that has
 * fewer than three of them.
 */
const CURATED_COLLECTIONS: CollectionDefinition[] = [
  { id: 'set-reef-sharks', title: 'Reef sharks', description: 'Grey, blacktip and whitetip: the sharks of the Indo-Pacific reef.', kind: 'curated', emblem: 'shark',
    unit: ['reef shark', 'reef sharks'], source: { type: 'species', ids: ['grey-reef-shark', 'blacktip-reef-shark', 'whitetip-reef-shark'] },
    badge: { title: 'Reef patrol', description: 'Grey, blacktip and whitetip: all three reef sharks logged.' } },
  { id: 'set-mantas-and-devils', title: 'Mantas & devils', description: 'The reef manta, the oceanic manta and Munk’s devil ray: the great gliders.', kind: 'curated', emblem: 'ray',
    unit: ['manta or devil ray', 'mantas and devil rays'], source: { type: 'species', ids: ['reef-manta', 'oceanic-manta', 'munks-devil-ray'] },
    badge: { title: 'Gliders', description: 'Both mantas and Munk’s devil ray, all in your book.' } },
  { id: 'set-hammerheads', title: 'Hammerheads', description: 'The scalloped and the great: the sharks with scanners for heads.', kind: 'curated', emblem: 'shark',
    unit: ['hammerhead', 'hammerheads'], minMembers: 2, source: { type: 'species', ids: ['scalloped-hammerhead', 'great-hammerhead'] },
    badge: { title: 'Hammer pair', description: 'The scalloped and the great hammerhead, both logged.' } },
  { id: 'set-red-sea-classics', title: 'Red Sea classics', description: 'The animals divers come to the Red Sea to meet.', kind: 'curated', emblem: 'wave',
    unit: ['Red Sea classic', 'Red Sea classics'], minMembers: 3,
    source: { type: 'species', ids: ['sea-goldie', 'napoleon-wrasse', 'oceanic-whitetip', 'scalloped-hammerhead', 'thresher-shark', 'emperor-angelfish', 'moorish-idol'] },
    badge: { title: 'Red Sea classic', description: 'Every Red Sea classic, from the anthias to the hammerheads.' } },
];

/** Every collection, in the order they are listed: the areas, the families, then the hand-picked sets. */
export const COLLECTIONS: readonly CollectionDefinition[] = [...AREA_COLLECTIONS, ...FAMILY_COLLECTIONS, ...CURATED_COLLECTIONS];

/** The species ids of a collection that the catalog has, in the catalog's order for a family and the source's order otherwise. */
export function collectionMembers(definition: CollectionDefinition, catalog: ReadonlyMap<string, Species>): string[] {
  const { source } = definition;
  if (source.type === 'category') return [...catalog.values()].filter((s) => s.category === source.category).map((s) => s.id);
  const ids = source.type === 'area' ? residentsOf(source.area) : source.ids;
  return ids.filter((id) => catalog.has(id));
}

/** How the diver stands with one collection. */
export interface CollectionResult {
  id: string;
  title: string;
  description: string;
  kind: CollectionKind;
  emblem: Emblem;
  /** The archipelago area of an 'area' collection (its colour and island are looked up from this). */
  areaId?: AreaId;
  found: number;
  total: number;
  /** Every species in the collection the catalog has, in the collection's own order (the catalog's for a family, the source's otherwise). */
  memberIds: string[];
  /** The members the diver has logged, and the ones still to find: `memberIds` split in two, each in the same order. */
  foundIds: string[];
  missingIds: string[];
  completed: boolean;
  /** yyyy-mm-dd the last missing member was first logged. */
  completedOn?: string;
  /** "2 more reef sharks", while it is incomplete. */
  hint?: string;
}

export const moreOf = (left: number, unit: readonly [string, string]) => `${left} more ${left === 1 ? unit[0] : unit[1]}`;

/**
 * Every collection the catalog can fill, with the diver's progress. A collection with no members
 * in the catalog, or fewer than its `minMembers`, is left out.
 */
export function collectionsFrom(facts: Facts): CollectionResult[] {
  const results: CollectionResult[] = [];
  for (const definition of COLLECTIONS) {
    const members = collectionMembers(definition, facts.input.catalog);
    if (members.length === 0 || members.length < (definition.minMembers ?? 1)) continue;
    const foundIds = members.filter((id) => facts.findOf.has(id));
    const missingIds = members.filter((id) => !facts.findOf.has(id));
    const completed = missingIds.length === 0;
    const result: CollectionResult = {
      id: definition.id,
      title: definition.title,
      description: definition.description,
      kind: definition.kind,
      emblem: definition.emblem,
      found: foundIds.length,
      total: members.length,
      memberIds: members,
      foundIds,
      missingIds,
      completed,
    };
    if (definition.source.type === 'area') result.areaId = definition.source.area;
    if (completed) result.completedOn = foundIds.map((id) => facts.findOf.get(id)!.on).reduce((latest, on) => (on > latest ? on : latest));
    else result.hint = moreOf(missingIds.length, definition.unit);
    results.push(result);
  }
  return results;
}
