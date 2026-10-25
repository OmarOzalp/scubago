import { TUNA_SCHOOL } from '@/lib/tuna-school';
import type { Category, DexEntry, Species } from '@/lib/types';

export type SpeciesMarineModel = 'whale-shark' | 'tiger-shark' | 'great-white-shark' | 'scalloped-hammerhead' | 'reef-manta' | 'mola-mola' | 'green-turtle' | 'bottlenose-dolphin'
  | 'day-octopus' | 'giant-cuttlefish' | 'giant-moray'
  | 'great-barracuda' | 'sailfish' | 'california-sea-lion' | 'spotted-eagle-ray' | 'golden-jellyfish' | 'clownfish'
  | 'humpback-whale' | 'sperm-whale' | 'oceanic-whitetip' | 'leatherback-turtle' | 'oceanic-manta'
  | 'harbor-seal' | 'sea-otter' | 'garibaldi' | 'leafy-seadragon' | 'orca'
  | 'marine-iguana' | 'galapagos-shark' | 'thresher-shark' | 'giant-trevally' | 'king-angelfish'
  | 'dugong' | 'sawfish' | 'lemon-shark' | 'southern-stingray' | 'tarpon'
  | 'grey-reef-shark' | 'blacktip-reef-shark' | 'whitetip-reef-shark' | 'hawksbill-turtle' | 'napoleon-wrasse' | 'bumphead-parrotfish'
  | 'sand-tiger-shark' | 'loggerhead-turtle' | 'goliath-grouper' | 'lionfish' | 'batfish';
export type MarineModel = 'shark' | 'manta' | 'reef-fish' | SpeciesMarineModel;
const SPECIES_MODELS: readonly string[] = ['whale-shark', 'tiger-shark', 'great-white-shark', 'scalloped-hammerhead', 'reef-manta', 'mola-mola', 'green-turtle', 'bottlenose-dolphin',
  'day-octopus', 'giant-cuttlefish', 'giant-moray',
  'great-barracuda', 'sailfish', 'california-sea-lion', 'spotted-eagle-ray', 'golden-jellyfish', 'clownfish',
  'humpback-whale', 'sperm-whale', 'oceanic-whitetip', 'leatherback-turtle', 'oceanic-manta',
  'harbor-seal', 'sea-otter', 'garibaldi', 'leafy-seadragon', 'orca',
  'marine-iguana', 'galapagos-shark', 'thresher-shark', 'giant-trevally', 'king-angelfish',
  'dugong', 'sawfish', 'lemon-shark', 'southern-stingray', 'tarpon',
  'grey-reef-shark', 'blacktip-reef-shark', 'whitetip-reef-shark', 'hawksbill-turtle', 'napoleon-wrasse', 'bumphead-parrotfish',
  'sand-tiger-shark', 'loggerhead-turtle', 'goliath-grouper', 'lionfish', 'batfish'] satisfies SpeciesMarineModel[];
/**
 * Species drawn with a close relative's model: the nearest body plan in the set, like a family
 * representative (so not offered as their own 3D model), and far closer than the generic one.
 */
const RELATIVES: Readonly<Record<string, SpeciesMarineModel>> = {
  'great-hammerhead': 'scalloped-hammerhead',
  'spinner-dolphin': 'bottlenose-dolphin',
  'giant-pacific-octopus': 'day-octopus',
  'blue-ringed-octopus': 'day-octopus',
  'mimic-octopus': 'day-octopus',
  'coconut-octopus': 'day-octopus',
  'broadclub-cuttlefish': 'giant-cuttlefish',
  'flamboyant-cuttlefish': 'giant-cuttlefish',
  'green-moray': 'giant-moray',
  'chevron-barracuda': 'great-barracuda',
  'weedy-seadragon': 'leafy-seadragon',
  'wolf-eel': 'giant-moray',
  'west-indian-manatee': 'dugong',
  'giant-grouper': 'goliath-grouper',
  'potato-cod': 'goliath-grouper',
  'giant-sea-bass': 'goliath-grouper',
  'circular-batfish': 'batfish',
  'olive-ridley-turtle': 'loggerhead-turtle',
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
/** None of the diver's discoveries is drawn for the island (or there are none yet): its ocean is empty. */
export function noneSwim(residents: DexEntry[]) {
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

/**
 * Taking turns. An island shows at most `MAX_ANIMATED` of its species at once; with more, they take turns one at a time: every
 * `every` seconds of the scene on show (each turn longer or shorter by up to `jitter` of that, each island at its own times) the
 * species longest on the island swims off out of the view and the next in the collection (round robin) swims in from the open sea.
 * A leaving species stays in the lineup for `leave` seconds, its lane held, while it swims off (the motion takes it off once out of
 * sight); then its lane is free again.
 */
export const TURNS = { every: 40, jitter: .25, leave: 30 };
/** One of the island's species on show: `leaving` while it swims off at the end of its turn. */
export type Turn = Swimmer & { leaving?: boolean };
/** Who is on an island and in what order they came, who is leaving, and where the round robin is. */
export type Lineup = {
  /** On the island, the first to come first (the next to leave, unless kept). */
  shown: Swimmer[];
  /** Leaving at the end of their turn, and how long (s) until their lane is free. */
  leaving: { swimmer: Swimmer; left: number }[];
  /** The species last brought on by the round robin, as its place among those that swim (the next is the first after it not on the island). */
  cursor: number;
  /** Turns taken so far. */
  turns: number;
};

/** The first lane (0 up) no swimmer in `taken` has. */
function freeLane(taken: readonly Swimmer[]) {
  let lane = 0;
  while (taken.some((s) => s.lane === lane)) lane++;
  return lane;
}
/** The swimmer for a species joining the island in a free lane. */
function joining(entry: DexEntry, taken: readonly Swimmer[]): Swimmer {
  return { species: entry.species, model: marineModelFor(entry.species)!, lane: freeLane(taken) };
}
/** Whom the round robin brings on next: the first species after the cursor that is neither on the island nor leaving (null if none). */
function nextUp(lineup: Lineup, eligible: DexEntry[]) {
  const busy = new Set([...lineup.shown, ...lineup.leaving.map((l) => l.swimmer)].map((s) => s.species.id));
  for (let k = 1; k <= eligible.length; k++) {
    const index = (lineup.cursor + k) % eligible.length;
    if (!busy.has(eligible[index].species.id)) return { entry: eligible[index], index };
  }
  return null;
}

/** An island's lineup as a visit begins: the first of its species in collection order (a featured new one among them, see pickSwimmers). */
export function startLineup(residents: DexEntry[], limit = MAX_ANIMATED, featured: readonly string[] = []): Lineup {
  const eligible = swimming(residents);
  return { shown: pickSwimmers(residents, 0, limit, featured), leaving: [], cursor: Math.min(limit, eligible.length) - 1, turns: 0 };
}

/**
 * The lineup after the collection (or the featured new species) changed: a species no longer logged is gone at once; a featured one
 * not on the island comes on, the one longest there leaving if the island is full; free places fill in round robin. Who stays keeps
 * their lane. Unchanged (the same object) if nothing changed.
 */
export function syncLineup(lineup: Lineup, residents: DexEntry[], limit = MAX_ANIMATED, featured: readonly string[] = []): Lineup {
  const eligible = swimming(residents), byId = new Map(eligible.map((r) => [r.species.id, r]));
  const current = (s: Swimmer): Swimmer | null => {
    const entry = byId.get(s.species.id);
    return entry ? (entry.species === s.species ? s : { ...s, species: entry.species }) : null;
  };
  const shown = lineup.shown.map(current).filter((s): s is Swimmer => s !== null);
  const leaving = lineup.leaving.flatMap((l) => { const s = current(l.swimmer); return s ? [s === l.swimmer ? l : { ...l, swimmer: s }] : []; });
  let next: Lineup = { ...lineup, shown, leaving };
  for (const id of featured) {
    const entry = byId.get(id);
    if (!entry || next.shown.some((s) => s.species.id === id)) continue;
    // (a featured species leaving comes straight back: its lane is still its own)
    const back = next.leaving.find((l) => l.swimmer.species.id === id);
    const out = next.shown.length >= limit ? next.shown.find((s) => !featured.includes(s.species.id)) : undefined;
    if (next.shown.length >= limit && !out) continue;
    const taken = [...next.shown, ...next.leaving.map((l) => l.swimmer)];
    next = {
      ...next,
      shown: [...next.shown.filter((s) => s !== out), back?.swimmer ?? joining(entry, taken)],
      leaving: [...next.leaving.filter((l) => l !== back), ...(out ? [{ swimmer: out, left: TURNS.leave }] : [])],
    };
  }
  while (next.shown.length < Math.min(limit, eligible.length)) {
    const up = nextUp(next, eligible);
    if (!up) break;
    next = { ...next, shown: [...next.shown, joining(up.entry, [...next.shown, ...next.leaving.map((l) => l.swimmer)])], cursor: up.index };
  }
  const same = next.shown.length === lineup.shown.length && next.shown.every((s, i) => s === lineup.shown[i])
    && next.leaving.length === lineup.leaving.length && next.leaving.every((l, i) => l === lineup.leaving[i]);
  return same ? lineup : next;
}

/**
 * One turn: the species longest on the island (not one of `keep`, a new discovery being shown) leaves, and the next in round robin comes
 * on in a free lane. Unchanged (the same object) when there is nobody to bring on (everyone fits) or nobody may leave.
 */
export function takeTurn(lineup: Lineup, residents: DexEntry[], keep: readonly string[] = []): Lineup {
  const eligible = swimming(residents), up = nextUp(lineup, eligible);
  const out = lineup.shown.find((s) => !keep.includes(s.species.id));
  if (!up || !out) return lineup;
  const leaving = [...lineup.leaving, { swimmer: out, left: TURNS.leave }];
  const shown = lineup.shown.filter((s) => s !== out);
  return { shown: [...shown, joining(up.entry, [...shown, ...leaving.map((l) => l.swimmer)])], leaving, cursor: up.index, turns: lineup.turns + 1 };
}

/** `seconds` of the scene on show: leaving species whose time is up free their lanes. Unchanged (the same object) if none. */
export function ageLineup(lineup: Lineup, seconds: number): Lineup {
  if (!lineup.leaving.length) return lineup;
  const leaving = lineup.leaving.map((l) => ({ ...l, left: l.left - seconds })).filter((l) => l.left > 0);
  return { ...lineup, leaving };
}

/** The island's species to put in the scene: those on it, then those leaving. */
export function lineupSwimmers(lineup: Lineup): Turn[] {
  return [...lineup.shown, ...lineup.leaving.map((l) => ({ ...l.swimmer, leaving: true }))];
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
