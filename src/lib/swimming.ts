import { TUNA_SCHOOL } from '@/lib/tuna-school';
import type { Category, DexEntry, Species } from '@/lib/types';

export type SpeciesMarineModel = 'whale-shark' | 'tiger-shark' | 'great-white-shark' | 'scalloped-hammerhead' | 'reef-manta' | 'mola-mola' | 'green-turtle' | 'bottlenose-dolphin';
export type MarineModel = 'shark' | 'manta' | 'reef-fish' | SpeciesMarineModel;
const SPECIES_MODELS: readonly string[] = ['whale-shark', 'tiger-shark', 'great-white-shark', 'scalloped-hammerhead', 'reef-manta', 'mola-mola', 'green-turtle', 'bottlenose-dolphin'] satisfies SpeciesMarineModel[];
/**
 * Species drawn with a close relative's model: the nearest body plan in the set, like a family
 * representative (so not offered as their own 3D model), and far closer than the generic one.
 */
const RELATIVES: Readonly<Record<string, SpeciesMarineModel>> = {
  'great-hammerhead': 'scalloped-hammerhead',
  'spinner-dolphin': 'bottlenose-dolphin',
};
export function speciesMarineModel(id: string): SpeciesMarineModel | null {
  return SPECIES_MODELS.includes(id) ? id as SpeciesMarineModel : null;
}
/** Exact art takes precedence, then a close relative's; other supported species use a family representative. */
export function marineModelFor(species: Pick<Species, 'id' | 'category'> | Category): MarineModel | null {
  if (typeof species !== 'string') {
    const specific = speciesMarineModel(species.id) ?? (Object.hasOwn(RELATIVES, species.id) ? RELATIVES[species.id] : null);
    if (specific) return specific;
  }
  const category = typeof species === 'string' ? species : species.category;
  if (category === 'shark') return 'shark';
  if (category === 'ray') return 'manta';
  if (category === 'fish') return 'reef-fish';
  return null;
}

/**
 * The tuna the island's school stands for (src/lib/tuna-school.ts), the species it is drawn after
 * first. The school owns their visualization: a logged one is shown by the school, never also as a
 * generic reef fish (both are in the 'fish' family). Other fish keep the family model.
 */
export const SCHOOL_SPECIES = ['yellowfin-tuna', 'dogtooth-tuna'] as const;
/** Whether the school shows this species. With the school left out (TUNA_SCHOOL.size 0), tuna swim as fish again. */
export function swimsInSchool(id: string) {
  return TUNA_SCHOOL.size > 0 && (SCHOOL_SPECIES as readonly string[]).includes(id);
}
/** Whether the island has the tuna school: only once a tuna it stands for is logged. */
export function hasSchool(residents: DexEntry[]) {
  return residents.some((r) => swimsInSchool(r.species.id));
}
/** The species a tap on the school opens: a logged tuna it stands for, else the one it is drawn after. */
export function schoolSpeciesFor(residents: DexEntry[]): string {
  return SCHOOL_SPECIES.find((id) => residents.some((r) => r.species.id === id)) ?? SCHOOL_SPECIES[0];
}

/** Bound skeleton animation work on phones; the rest of the collection stays reachable below the scene. */
export const MAX_ANIMATED = 8;
export type Swimmer = { species: Species; model: MarineModel; lane: number };

/** Logged species the island shows: as their own animal, or in the tuna school. */
function shown(residents: DexEntry[]) {
  return residents.filter((r) => swimsInSchool(r.species.id) || marineModelFor(r.species) !== null);
}
/** Logged species that swim as their own animal: every species with a model, except those the school shows. */
function swimming(residents: DexEntry[]) {
  return residents.filter((r) => !swimsInSchool(r.species.id) && marineModelFor(r.species) !== null);
}
export function swimmerPages(residents: DexEntry[], limit = MAX_ANIMATED) {
  return Math.max(1, Math.ceil(swimming(residents).length / limit));
}
/** An empty ocean gets a clearly labeled visiting shark and ray instead of nothing. */
export function showsPreview(residents: DexEntry[]) {
  return shown(residents).length === 0;
}
/**
 * Deterministic: the same collection and page always yield the same animals in the same lanes.
 * `featured` species (a new discovery arriving) are guaranteed a place: those not on this page take
 * the last places on it, so the island never animates more than `limit` animals.
 */
export function pickSwimmers(residents: DexEntry[], page = 0, limit = MAX_ANIMATED, featured: readonly string[] = []): Swimmer[] {
  const eligible = swimming(residents);
  const start = (page % swimmerPages(residents, limit)) * limit;
  let chosen = eligible.slice(start, start + limit);
  const extra = eligible.filter((r) => featured.includes(r.species.id) && !chosen.includes(r)).slice(0, limit);
  if (extra.length > 0) {
    const keep = chosen.filter((r) => featured.includes(r.species.id));
    const others = chosen.filter((r) => !featured.includes(r.species.id)).slice(0, Math.max(0, limit - keep.length - extra.length));
    chosen = chosen.filter((r) => others.includes(r) || keep.includes(r)).concat(extra);
  }
  return chosen.map((r, lane) => ({ species: r.species, model: marineModelFor(r.species)!, lane }));
}

/** How a species shows up on the island: as its own animal, in the tuna school, or not at all. */
export function islandPresence(species: Pick<Species, 'id' | 'category'>): 'animal' | 'school' | null {
  if (swimsInSchool(species.id)) return 'school';
  return marineModelFor(species) ? 'animal' : null;
}

/** World coordinates: island at origin, Y up, animal nose points along local +Z. */
export function sampleSwimPath(time: number, lane: number) {
  const speed = .095 + (lane % 4) * .007;
  const direction = lane % 3 === 2 ? -1 : 1;
  const angle = time * speed * direction + lane * 2.399963;
  const rx = 3.65 + (lane % 3) * .38;
  const rz = 3.05 + (lane % 2) * .34;
  const x = Math.cos(angle) * rx;
  const z = Math.sin(angle) * rz;
  const dx = -Math.sin(angle) * rx * direction;
  const dz = Math.cos(angle) * rz * direction;
  return {
    x, z, y: -.02 + Math.sin(time * .37 + lane) * .06,
    heading: Math.atan2(dx, dz),
    bank: direction * (.06 + Math.sin(angle * 2) * .035),
  };
}

/** Drop background time instead of teleporting or catching up on resume. */
export function advanceSwimTime(time: number, delta: number, active: boolean) {
  return time + (active ? Math.max(0, Math.min(delta, .05)) : 0);
}
