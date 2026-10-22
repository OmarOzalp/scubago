/**
 * What goes on a share card, worked out from the diver's own records. A card goes out into the
 * world, so only what the diver has shared goes on it:
 *
 * - a sighting marked private (`visibility: 'private'`) is left out of everything: the species it
 *   found, the counts, the dates, the dive page's animals;
 * - notes and photos are never put on a card (the cards have no place for either);
 * - a dive's own notes stay off unless the caller asks for them;
 * - no coordinates, and no signatures: only a buddy's name.
 *
 * Example sightings (`isDemo`) aren't the diver's and are left out too.
 *
 * Private sightings go on a card only when the diver says so in the preview (`includePrivate`): the
 * card is theirs to send, and nothing leaves the phone until they tap Share. When everything a card
 * would show is private, the preview includes them from the start, so a diver who logs everything as
 * "Only me" isn't handed an empty card (share-buttons.tsx).
 */
import { AREAS, areaOf, foundIslands, ISLANDS, type AreaId, type IslandId } from '@/lib/archipelago';
import { CATALOG_BY_ID, speciesForSighting, UNLISTED_ID } from '@/lib/catalog';
import { joinedAt } from '@/lib/discoveries';
import { deriveHome } from '@/lib/home';
import { isPrivateSighting } from '@/lib/privacy';
import { RARITY_LABEL, rarityRank } from '@/lib/rarity';
import type { Dive, DiveSite, Sighting, Species } from '@/lib/types';

/** How many species a dive page card shows as plates before saying "+N more". */
export const MAX_DIVE_SPECIES = 6;
/** How many of the diver's rarest finds the archipelago card shows. */
export const RAREST_FINDS = 3;
/** The islands the archipelago can grow. */
export const ISLAND_COUNT = Object.keys(ISLANDS).length;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "12 Mar 2026" from yyyy-mm-dd, the same in every engine and locale. */
export function cardDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d || m > 12) return iso;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** "28" or "28.5". */
export const trimNumber = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** Whether a card also draws the diver's private sightings (they chose to, in the preview). */
export interface CardOptions {
  includePrivate?: boolean;
}

/** The sightings that may go on a card: the diver's own real ones, and the private ones only when asked. */
export function sharedSightings(sightings: readonly Sighting[], ownerId?: string, { includePrivate = false }: CardOptions = {}): Sighting[] {
  return sightings.filter((s) => !s.isDemo && (includePrivate || !isPrivateSighting(s)) && (ownerId === undefined || s.userId === ownerId));
}

/** How many of the diver's own real sightings are kept off the cards because they're private. */
export function privateCount(sightings: readonly Sighting[], ownerId?: string): number {
  return sightings.filter((s) => !s.isDemo && isPrivateSighting(s) && (ownerId === undefined || s.userId === ownerId)).length;
}

// ── Discovery ────────────────────────────────────────────────────────────────────────────────────

export interface DiscoveryData {
  species: Species;
  /** yyyy-mm-dd. */
  firstSeenOn: string;
  siteName?: string;
  /** The order the species joined the collection: 1 for the first. */
  collectionNumber: number;
  areaId?: AreaId;
}

/**
 * One species the diver has found, or null if they haven't shared a sighting of it. `ownerId`
 * limits the sightings to the diver's own (the species screen passes the signed-in diver).
 */
export function discoveryData(
  species: Species,
  sightings: readonly Sighting[],
  sites: readonly Pick<DiveSite, 'id' | 'name'>[],
  ownerId?: string,
  catalog: ReadonlyMap<string, Species> = CATALOG_BY_ID,
  options: CardOptions = {},
): DiscoveryData | null {
  const shared = sharedSightings(sightings, ownerId, options).filter((s) => catalog.has(s.speciesId));
  const mine = shared.filter((s) => s.speciesId === species.id).sort((a, b) => a.sightedOn.localeCompare(b.sightedOn) || a.createdAt.localeCompare(b.createdAt));
  if (mine.length === 0) return null;
  const first = mine[0];
  // Joining order: when each species first joined the collection, ties by name so it never shuffles.
  const order = [...joinedAt(shared)].sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0])).map(([id]) => id);
  return {
    species,
    firstSeenOn: first.sightedOn,
    siteName: sites.find((s) => s.id === first.siteId)?.name,
    collectionNumber: Math.max(1, order.indexOf(species.id) + 1),
    areaId: areaOf(species.id) ?? undefined,
  };
}

export function areaName(id: AreaId | undefined): string | undefined {
  return id ? AREAS.find((a) => a.id === id)?.name : undefined;
}

// ── Dive page ────────────────────────────────────────────────────────────────────────────────────

export interface DiveCardData {
  number: number;
  siteName: string;
  /** "Ras Mohammed, Egypt". */
  region?: string;
  divedOn: string;
  maxDepthM?: number;
  bottomTimeMin?: number;
  waterTempC?: number;
  visibilityM?: number;
  /** Every species seen on the dive (the card shows a few and says "+N more"). Rarest first. */
  species: Species[];
  centreName?: string;
  buddyName?: string;
  /** Only when the caller asked for the dive's notes. */
  notes?: string;
}

/** A dive page, ready for its card. `includeNotes` and `includePrivate` are off unless the diver chose them. */
export function diveCardData(
  dive: Dive,
  site: Pick<DiveSite, 'name' | 'region' | 'country'> | undefined,
  sightings: readonly Sighting[],
  { includeNotes = false, includePrivate = false }: { includeNotes?: boolean } & CardOptions = {},
): DiveCardData {
  const seen = new Map<string, Species>();
  for (const s of sharedSightings(sightings, dive.userId, { includePrivate }).filter((x) => x.diveId === dive.id)) {
    const species = speciesForSighting(s);
    // A catalogue species is one animal per id; a diver's own name for "something else", one per name.
    if (species) seen.set(species.id === UNLISTED_ID ? `${UNLISTED_ID}:${species.commonName}` : species.id, species);
  }
  const species = [...seen.values()].sort((a, b) => rarityRank(b.rarity) - rarityRank(a.rarity) || a.commonName.localeCompare(b.commonName));
  const notes = includeNotes ? dive.notes?.trim() : undefined;
  return {
    number: dive.number,
    siteName: site?.name ?? 'Unknown site',
    region: site ? [site.region, site.country].filter(Boolean).join(', ') || undefined : undefined,
    divedOn: dive.divedOn,
    maxDepthM: dive.maxDepthM,
    bottomTimeMin: dive.bottomTimeMin,
    waterTempC: dive.waterTempC,
    visibilityM: dive.visibilityM,
    species,
    centreName: dive.centreName?.trim() || undefined,
    buddyName: dive.buddyName?.trim() || undefined,
    notes: notes || undefined,
  };
}

// ── Archipelago ──────────────────────────────────────────────────────────────────────────────────

export interface ArchipelagoData {
  name: string;
  level: number;
  rank: string;
  speciesCount: number;
  islandsFound: number;
  islands: IslandId[];
  sitesDived: number;
  /** The diver's rarest finds, rarest first. */
  rarest: Species[];
}

/** The diver's archipelago, from what they've shared. Null while it is empty. */
export function archipelagoData(
  name: string,
  sightings: readonly Sighting[],
  dives: readonly Pick<Dive, 'siteId' | 'userId'>[],
  ownerId?: string,
  catalog: Map<string, Species> = CATALOG_BY_ID,
  options: CardOptions = {},
): ArchipelagoData | null {
  const shared = sharedSightings(sightings, ownerId, options);
  const home = deriveHome(shared, catalog);
  if (home.residents.length === 0) return null;
  const sites = new Set<string>([...shared.map((s) => s.siteId), ...dives.filter((d) => ownerId === undefined || d.userId === ownerId).map((d) => d.siteId)]);
  const islands = foundIslands(home.residents);
  return {
    name: name.trim() || 'My little island',
    level: home.level,
    rank: home.stage.rank,
    speciesCount: home.residents.length,
    islandsFound: islands.length,
    islands,
    sitesDived: sites.size,
    rarest: home.residents.slice(0, RAREST_FINDS).map((r) => r.species),
  };
}

// ── What a screen reader says for a card ─────────────────────────────────────────────────────────

export function describeDiscovery(d: DiscoveryData, observedNote?: string): string {
  const area = areaName(d.areaId);
  return [
    `${d.species.commonName}, ${d.species.scientificName}. ${RARITY_LABEL[d.species.rarity]} species.`,
    `First seen ${cardDate(d.firstSeenOn)}${d.siteName ? ` at ${d.siteName}` : ''}.`,
    `Number ${d.collectionNumber} in my collection.`,
    area ? `Lives in the ${area}.` : null,
    observedNote?.trim() ? `${observedNote.trim()}.`.replace(/\.\.$/, '.') : null,
  ]
    .filter(Boolean)
    .join(' ');
}

export function describeDive(d: DiveCardData): string {
  const measures = [
    d.maxDepthM !== undefined ? `maximum depth ${trimNumber(d.maxDepthM)} metres` : null,
    d.bottomTimeMin !== undefined ? `bottom time ${d.bottomTimeMin} minutes` : null,
    d.waterTempC !== undefined ? `water ${trimNumber(d.waterTempC)} degrees` : null,
    d.visibilityM !== undefined ? `visibility ${trimNumber(d.visibilityM)} metres` : null,
  ].filter(Boolean);
  return [
    `Dive number ${d.number} at ${d.siteName}${d.region ? `, ${d.region}` : ''}, ${cardDate(d.divedOn)}.`,
    measures.length ? `${measures.join(', ')}.` : null,
    d.species.length ? `Seen: ${d.species.map((s) => s.commonName).join(', ')}.` : null,
    d.buddyName ? `Dived with ${d.buddyName}.` : null,
    d.centreName ? `Stamped ${d.centreName}, not verified.` : null,
  ]
    .filter(Boolean)
    .join(' ');
}

export function describeArchipelago(d: ArchipelagoData): string {
  return [
    `${d.name}, ${d.rank}, level ${d.level}.`,
    `${d.speciesCount} species, ${d.islandsFound} of ${ISLAND_COUNT} islands found, ${d.sitesDived} ${d.sitesDived === 1 ? 'site' : 'sites'} dived.`,
    d.rarest.length ? `Rarest finds: ${d.rarest.map((s) => `${s.commonName}, ${RARITY_LABEL[s.rarity].toLowerCase()}`).join('; ')}.` : null,
  ]
    .filter(Boolean)
    .join(' ');
}
