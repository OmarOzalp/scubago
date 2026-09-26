import type { Category, DexEntry, Species } from '@/lib/types';

export type SpeciesMarineModel = 'whale-shark' | 'tiger-shark' | 'great-white-shark' | 'reef-manta';
export type MarineModel = 'shark' | 'manta' | 'reef-fish' | SpeciesMarineModel;
const SPECIES_MODELS: readonly string[] = ['whale-shark', 'tiger-shark', 'great-white-shark', 'reef-manta'] satisfies SpeciesMarineModel[];
export function speciesMarineModel(id: string): SpeciesMarineModel | null {
  return SPECIES_MODELS.includes(id) ? id as SpeciesMarineModel : null;
}
/** Exact art takes precedence; other supported species use a family representative. */
export function marineModelFor(species: Pick<Species, 'id' | 'category'> | Category): MarineModel | null {
  if (typeof species !== 'string') {
    const exact = speciesMarineModel(species.id);
    if (exact) return exact;
  }
  const category = typeof species === 'string' ? species : species.category;
  if (category === 'shark') return 'shark';
  if (category === 'ray') return 'manta';
  if (category === 'fish') return 'reef-fish';
  return null;
}

/** Bound skeleton animation work on phones; the rest of the collection stays reachable below the scene. */
export const MAX_ANIMATED = 8;
export type Swimmer = { species: Species; model: MarineModel; lane: number };

function rigged(residents: DexEntry[]) {
  return residents.filter((r) => marineModelFor(r.species) !== null);
}
export function swimmerPages(residents: DexEntry[], limit = MAX_ANIMATED) {
  return Math.max(1, Math.ceil(rigged(residents).length / limit));
}
/** An empty ocean gets a clearly labeled visiting shark and ray instead of nothing. */
export function showsPreview(residents: DexEntry[]) {
  return rigged(residents).length === 0;
}
/** Deterministic: the same collection and page always yield the same animals in the same lanes. */
export function pickSwimmers(residents: DexEntry[], page = 0, limit = MAX_ANIMATED): Swimmer[] {
  const eligible = rigged(residents);
  const start = (page % swimmerPages(residents, limit)) * limit;
  return eligible.slice(start, start + limit).map((r, lane) => ({ species: r.species, model: marineModelFor(r.species)!, lane }));
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
