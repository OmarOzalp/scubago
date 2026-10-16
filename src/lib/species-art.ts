/**
 * Field-guide drawings for every species, as plain SVG data so they look the same on iOS, Android
 * and the web. Each animal group has one detailed drawing (species-illustrations.ts); a species
 * picks its group and paints it in its own colours and markings. `composeArt` turns that into a
 * flat list of shapes, which the SpeciesArt component (and the preview script) draws as they are.
 */
import { darken, lighten, mix } from '@/lib/art-color';
import { ILLUSTRATIONS, type Illustration, type IllustrationName } from '@/lib/species-illustrations';
import type { Category, Species } from '@/lib/types';
import { hashSeed, seededRandom } from '@/lib/wash';

export { ART_BOX } from '@/lib/species-illustrations';
export type { IllustrationName } from '@/lib/species-illustrations';

/** Markings laid over a species' body (inside its outline). */
export type PatternName =
  | 'spots'
  | 'darkSpots'
  | 'dots'
  | 'bands'
  | 'darkBands'
  | 'stripes'
  | 'bars'
  | 'mottle'
  | 'rings'
  | 'reticulate';

export interface Palette {
  /** The colour of its back (or its whole body). */
  back: string;
  /** Its underside. */
  belly: string;
  /** A second colour some groups use (an orca's patches, a manta's shoulders, a clownfish's fins). */
  accent?: string;
  /** Fin tips (blacktip, whitetip, silvertip). */
  tip?: string;
  pattern?: PatternName;
  /** The pattern's colour (each pattern has a sensible default). */
  patternColor?: string;
  /** Bigger or smaller markings than the group's usual (1). */
  patternScale?: number;
}

// ——— Which drawing and which colours ———

const BY_ID: Record<string, IllustrationName> = {
  'whale-shark': 'whaleShark',
  'basking-shark': 'shark',
  'great-hammerhead': 'hammerhead',
  'scalloped-hammerhead': 'hammerhead',
  'thresher-shark': 'thresher',
  'zebra-shark': 'carpetShark',
  'tasselled-wobbegong': 'wobbegong',
  'nurse-shark': 'carpetShark',
  'reef-manta': 'manta',
  'oceanic-manta': 'manta',
  'munks-devil-ray': 'manta',
  'spotted-eagle-ray': 'eagleRay',
  sawfish: 'sawfish',
  'giant-guitarfish': 'guitarfish',
  'marbled-electric-ray': 'stingray',
  'bottlenose-dolphin': 'dolphin',
  'spinner-dolphin': 'dolphin',
  orca: 'orca',
  'humpback-whale': 'humpback',
  'sperm-whale': 'spermWhale',
  dugong: 'sirenian',
  'west-indian-manatee': 'sirenian',
  'california-sea-lion': 'seal',
  'harbor-seal': 'seal',
  'sea-otter': 'otter',
  'mola-mola': 'mola',
  sailfish: 'sailfish',
  'yellowfin-tuna': 'tuna',
  'dogtooth-tuna': 'tuna',
  'giant-trevally': 'jack',
  'great-barracuda': 'barracuda',
  'chevron-barracuda': 'barracuda',
  tarpon: 'barracuda',
  'napoleon-wrasse': 'wrasse',
  'bumphead-parrotfish': 'wrasse',
  'stoplight-parrotfish': 'reefFish',
  'giant-grouper': 'grouper',
  'goliath-grouper': 'grouper',
  'potato-cod': 'grouper',
  'giant-sea-bass': 'grouper',
  lingcod: 'grouper',
  clownfish: 'reefFish',
  garibaldi: 'reefFish',
  'sea-goldie': 'reefFish',
  'oriental-sweetlips': 'reefFish',
  'yellowhead-jawfish': 'reefFish',
  mandarinfish: 'reefFish',
  'moorish-idol': 'idol',
  'emperor-angelfish': 'angelfish',
  'french-angelfish': 'angelfish',
  'queen-angelfish': 'angelfish',
  'king-angelfish': 'angelfish',
  'raccoon-butterflyfish': 'angelfish',
  'circular-batfish': 'angelfish',
  'blue-tang': 'tang',
  'titan-triggerfish': 'triggerfish',
  'clown-triggerfish': 'triggerfish',
  'queen-triggerfish': 'triggerfish',
  lionfish: 'lionfish',
  stonefish: 'lurker',
  'leaf-scorpionfish': 'lurker',
  'giant-frogfish': 'lurker',
  crocodilefish: 'lurker',
  'flying-gurnard': 'gurnard',
  'common-seahorse': 'seahorse',
  'pygmy-seahorse': 'seahorse',
  'leafy-seadragon': 'seadragon',
  'weedy-seadragon': 'seadragon',
  'ribbon-eel': 'eel',
  'giant-moray': 'eel',
  'green-moray': 'eel',
  'garden-eel': 'eel',
  'wolf-eel': 'eel',
  'star-puffer': 'puffer',
  porcupinefish: 'puffer',
  'yellow-boxfish': 'boxfish',
  trumpetfish: 'pipefish',
  'ornate-ghost-pipefish': 'pipefish',
  'anna-chromodoris': 'nudibranch',
  'pikachu-nudibranch': 'nudibranch',
  'spanish-dancer': 'nudibranch',
  'harlequin-shrimp': 'shrimp',
  'peacock-mantis-shrimp': 'shrimp',
  'caribbean-spiny-lobster': 'shrimp',
  'christmas-tree-worm': 'worm',
  'giant-clam': 'clam',
  'broadclub-cuttlefish': 'cuttlefish',
  'giant-cuttlefish': 'cuttlefish',
  'flamboyant-cuttlefish': 'cuttlefish',
  'bigfin-reef-squid': 'squid',
  'bobtail-squid': 'squid',
  'chambered-nautilus': 'nautilus',
  'banded-sea-krait': 'seaSnake',
  'marine-iguana': 'iguana',
  'golden-jellyfish': 'jellyfish',
};

const BY_CATEGORY: Record<Category, IllustrationName> = {
  shark: 'shark',
  ray: 'stingray',
  turtle: 'turtle',
  mammal: 'dolphin',
  fish: 'reefFish',
  cephalopod: 'octopus',
  macro: 'nudibranch',
  reptile: 'seaSnake',
  other: 'reefFish',
};

/** Colours and markings for the species people know by them. */
const PALETTES: Record<string, Palette> = {
  // Sharks
  'whale-shark': { back: '#4E6F8F', belly: '#E9EEF0', pattern: 'spots', patternColor: '#F2F5F2' },
  'great-white-shark': { back: '#7E8E9C', belly: '#F2F2EE' },
  'basking-shark': { back: '#6F7A80', belly: '#C9CFCF' },
  'tiger-shark': { back: '#8C8A70', belly: '#EEEBDF', pattern: 'bars' },
  'great-hammerhead': { back: '#8A9AA6', belly: '#EFF0EC' },
  'scalloped-hammerhead': { back: '#7F93A2', belly: '#EEF0EC' },
  'thresher-shark': { back: '#6E7FA0', belly: '#EEF0F2' },
  'oceanic-whitetip': { back: '#8A8C82', belly: '#F0EFE9', tip: '#F7F6F0' },
  'shortfin-mako': { back: '#3F5E92', belly: '#F2F3F2' },
  'bull-shark': { back: '#8C8F86', belly: '#EFEEE8' },
  'silky-shark': { back: '#7B8794', belly: '#EEF0EE' },
  'galapagos-shark': { back: '#7A858C', belly: '#EEEFEC' },
  'sand-tiger-shark': { back: '#A49A86', belly: '#EDE8DD', pattern: 'darkSpots', patternColor: '#8A7A5E' },
  'zebra-shark': { back: '#C9B48A', belly: '#EFE6D2', pattern: 'darkSpots', patternColor: '#5A4A34' },
  'tasselled-wobbegong': { back: '#A38A62', belly: '#D8C8A6', pattern: 'reticulate', patternColor: '#5E4A30' },
  'lemon-shark': { back: '#B9A970', belly: '#F0EBD6' },
  'grey-reef-shark': { back: '#7F8F9C', belly: '#F0F1EE', tip: '#2E3A46' },
  'blacktip-reef-shark': { back: '#9AA2A4', belly: '#F2F2EE', tip: '#1F2A36' },
  'whitetip-reef-shark': { back: '#8C9296', belly: '#EEEEEA', tip: '#FAFAF6' },
  'nurse-shark': { back: '#A58E6C', belly: '#D9CDB4' },
  // Rays
  'reef-manta': { back: '#2D3546', belly: '#F1F2EE', accent: '#E9ECEA' },
  'oceanic-manta': { back: '#1F2633', belly: '#F1F2EE', accent: '#EEF0EC' },
  'munks-devil-ray': { back: '#6F7F96', belly: '#EEEEEA', accent: '#B9C4D2' },
  'spotted-eagle-ray': { back: '#2F3B52', belly: '#F1F2EE', pattern: 'spots', patternColor: '#F4F4EE', patternScale: 0.55 },
  'marbled-ray': { back: '#8A8070', belly: '#E9E4DA', pattern: 'mottle', patternColor: '#5A5244' },
  'southern-stingray': { back: '#8E8270', belly: '#EEEAE0' },
  'bluespotted-ribbontail-ray': { back: '#C2A97E', belly: '#EFE7D6', pattern: 'dots', patternColor: '#2F7FD6' },
  sawfish: { back: '#9C8E72', belly: '#EEE9DC' },
  'giant-guitarfish': { back: '#A89878', belly: '#EEE8DA', pattern: 'spots', patternColor: '#F4F0E4', patternScale: 0.7 },
  'marbled-electric-ray': { back: '#9A7E64', belly: '#EDE5D8', pattern: 'mottle', patternColor: '#5E4632' },
  // Turtles
  'green-turtle': { back: '#6F7F4E', belly: '#E9DEB8', accent: '#C9B98A', pattern: 'reticulate', patternColor: '#4A5434' },
  'hawksbill-turtle': { back: '#8A5A32', belly: '#EFD9A8', accent: '#E3B46A', pattern: 'mottle', patternColor: '#D9A050' },
  'loggerhead-turtle': { back: '#9A6234', belly: '#EFD6A6', accent: '#D9A060' },
  'olive-ridley-turtle': { back: '#7E8452', belly: '#E6DDB4', accent: '#B9B07A' },
  'leatherback-turtle': { back: '#3C4552', belly: '#D9DCDC', accent: '#8C96A0', pattern: 'dots', patternColor: '#C9CED2' },
  // Mammals
  'bottlenose-dolphin': { back: '#7C8894', belly: '#EEF0F0' },
  'spinner-dolphin': { back: '#5E6B7C', belly: '#F0EEEA', accent: '#9AA4B0' },
  orca: { back: '#1F2430', belly: '#F4F4F0', accent: '#F4F4F0' },
  'humpback-whale': { back: '#3F4A5A', belly: '#E9ECEC', accent: '#E9ECEC' },
  'sperm-whale': { back: '#5E646C', belly: '#8E949A' },
  dugong: { back: '#A8988A', belly: '#D9CFC4' },
  'west-indian-manatee': { back: '#8E8A84', belly: '#BDB8B0' },
  'california-sea-lion': { back: '#8A6440', belly: '#B98E62' },
  'harbor-seal': { back: '#8E8A80', belly: '#D2CEC4', pattern: 'darkSpots', patternColor: '#5A564E' },
  'sea-otter': { back: '#6E5038', belly: '#B9A088', accent: '#D9CBB8' },
  // Big and open-water fish
  'mola-mola': { back: '#8C9CAA', belly: '#E2E6E6' },
  sailfish: { back: '#2E4F8C', belly: '#E9EEF0', accent: '#3E6AC4', pattern: 'bars', patternColor: '#9CC4F0' },
  'yellowfin-tuna': { back: '#2C4A7A', belly: '#E6ECEE', accent: '#F2C230' },
  'dogtooth-tuna': { back: '#4E6478', belly: '#E3E8EA', accent: '#B9C4CC' },
  'giant-trevally': { back: '#6E7A80', belly: '#E3E6E2', accent: '#4A5258' },
  'great-barracuda': { back: '#6C7C88', belly: '#EEF0EE', pattern: 'bars', patternColor: '#3E4A56' },
  'chevron-barracuda': { back: '#7A8A96', belly: '#EEF0EE', pattern: 'bars', patternColor: '#56626E' },
  tarpon: { back: '#6E8296', belly: '#F0F2F0' },
  'napoleon-wrasse': { back: '#3E9C8A', belly: '#7EC4B0', accent: '#2E6E8C', pattern: 'reticulate', patternColor: '#2E7466' },
  'bumphead-parrotfish': { back: '#5E7E78', belly: '#A9C2B4', accent: '#C9D9C4' },
  'giant-grouper': { back: '#7A6A52', belly: '#C9BA9A', pattern: 'mottle', patternColor: '#4E4232' },
  'goliath-grouper': { back: '#8A7E62', belly: '#C9BFA2', pattern: 'mottle', patternColor: '#5A5240' },
  'potato-cod': { back: '#C9C2A8', belly: '#EEEADA', pattern: 'darkSpots', patternColor: '#4A4434' },
  'giant-sea-bass': { back: '#4E4E4A', belly: '#8A8A80', pattern: 'darkSpots', patternColor: '#2A2A28' },
  lingcod: { back: '#7A7058', belly: '#C9C0A4', pattern: 'mottle', patternColor: '#4A4234' },
  // Reef fish
  clownfish: { back: '#F07A2A', belly: '#F79A50', accent: '#F07A2A', pattern: 'bands', patternColor: '#FFFFFF' },
  garibaldi: { back: '#F0782A', belly: '#F79446', accent: '#F0782A' },
  'sea-goldie': { back: '#F2884E', belly: '#F7A876', accent: '#E8608A' },
  'oriental-sweetlips': { back: '#F0F0E6', belly: '#F6F4EA', accent: '#F2C230', pattern: 'stripes', patternColor: '#2A2E36' },
  'yellowhead-jawfish': { back: '#9FB6C4', belly: '#E6ECEE', accent: '#F2D04A' },
  mandarinfish: { back: '#2F6FC4', belly: '#3E86D6', accent: '#F28C3A', pattern: 'reticulate', patternColor: '#F28C3A' },
  'stoplight-parrotfish': { back: '#3EAA86', belly: '#6CC4A4', accent: '#F2C230' },
  'moorish-idol': { back: '#F4E9C2', belly: '#F7F0D6', accent: '#F2C230', pattern: 'darkBands', patternColor: '#1F2430' },
  'emperor-angelfish': { back: '#2E58B4', belly: '#3E6AC4', accent: '#F2C230', pattern: 'stripes', patternColor: '#F2D04A' },
  'french-angelfish': { back: '#3A3E46', belly: '#4A4E56', accent: '#F2C230', pattern: 'darkSpots', patternColor: '#E9C24A' },
  'queen-angelfish': { back: '#3E8AC4', belly: '#F2D04A', accent: '#F2C230' },
  'king-angelfish': { back: '#3E5A9C', belly: '#F2A23A', accent: '#F2C230', pattern: 'dots', patternColor: '#9CC4F0' },
  'raccoon-butterflyfish': { back: '#F2C230', belly: '#F6D45A', accent: '#F2C230', pattern: 'darkBands', patternColor: '#2A2E36' },
  'circular-batfish': { back: '#9AA0A0', belly: '#C9CCC8', accent: '#3A3E44', pattern: 'darkBands', patternColor: '#3A3E44' },
  'blue-tang': { back: '#2E5FD0', belly: '#3E74E0', accent: '#F2C230' },
  'titan-triggerfish': { back: '#6E7A64', belly: '#B9AE84', accent: '#E3B04B', pattern: 'reticulate', patternColor: '#3E4434' },
  'clown-triggerfish': { back: '#22283A', belly: '#22283A', accent: '#F2C230', pattern: 'spots', patternColor: '#F4F2EA' },
  'queen-triggerfish': { back: '#5E86A6', belly: '#D9C27A', accent: '#3EAAD6' },
  lionfish: { back: '#C25A3E', belly: '#F2E6D8', accent: '#C25A3E', pattern: 'darkBands', patternColor: '#7A2E22' },
  stonefish: { back: '#8A7A62', belly: '#A89878', pattern: 'mottle', patternColor: '#5A4E3E' },
  'leaf-scorpionfish': { back: '#E3B04B', belly: '#EEC46A', pattern: 'mottle', patternColor: '#C98A2E' },
  'giant-frogfish': { back: '#E3963A', belly: '#EEB062', pattern: 'mottle', patternColor: '#B96E22' },
  crocodilefish: { back: '#9A947E', belly: '#C9C2AA', pattern: 'mottle', patternColor: '#5E584A' },
  'flying-gurnard': { back: '#9A8A6E', belly: '#D9CDB4', accent: '#3E86C4', pattern: 'darkSpots', patternColor: '#5E4E3A' },
  'common-seahorse': { back: '#E3A84A', belly: '#EEC070' },
  'pygmy-seahorse': { back: '#E88AA0', belly: '#F2B4C2', pattern: 'spots', patternColor: '#D2486A' },
  'leafy-seadragon': { back: '#C9B25A', belly: '#E3D48A', accent: '#A8A040' },
  'weedy-seadragon': { back: '#D9784A', belly: '#F2C27A', accent: '#7A5AA8', pattern: 'dots', patternColor: '#F2E04A' },
  'ribbon-eel': { back: '#2E5FD0', belly: '#3E74E0', accent: '#F2D04A' },
  'giant-moray': { back: '#A8925E', belly: '#C9B482', pattern: 'mottle', patternColor: '#4E4230' },
  'green-moray': { back: '#6E9A4E', belly: '#8EB46A' },
  'garden-eel': { back: '#E3DCC0', belly: '#F0EADA', pattern: 'darkSpots', patternColor: '#3A3A36' },
  'wolf-eel': { back: '#8A8A84', belly: '#B9B8B0', pattern: 'darkSpots', patternColor: '#3E3E3A' },
  'star-puffer': { back: '#9A9888', belly: '#E9E6DA', pattern: 'darkSpots', patternColor: '#2E2E2A' },
  porcupinefish: { back: '#B9A882', belly: '#EEE6D2', pattern: 'darkSpots', patternColor: '#5E5038' },
  'yellow-boxfish': { back: '#F2D02E', belly: '#F6DE5A', pattern: 'darkSpots', patternColor: '#22283A' },
  trumpetfish: { back: '#B9945A', belly: '#D9BE86' },
  'ornate-ghost-pipefish': { back: '#E3A06B', belly: '#F2D0A8', accent: '#C2483E', pattern: 'dots', patternColor: '#FFFFFF' },
  // Macro
  'anna-chromodoris': { back: '#8E7AE6', belly: '#B4A6F0', accent: '#F28C3A', pattern: 'stripes', patternColor: '#FFFFFF' },
  'pikachu-nudibranch': { back: '#F6D62E', belly: '#F8E46A', accent: '#2E64C4' },
  'spanish-dancer': { back: '#D63E3E', belly: '#F2786A', accent: '#F7E4D6' },
  'harlequin-shrimp': { back: '#F7EEE6', belly: '#FFFFFF', accent: '#E85A8A', pattern: 'darkSpots', patternColor: '#D23E7A' },
  'peacock-mantis-shrimp': { back: '#3EAA6E', belly: '#7EC48E', accent: '#E8463E' },
  'caribbean-spiny-lobster': { back: '#B9643A', belly: '#E3A46A', accent: '#F2E0B4', pattern: 'spots', patternColor: '#F6E6C2' },
  'christmas-tree-worm': { back: '#E8563E', belly: '#F28A6A', accent: '#F2C230' },
  'giant-clam': { back: '#C9C2B0', belly: '#E3DECE', accent: '#3E8AC4', pattern: 'dots', patternColor: '#7EE0D4' },
  // Cephalopods
  'day-octopus': { back: '#C2643E', belly: '#E3967A', pattern: 'mottle', patternColor: '#8A3E2A' },
  'giant-pacific-octopus': { back: '#B9483E', belly: '#E37A6A', pattern: 'spots', patternColor: '#F2B4A8' },
  'blue-ringed-octopus': { back: '#E3BE6A', belly: '#EED08A', pattern: 'rings', patternColor: '#1E6FD9' },
  'mimic-octopus': { back: '#C9A882', belly: '#EEDCC2', pattern: 'darkBands', patternColor: '#5E4632' },
  'coconut-octopus': { back: '#9A6E4E', belly: '#C9A282', pattern: 'mottle', patternColor: '#5E3E2A' },
  'broadclub-cuttlefish': { back: '#A8957A', belly: '#E3D8C4', pattern: 'mottle', patternColor: '#6E5A44' },
  'giant-cuttlefish': { back: '#8C6A9A', belly: '#D9C4E0', pattern: 'mottle', patternColor: '#5A3E6E' },
  'flamboyant-cuttlefish': { back: '#5E3A4E', belly: '#E8708A', accent: '#F2D04A', pattern: 'mottle', patternColor: '#F2D04A' },
  'bigfin-reef-squid': { back: '#C9A8B4', belly: '#EEDDE2', pattern: 'dots', patternColor: '#9A5A6E' },
  'bobtail-squid': { back: '#C98A6A', belly: '#EEC4AA', pattern: 'dots', patternColor: '#8A4A34' },
  'chambered-nautilus': { back: '#F2E6D2', belly: '#F7F0E2', accent: '#B9643A', pattern: 'darkBands', patternColor: '#B9643A' },
  // Reptiles and the rest
  'banded-sea-krait': { back: '#9CC4E0', belly: '#D2E6F0', pattern: 'darkBands', patternColor: '#1F2430' },
  'marine-iguana': { back: '#4E5450', belly: '#7A8078', accent: '#B9463E', pattern: 'mottle', patternColor: '#2E3230' },
  'golden-jellyfish': { back: '#F2B83A', belly: '#F7D474', accent: '#E8963A' },
};

/** The rest of each group takes one of its family's colours. */
const FAMILY: Record<Category, Palette[]> = {
  shark: [
    { back: '#7F8F9C', belly: '#F0F1EE' },
    { back: '#8A9298', belly: '#EFEFEA' },
  ],
  ray: [{ back: '#8E8270', belly: '#EEEAE0' }],
  turtle: [{ back: '#6F7F4E', belly: '#E9DEB8', accent: '#C9B98A' }],
  mammal: [{ back: '#7C8894', belly: '#EEF0F0' }],
  fish: [
    { back: '#3EA894', belly: '#8ED2C2', accent: '#F2C230' },
    { back: '#F28C3A', belly: '#F7B276', accent: '#F2C230' },
    { back: '#4E7FD0', belly: '#8EB4EA', accent: '#F2C230' },
  ],
  cephalopod: [{ back: '#C2643E', belly: '#E3967A' }],
  macro: [{ back: '#8E7AE6', belly: '#B4A6F0', accent: '#F28C3A' }],
  reptile: [{ back: '#9CC4E0', belly: '#D2E6F0', pattern: 'darkBands', patternColor: '#1F2430' }],
  other: [{ back: '#9A8AE6', belly: '#C4B8F0', accent: '#F2C230' }],
};

export interface SpeciesArt {
  name: IllustrationName;
  drawing: Illustration;
  palette: Palette;
  /** A pale tint of its colour, for the paper plate behind it. */
  wash: string;
  seed: number;
}

export function illustrationNameFor(species: Pick<Species, 'id' | 'category'>): IllustrationName {
  return BY_ID[species.id] ?? BY_CATEGORY[species.category] ?? 'reefFish';
}

/** How to draw a species: its group's drawing and its own colours. */
export function artFor(species: Pick<Species, 'id' | 'category'>): SpeciesArt {
  const seed = hashSeed(species.id);
  const name = illustrationNameFor(species);
  const family = FAMILY[species.category] ?? FAMILY.other;
  const palette = PALETTES[species.id] ?? family[seed % family.length];
  return { name, drawing: ILLUSTRATIONS[name], palette, wash: mix(palette.back, palette.belly, 0.35), seed };
}

// ——— Turning a drawing into shapes ———

/** One shape to draw. `fill: '@body'` is the body's shading; `clip` keeps it inside the body. */
export interface ArtShape {
  kind: 'path' | 'circle';
  d?: string;
  cx?: number;
  cy?: number;
  r?: number;
  fill?: string;
  fillOpacity?: number;
  stroke?: string;
  strokeWidth?: number;
  strokeOpacity?: number;
  dash?: string;
  clip?: boolean;
}

export interface ArtShading {
  type: 'linear' | 'radial';
  /** linear: top to bottom; radial: centre and radius. */
  y1?: number;
  y2?: number;
  cx?: number;
  cy?: number;
  r?: number;
  stops: { offset: number; color: string }[];
}

export interface ComposedArt {
  shading: ArtShading;
  /** The body outline, for clipping patterns and shading. */
  clip: string;
  shapes: ArtShape[];
}

/** Pencil for species still to find. */
export const PENCIL = { light: '#9C9381', dark: '#6F829A' };

/**
 * Everything to draw for a species at a given on-screen width. Found: painted, with fine detail on
 * bigger drawings. Not found: a dashed pencil outline.
 */
export function composeArt(art: SpeciesArt, { width, found = true, scheme = 'light', paper = '#FFFDF8' }: { width: number; found?: boolean; scheme?: 'light' | 'dark'; paper?: string }): ComposedArt {
  const { drawing: dr, palette: p, seed } = art;
  const scale = width / 200;
  // About a point of outline on a small plate, a little more on a big one.
  const edge = Math.min(1.6, Math.max(0.9, width / 120)) / scale;
  const fine = edge * 0.62;
  const detailed = width >= 64;
  const shapes: ArtShape[] = [];

  if (!found) {
    const pencil = PENCIL[scheme];
    const dash = `${(3 / scale / 1.3).toFixed(2)} ${(2.4 / scale / 1.3).toFixed(2)}`;
    const outline = (d: string) => shapes.push({ kind: 'path', d, fill: paper, stroke: pencil, strokeWidth: edge, dash });
    dr.back?.forEach(outline);
    outline(dr.body);
    dr.fins?.forEach(outline);
    dr.accentFins?.forEach(outline);
    if (detailed) for (const d of dr.lines ?? []) shapes.push({ kind: 'path', d, stroke: pencil, strokeWidth: fine, strokeOpacity: 0.7, dash });
    for (const e of dr.eyes ?? []) shapes.push({ kind: 'circle', cx: e.x, cy: e.y, r: Math.max(e.r * 0.55, 1.4 / scale), fill: pencil });
    return { shading: { type: 'linear', y1: 0, y2: 128, stops: [{ offset: 0, color: paper }, { offset: 1, color: paper }] }, clip: dr.body, shapes };
  }

  const ink = mix(darken(p.back, 0.55), '#1D2B45', 0.35);
  const fin = darken(p.back, 0.14);
  const shading: ArtShading =
    dr.light === 'top'
      ? {
          type: 'radial',
          cx: dr.box[0] + dr.box[2] / 2,
          cy: dr.box[1] + dr.box[3] * 0.42,
          r: Math.max(dr.box[2], dr.box[3]) * 0.62,
          stops: [
            { offset: 0, color: lighten(p.back, 0.16) },
            { offset: 0.65, color: p.back },
            { offset: 1, color: darken(p.back, 0.16) },
          ],
        }
      : {
          type: 'linear',
          y1: dr.span[0],
          y2: dr.span[1],
          stops: [
            { offset: 0, color: darken(p.back, 0.1) },
            { offset: dr.split ?? 0.55, color: lighten(p.back, 0.06) },
            { offset: 1, color: mix(p.back, p.belly, 0.7) },
          ],
        };
  const paint = (name: MarkPaint) =>
    name === 'accent' ? (p.accent ?? lighten(p.back, 0.5)) : name === 'belly' ? p.belly : name === 'fin' ? fin : name === 'dark' ? darken(p.back, 0.45) : name === 'light' ? '#FFFFFF' : ink;

  const backFill = dr.backPaint === 'accent' ? darken(paint('accent'), 0.08) : darken(p.back, 0.24);
  for (const d of dr.back ?? []) shapes.push({ kind: 'path', d, fill: backFill, stroke: ink, strokeWidth: edge * 0.85 });
  shapes.push({ kind: 'path', d: dr.body, fill: '@body' });
  if (dr.belly) shapes.push({ kind: 'path', d: dr.belly, fill: p.belly, clip: true });
  shapes.push(...patternShapes(p, dr, seed, scale));
  for (const m of dr.marks ?? []) {
    if (m.ifAccent && !p.accent) continue;
    shapes.push({ kind: 'path', d: m.d, fill: paint(m.paint), fillOpacity: m.opacity ?? 1, clip: m.clip ?? true });
  }
  for (const d of dr.shade ?? []) shapes.push({ kind: 'path', d, fill: darken(p.back, 0.4), fillOpacity: 0.22, clip: true });
  for (const d of dr.shine ?? []) shapes.push({ kind: 'path', d, fill: '#FFFFFF', fillOpacity: 0.3, clip: true });
  if (detailed && dr.scales) shapes.push(...scaleShapes(dr, ink, fine));
  shapes.push({ kind: 'path', d: dr.body, stroke: ink, strokeWidth: edge });
  for (const d of dr.fins ?? []) shapes.push({ kind: 'path', d, fill: dr.finPaint === 'accent' ? paint('accent') : dr.finPaint === 'body' ? '@body' : fin, fillOpacity: dr.finOpacity ?? 1, stroke: ink, strokeWidth: edge * 0.85 });
  for (const d of dr.accentFins ?? []) shapes.push({ kind: 'path', d, fill: paint('accent'), stroke: ink, strokeWidth: edge * 0.85 });
  if (p.tip) for (const d of dr.tips ?? []) shapes.push({ kind: 'path', d, fill: p.tip });
  if (detailed) for (const d of dr.finLines ?? []) shapes.push({ kind: 'path', d, stroke: ink, strokeWidth: fine * 0.8, strokeOpacity: 0.35 });
  if (detailed) for (const d of dr.lines ?? []) shapes.push({ kind: 'path', d, stroke: ink, strokeWidth: fine, strokeOpacity: 0.6 });
  for (const e of dr.eyes ?? []) {
    if (e.iris) shapes.push({ kind: 'circle', cx: e.x, cy: e.y, r: e.r, fill: e.iris === true ? lighten(p.accent ?? '#E3B04B', 0.2) : e.iris, stroke: ink, strokeWidth: fine });
    shapes.push({ kind: 'circle', cx: e.x, cy: e.y, r: e.iris ? e.r * 0.58 : e.r, fill: '#141C28' });
    shapes.push({ kind: 'circle', cx: e.x - e.r * 0.3, cy: e.y - e.r * 0.32, r: Math.max(e.r * 0.26, 0.7 / scale), fill: '#FFFFFF' });
  }
  return { shading, clip: dr.body, shapes };
}

type MarkPaint = 'accent' | 'belly' | 'fin' | 'dark' | 'light' | 'ink';

/** A soft irregular blob (for mottling), as a closed Catmull-Rom curve. */
function blob(rand: () => number, cx: number, cy: number, rx: number, ry: number): string {
  const n = 7;
  const start = rand() * Math.PI * 2;
  const pts = Array.from({ length: n }, (_, i) => {
    const a = start + (i / n) * Math.PI * 2;
    const k = 0.72 + rand() * 0.28;
    return [cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k];
  });
  const at = (i: number) => pts[(i + n) % n];
  const r = (v: number) => Math.round(v * 10) / 10;
  let d = `M${r(pts[0][0])},${r(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    d += ` C${r(p1[0] + (p2[0] - p0[0]) / 6)},${r(p1[1] + (p2[1] - p0[1]) / 6)} ${r(p2[0] - (p3[0] - p1[0]) / 6)},${r(p2[1] - (p3[1] - p1[1]) / 6)} ${r(p2[0])},${r(p2[1])}`;
  }
  return `${d} Z`;
}

const circle = (cx: number, cy: number, r: number): string =>
  `M${cx - r},${cy} C${cx - r},${cy - r * 0.55} ${cx - r * 0.55},${cy - r} ${cx},${cy - r} C${cx + r * 0.55},${cy - r} ${cx + r},${cy - r * 0.55} ${cx + r},${cy} C${cx + r},${cy + r * 0.55} ${cx + r * 0.55},${cy + r} ${cx},${cy + r} C${cx - r * 0.55},${cy + r} ${cx - r},${cy + r * 0.55} ${cx - r},${cy} Z`;

/** A species' markings, kept inside its body outline. */
function patternShapes(p: Palette, dr: Illustration, seed: number, scale: number): ArtShape[] {
  if (!p.pattern) return [];
  const [x, y, w, h] = dr.box;
  // Markings are sized by the body's narrower side, so a long or a tall body gets the same spots.
  const size = Math.min(w, h * 1.4) * (p.patternScale ?? 1);
  const rand = seededRandom(seed);
  const out: ArtShape[] = [];
  const add = (d: string, fill: string, fillOpacity = 1) => out.push({ kind: 'path', d, fill, fillOpacity, clip: true });
  switch (p.pattern) {
    case 'spots':
    case 'darkSpots':
    case 'dots': {
      const color = p.patternColor ?? (p.pattern === 'darkSpots' ? darken(p.back, 0.45) : lighten(p.back, 0.75));
      const step = p.pattern === 'dots' ? size / 5 : size / 4;
      const radius = p.pattern === 'dots' ? step * 0.16 : step * 0.2;
      for (let row = 0, yy = y + step * 0.5; yy < y + h; row++, yy += step * 0.86) {
        for (let xx = x + (row % 2 ? step * 0.5 : step * 0.05); xx < x + w; xx += step) {
          const jx = (rand() - 0.5) * step * 0.35;
          const jy = (rand() - 0.5) * step * 0.3;
          add(circle(xx + jx, yy + jy, Math.max(radius * (0.75 + rand() * 0.5), 0.9 / scale)), color, 0.92);
        }
      }
      break;
    }
    case 'bands':
    case 'darkBands': {
      const color = p.patternColor ?? (p.pattern === 'bands' ? '#FFFFFF' : darken(p.back, 0.5));
      const at = dr.bands ?? [0.22, 0.5, 0.8];
      const bw = dr.bandWidth ?? w * 0.075;
      for (const f of at) {
        const cx = x + w * f;
        // A gently curved band, a little wider in the middle.
        const d = `M${cx - bw * 0.4},${y - 4} C${cx - bw * 0.7},${y + h * 0.35} ${cx - bw * 0.7},${y + h * 0.65} ${cx - bw * 0.4},${y + h + 4} L${cx + bw * 0.6},${y + h + 4} C${cx + bw * 0.3},${y + h * 0.65} ${cx + bw * 0.3},${y + h * 0.35} ${cx + bw * 0.6},${y - 4} Z`;
        if (p.pattern === 'bands') out.push({ kind: 'path', d, fill: color, stroke: '#1F2430', strokeWidth: 1.1, strokeOpacity: 0.85, clip: true });
        else add(d, color, 0.95);
      }
      break;
    }
    case 'stripes': {
      const color = p.patternColor ?? lighten(p.back, 0.6);
      const n = 5;
      for (let i = 0; i < n; i++) {
        const yy = y + (h * (i + 0.6)) / (n + 0.2);
        const t = h / (n * 4.2);
        add(`M${x - 4},${yy} C${x + w * 0.3},${yy - t * 2} ${x + w * 0.7},${yy - t * 2} ${x + w + 4},${yy + t} L${x + w + 4},${yy + t * 2.6} C${x + w * 0.7},${yy} ${x + w * 0.3},${yy} ${x - 4},${yy + t * 1.6} Z`, color, 0.9);
      }
      break;
    }
    case 'bars': {
      const color = p.patternColor ?? darken(p.back, 0.3);
      // Short, broken, slightly wavy bars on the upper flank, fading towards the tail.
      const n = 11;
      for (let i = 0; i < n; i++) {
        const xx = x + w * 0.12 + (w * 0.8 * i) / n + (rand() - 0.5) * 3;
        const len = h * (0.28 + rand() * 0.22);
        const top = y + h * (0.08 + rand() * 0.08);
        const t = 1.1 + rand() * 0.6;
        add(`M${xx - t},${top} C${xx - t * 2},${top + len * 0.35} ${xx + t * 0.4},${top + len * 0.6} ${xx - t * 0.6},${top + len} L${xx + t * 0.6},${top + len} C${xx + t * 1.6},${top + len * 0.6} ${xx - t * 0.2},${top + len * 0.35} ${xx + t},${top} Z`, color, 0.42 * (1 - (i / n) * 0.5));
      }
      break;
    }
    case 'mottle':
    case 'reticulate': {
      const color = p.patternColor ?? darken(p.back, 0.35);
      const n = Math.round(((p.pattern === 'mottle' ? 14 : 34) * w * h) / (size * size));
      for (let i = 0; i < n; i++) {
        const cx = x + rand() * w;
        const cy = y + rand() * h;
        const r = (p.pattern === 'mottle' ? size * 0.11 : size * 0.06) * (0.6 + rand() * 0.8);
        add(blob(rand, cx, cy, r * 1.3, r), color, p.pattern === 'mottle' ? 0.45 : 0.55);
      }
      break;
    }
    case 'rings': {
      const color = p.patternColor ?? '#1E6FD9';
      const step = size / 3.2;
      for (let yy = y + step * 0.5; yy < y + h; yy += step) {
        for (let xx = x + step * 0.4; xx < x + w; xx += step * 1.1) {
          const r = step * 0.26;
          out.push({ kind: 'path', d: circle(xx + (rand() - 0.5) * 4, yy + (rand() - 0.5) * 4, r), fill: darken(p.back, 0.3), fillOpacity: 0.5, stroke: color, strokeWidth: Math.max(r * 0.38, 1), clip: true });
        }
      }
      break;
    }
  }
  return out;
}

/** Rows of small scale arcs over a fish's body. */
function scaleShapes(dr: Illustration, ink: string, width: number): ArtShape[] {
  const [x, y, w, h] = dr.box;
  const s = h / 7;
  let d = '';
  for (let row = 0, yy = y + s; yy < y + h; row++, yy += s * 0.8) {
    for (let xx = x + (row % 2 ? s * 0.5 : 0); xx < x + w; xx += s) d += `M${xx},${yy} C${xx + s * 0.25},${yy + s * 0.4} ${xx + s * 0.75},${yy + s * 0.4} ${xx + s},${yy} `;
  }
  return [{ kind: 'path', d, stroke: ink, strokeWidth: width * 0.8, strokeOpacity: 0.16, clip: true }];
}
