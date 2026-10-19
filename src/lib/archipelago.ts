import type { DexEntry } from './types';

/**
 * The archipelago (docs/archipelago.md): the areas of the ocean the diver's animals live in, each
 * named for the kind of place a diver meets them. Every species in the catalog lives in one area,
 * and an area appears on Home with the first species logged from it. `color` marks it in the app
 * (a dot beside its name, never on its own).
 */
export const AREAS = [
  { id: 'coral-reef', name: 'Coral Reef', color: '#2E9C8F', blurb: 'A sandy island ringed with coral: reef sharks, turtles, mantas and reef fish' },
  { id: 'open-ocean', name: 'Open Ocean', color: '#2B5F9E', blurb: 'The deep blue all around the islands: whales, oceanic sharks, sailfish and tuna' },
  { id: 'kelp-forest', name: 'Kelp Forest', color: '#7A8B3C', blurb: 'A cold, rocky coast of towering kelp: sea otters, seals, seadragons and great whites' },
  { id: 'mangroves', name: 'Mangroves & Seagrass', color: '#4F8A4B', blurb: 'A warm, shallow lagoon of mangrove roots and seagrass: dugongs, manatees and young sharks' },
  { id: 'volcanic-pinnacle', name: 'Volcanic Pinnacle', color: '#5B5753', blurb: 'A black lava island in strong currents: schooling hammerheads, sea lions and marine iguanas' },
  { id: 'black-sand-bay', name: 'Black Sand Bay', color: '#3E4A5C', blurb: 'A volcanic sand slope full of strange small life: frogfish, mimic octopuses and nudibranchs' },
  { id: 'shipwreck', name: 'Shipwreck', color: '#9A5B3C', blurb: 'An old wreck on the sand: sand tiger sharks, giant groupers and lionfish' },
] as const;
export type AreaId = typeof AREAS[number]['id'];
export type Area = typeof AREAS[number];

/** Who lives where: every species in the catalog, once (where divers meet it most). */
const RESIDENTS: Record<AreaId, readonly string[]> = {
  'coral-reef': ['grey-reef-shark', 'blacktip-reef-shark', 'whitetip-reef-shark', 'zebra-shark', 'tasselled-wobbegong', 'reef-manta', 'bluespotted-ribbontail-ray',
    'hawksbill-turtle', 'napoleon-wrasse', 'bumphead-parrotfish', 'potato-cod', 'clownfish', 'moorish-idol', 'emperor-angelfish', 'french-angelfish', 'queen-angelfish',
    'raccoon-butterflyfish', 'stoplight-parrotfish', 'titan-triggerfish', 'clown-triggerfish', 'queen-triggerfish', 'giant-moray', 'blue-tang', 'oriental-sweetlips',
    'star-puffer', 'yellow-boxfish', 'trumpetfish', 'sea-goldie', 'christmas-tree-worm', 'giant-clam', 'day-octopus', 'broadclub-cuttlefish', 'banded-sea-krait',
    'golden-jellyfish'],
  'open-ocean': ['whale-shark', 'oceanic-whitetip', 'shortfin-mako', 'silky-shark', 'oceanic-manta', 'munks-devil-ray', 'olive-ridley-turtle', 'leatherback-turtle',
    'bottlenose-dolphin', 'spinner-dolphin', 'humpback-whale', 'sperm-whale', 'mola-mola', 'sailfish', 'yellowfin-tuna'],
  'kelp-forest': ['great-white-shark', 'basking-shark', 'orca', 'california-sea-lion', 'harbor-seal', 'sea-otter', 'leafy-seadragon', 'weedy-seadragon', 'garibaldi',
    'giant-sea-bass', 'wolf-eel', 'lingcod', 'giant-pacific-octopus', 'giant-cuttlefish'],
  mangroves: ['tiger-shark', 'great-hammerhead', 'bull-shark', 'lemon-shark', 'nurse-shark', 'sawfish', 'southern-stingray', 'giant-guitarfish', 'green-turtle', 'dugong',
    'west-indian-manatee', 'tarpon', 'common-seahorse', 'bigfin-reef-squid'],
  'volcanic-pinnacle': ['scalloped-hammerhead', 'galapagos-shark', 'thresher-shark', 'spotted-eagle-ray', 'marbled-ray', 'giant-trevally', 'chevron-barracuda',
    'dogtooth-tuna', 'king-angelfish', 'chambered-nautilus', 'marine-iguana'],
  'black-sand-bay': ['marbled-electric-ray', 'stonefish', 'leaf-scorpionfish', 'giant-frogfish', 'ribbon-eel', 'garden-eel', 'mandarinfish', 'porcupinefish',
    'crocodilefish', 'flying-gurnard', 'yellowhead-jawfish', 'pygmy-seahorse', 'ornate-ghost-pipefish', 'anna-chromodoris', 'pikachu-nudibranch', 'spanish-dancer',
    'harlequin-shrimp', 'peacock-mantis-shrimp', 'blue-ringed-octopus', 'mimic-octopus', 'coconut-octopus', 'flamboyant-cuttlefish', 'bobtail-squid'],
  shipwreck: ['sand-tiger-shark', 'loggerhead-turtle', 'giant-grouper', 'goliath-grouper', 'great-barracuda', 'lionfish', 'green-moray', 'circular-batfish',
    'caribbean-spiny-lobster'],
};
const AREA_OF = new Map(Object.entries(RESIDENTS).flatMap(([area, ids]) => ids.map((id) => [id, area as AreaId])));

/** The area a species lives in (null for one the archipelago doesn't know, such as a species added since). */
export const areaOf = (speciesId: string): AreaId | null => AREA_OF.get(speciesId) ?? null;
/** Every species that lives in an area. */
export const residentsOf = (area: AreaId): readonly string[] => RESIDENTS[area];

/** An area the diver has found: its first species (the one that raised it) and how many live there now. */
export type FoundArea = { area: Area; first: DexEntry; count: number };

/** The areas a collection has found, in the order they were found (by each area's first sighting; ties in catalog order). */
export function foundAreas(residents: readonly DexEntry[]): FoundArea[] {
  const found = new Map<AreaId, FoundArea>();
  for (const entry of residents) {
    const id = areaOf(entry.species.id);
    if (!id) continue;
    const known = found.get(id);
    if (!known) found.set(id, { area: AREAS.find((a) => a.id === id)!, first: entry, count: 1 });
    else {
      known.count++;
      if (entry.firstSeenOn < known.first.firstSeenOn) known.first = entry;
    }
  }
  const order = (a: FoundArea) => AREAS.findIndex((area) => area.id === a.area.id);
  return [...found.values()].sort((a, b) => a.first.firstSeenOn.localeCompare(b.first.firstSeenOn) || order(a) - order(b));
}
