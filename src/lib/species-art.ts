/**
 * Field-guide drawings for every species, as data. Each body shape is drawn once in a 100×64 box
 * (side view facing left, or from above for rays, turtles and the like) and shared by the species
 * that look alike; each species brings its own wash colour.
 *
 *   body   closed outlines: washed with colour, then inked
 *   limbs  centrelines drawn as thick bands (eels, arms, tails): an ink edge around a wash
 *   detail open ink lines (gills, fins, scutes)
 *   light  pale marks over the wash (a whale shark's spots, a clownfish's bands)
 *   dots   ink spots
 *   spots  pale spots
 *   eyes   ink dots
 *
 * They stand in until each species has a painted illustration.
 */
import type { Category, Species } from '@/lib/types';
import { hashSeed } from '@/lib/wash';

export interface ArtShape {
  body: string;
  limbs?: { d: string; width: number }[];
  detail?: string;
  light?: { d: string; width?: number }[];
  dots?: [x: number, y: number, r: number][];
  /** Pale spots over the wash. */
  spots?: [x: number, y: number, r: number][];
  eyes?: [x: number, y: number, r: number][];
}

export const ART_BOX = { width: 100, height: 64 } as const;

export const SHAPES = {
  shark: {
    body: 'M6 34C14 27 28 23 44 23L50 11L57 23C66 24 74 27 80 30L94 18L91 33L95 47L80 37C70 41 54 44 36 43C24 42 12 39 6 34Z M34 40L27 53L44 42Z',
    detail: 'M20 29C19 32 19 35 20 38M24 28.5C23 31.5 23 34.5 24 37.5M8 36C11 37 13 37 15 36M12 37.5C26 40.5 46 41 62 38',
    eyes: [[14, 31, 1.4]],
  },
  whaleShark: {
    body: 'M4 33C6 26 18 21 34 21C50 21 64 23 76 27L93 14L89 31L94 48L76 36C64 41 46 44 30 43C16 42 6 39 4 33Z M44 22L52 9L59 23Z M30 41L24 53L41 42Z',
    detail: 'M5 34C9 35 13 35 17 34M20 27C40 25 60 26 74 29',
    spots: [[20, 31, 1.3], [28, 27, 1.3], [36, 31, 1.3], [44, 26, 1.3], [52, 30, 1.3], [60, 27, 1.3], [68, 31, 1.3], [32, 36, 1.3], [48, 36, 1.3], [58, 34, 1.3], [40, 33, 1.3]],
    eyes: [[12, 30, 1.3]],
  },
  hammerhead: {
    body: 'M12 16C15 15 17 16 18 19L20 28C30 27 44 27 58 29C70 30 80 31 88 31L96 25L94 32L96 39L88 33C80 33 70 34 58 35C44 37 30 37 20 36L18 45C17 48 15 49 12 48C10 41 10 23 12 16Z M40 28L50 16L52 29Z M40 36L50 48L52 35Z',
    detail: 'M22 32C40 31.5 64 32 86 32',
    eyes: [[13.5, 18.5, 1.3], [13.5, 45.5, 1.3]],
  },
  thresher: {
    body: 'M8 36C15 30 26 27 38 27L43 17L49 27C55 28 60 30 64 32C72 28 84 16 98 6C90 20 80 32 68 36L72 44L62 38C52 42 38 44 26 43C16 42 10 40 8 36Z M28 41L22 52L36 42Z',
    detail: 'M19 32C18 34.5 18 37 19 39M10 38C12 39 14 39 16 38',
    eyes: [[14, 34, 1.9]],
  },
  carpet: {
    body: 'M4 36C8 30 18 28 30 29C40 29 46 30 52 32L56 26L60 32C70 34 80 35 96 34C86 38 72 40 60 40C50 42 34 43 22 42C12 41 6 39 4 36Z M24 41L18 51L32 42Z M66 35L70 29L73 35Z',
    detail: 'M6 37L2 40M8 38.5C20 41 36 41.5 52 40',
    dots: [[20, 34, 1.2], [28, 33, 1.2], [36, 35, 1.2], [44, 33, 1.2], [52, 36, 1.2], [62, 36, 1.2], [72, 36, 1.2], [80, 35.5, 1.1]],
    eyes: [[11, 33.5, 1.2]],
  },
  manta: {
    body: 'M50 12C46 12 43 16 40 20C30 22 16 27 4 34C17 36 30 39 40 44C43 48 46 51 50 52C54 51 57 48 60 44C70 39 83 36 96 34C84 27 70 22 60 20C57 16 54 12 50 12Z',
    detail: 'M45 13C44 9 43 7 41 6M55 13C56 9 57 7 59 6M50 52L50 63M50 14L50 50',
    light: [{ d: 'M33 28C36 27 39 28 41 31M67 28C64 27 61 28 59 31', width: 3 }],
  },
  eagleRay: {
    body: 'M50 8C47 8 45 12 44 16C34 20 18 26 4 32C18 34 32 37 42 42C45 46 47 50 50 51C53 50 55 46 58 42C68 37 82 34 96 32C82 26 66 20 56 16C55 12 53 8 50 8Z',
    detail: 'M50 51L50 64M50 12L50 49',
    spots: [[34, 27, 1.3], [40, 31, 1.3], [28, 30, 1.3], [60, 31, 1.3], [66, 27, 1.3], [72, 30, 1.3], [46, 24, 1.3], [54, 24, 1.3]],
  },
  stingray: {
    body: 'M50 5C60 7 73 17 80 28C73 39 60 48 50 50C40 48 27 39 20 28C27 17 40 7 50 5Z',
    detail: 'M50 50C52 55 57 60 64 63M50 10C50 20 50 32 50 44M42 21C46 23 54 23 58 21',
    eyes: [[46, 14, 1.1], [54, 14, 1.1]],
  },
  guitarfish: {
    body: 'M4 32C10 26 22 22 34 22C44 18 52 18 56 22C66 24 78 28 86 30L96 26L94 32L96 38L86 34C78 36 66 40 56 42C52 46 44 46 34 42C22 42 10 38 4 32Z M62 25L66 19L70 26Z',
    detail: 'M8 32L30 32M34 24C40 28 40 36 34 40',
    eyes: [[18, 29, 1.2], [18, 35, 1.2]],
  },
  sawfish: {
    body: 'M24 32C28 27 36 24 46 24C54 20 60 20 64 24C72 26 82 29 88 31L97 27L95 32L97 37L88 33C82 35 72 38 64 40C60 44 54 44 46 40C36 40 28 37 24 32Z M4 30.6L24 30.6L24 33.4L4 33.4Z',
    detail: 'M7 30.6L7 28M11 30.6L11 28M15 30.6L15 28M19 30.6L19 28M7 33.4L7 36M11 33.4L11 36M15 33.4L15 36M19 33.4L19 36',
    eyes: [[30, 30, 1.2]],
  },
  turtle: {
    body: 'M50 14C62 14 70 24 70 35C70 47 61 56 50 56C39 56 30 47 30 35C30 24 38 14 50 14Z M50 3C54 3 56 6 56 9C56 12 54 14 50 14C46 14 44 12 44 9C44 6 46 3 50 3Z M34 26C24 20 14 20 8 26C16 30 26 31 33 31Z M66 26C76 20 86 20 92 26C84 30 74 31 67 31Z M36 50C30 53 28 58 30 61C34 59 38 55 40 52Z M64 50C70 53 72 58 70 61C66 59 62 55 60 52Z',
    detail: 'M50 22L58 28L58 40L50 46L42 40L42 28ZM50 22L50 14M58 28L68.5 26.5M58 40L67 46M42 28L31.5 26.5M42 40L33 46M50 46L50 56',
    eyes: [[47.5, 7.5, 0.9], [52.5, 7.5, 0.9]],
  },
  dolphin: {
    body: 'M4 32C6 29 10 28 14 28C20 22 32 19 46 20L54 9L58 21C68 23 76 27 82 30L94 22L92 32L96 40L82 35C72 40 56 43 40 42C26 41 16 38 12 35C8 35 5 34 4 32Z M36 39L32 49L44 40Z',
    detail: 'M5 32.5C9 33.5 12 33.5 15 32.5M14 36C26 40 44 40 60 37',
    eyes: [[17, 30, 1.3]],
  },
  orca: {
    body: 'M4 32C6 27 12 24 20 23C28 19 36 18 46 19L52 3L58 20C68 22 76 26 82 30L94 22L92 32L96 40L82 35C72 40 56 43 40 42C26 41 14 39 8 36C5 35 4 34 4 32Z M34 39L28 51L44 40Z',
    detail: 'M6 34C9 35 12 35 15 34',
    light: [{ d: 'M18 27C21 26 25 26 27 28C24 29 20 29 18 27Z' }, { d: 'M10 36C22 40 36 41 50 39C44 37 32 37 24 35C18 34 13 34 10 36Z' }],
    eyes: [[15, 29, 1.2]],
  },
  bigWhale: {
    body: 'M4 30C8 24 20 20 36 20C54 20 70 24 80 28L95 20L92 30L96 40L80 34C68 40 50 43 34 42C18 41 8 37 4 30Z M30 39C28 47 24 54 17 58C26 56 34 50 38 41Z M62 23L66 18L68 24Z',
    detail: 'M7 33C17 37 29 39 44 39.5M9 35.5C19 39 31 40.5 44 41',
    eyes: [[15, 29, 1.2]],
  },
  seal: {
    body: 'M4 30C8 24 18 22 28 23C40 24 52 26 64 30C72 32 80 33 88 30L96 24L94 32L97 40L88 36C78 38 66 40 52 40C38 42 24 40 14 37C8 36 4 34 4 30Z M30 37L26 48L38 39Z',
    detail: 'M6 31L1 29.5M6 32.5L1 33.5M14 36C26 38.5 44 38.5 60 36',
    eyes: [[12, 28, 1.3]],
  },
  sirenian: {
    body: 'M6 32C8 26 16 22 26 22C42 22 60 24 74 28C82 26 90 24 96 26C94 32 92 38 96 42C88 42 80 40 74 38C60 42 42 44 26 44C14 44 6 40 6 32Z M28 40L24 50L34 42Z',
    detail: 'M7 34C9 36 12 36 14 35M60 26C62 32 62 36 60 40',
    eyes: [[14, 29, 1.1]],
  },
  fish: {
    body: 'M8 33C10 22 22 13 38 13C52 13 64 21 70 30L88 18L85 32L88 46L70 36C64 45 52 52 38 52C22 52 10 44 8 33Z M30 14C36 6 50 6 58 17C50 14 40 13 30 14Z M44 51C50 58 58 57 62 45C56 49 50 51 44 51Z',
    detail: 'M24 21C28 27 28 39 24 45M36 33C42 34 44 38 42 42M8 33L13 34',
    eyes: [[17, 28, 2]],
  },
  clownfish: {
    body: 'M8 33C10 22 22 13 38 13C52 13 64 21 70 30L86 20L83 32L86 44L70 36C64 45 52 52 38 52C22 52 10 44 8 33Z M30 14C36 8 48 8 56 16C48 14 40 13 30 14Z',
    light: [{ d: 'M22 16C26 26 26 40 22 50M42 13C46 24 46 42 42 52M64 25C66 30 66 36 64 40', width: 4.5 }],
    detail: 'M8 33L13 34',
    eyes: [[16, 28, 2]],
  },
  disc: {
    body: 'M14 32C14 18 26 8 42 8C56 8 66 18 68 30L84 22L82 32L84 42L68 34C66 46 56 56 42 56C26 56 14 46 14 32Z M36 9C48 1 64 6 70 17C62 13 50 10 36 9Z M36 55C48 63 64 58 70 47C62 51 50 54 36 55Z M14 31L8 30L8 34L14 33Z',
    detail: 'M30 12C36 22 36 42 30 52M46 9C52 20 52 44 46 55',
    eyes: [[22, 26, 2]],
  },
  mola: {
    body: 'M14 32C14 18 24 10 38 10C50 10 58 16 62 24L68 4L74 24C78 28 78 36 74 40L68 60L62 40C58 48 50 54 38 54C24 54 14 46 14 32Z',
    detail: 'M40 30C44 32 44 36 40 38M16 34C18 36 20 36 22 35',
    eyes: [[24, 28, 2]],
  },
  puffer: {
    body: 'M18 32C18 18 30 10 44 10C58 10 70 20 70 32C70 44 58 54 44 54C30 54 18 46 18 32Z M70 32L84 24L82 32L84 40Z',
    detail: 'M30 12L28 7M44 10L44 5M58 13L61 8M20 22L15 19M18 34L13 34M22 46L17 49M34 53L32 58M52 53L54 58M66 45L70 49M38 30L40 32M48 26L50 28M54 38L56 40M40 42L42 44',
    eyes: [[28, 26, 2.2]],
  },
  boxfish: {
    body: 'M18 22C18 16 22 12 30 12L58 12C66 12 70 16 70 22L70 42C70 48 66 52 58 52L30 52C22 52 18 48 18 42Z M70 32L84 24L82 32L84 40Z',
    dots: [[32, 22, 1.4], [44, 20, 1.4], [56, 22, 1.4], [38, 32, 1.4], [50, 32, 1.4], [62, 32, 1.4], [32, 42, 1.4], [44, 44, 1.4], [56, 42, 1.4]],
    eyes: [[25, 24, 2]],
  },
  slender: {
    body: 'M2 32C10 28 26 26 46 26C64 26 76 28 84 30L96 22L93 32L96 42L84 34C76 36 64 38 46 38C26 38 10 36 2 32Z M40 27L46 19L50 27Z M66 28L70 23L72 29Z',
    detail: 'M2 32L10 33M18 29C17 31 17 34 18 36M14 34C30 36 50 36 70 34',
    eyes: [[11, 30.5, 1.3]],
  },
  tuna: {
    body: 'M4 32C12 25 28 21 46 21C62 21 74 25 80 29L94 15L90 32L94 49L80 35C74 39 62 43 46 43C28 43 12 39 4 32Z M40 22L48 12L54 22Z M48 42L54 52L58 42Z',
    detail: 'M20 25C18 29 18 35 20 39M62 24L64 22M68 26L70 24M62 40L64 42M68 38L70 40M8 35C22 39 44 40 64 37',
    eyes: [[13, 30, 1.6]],
  },
  sailfish: {
    body: 'M14 32C20 28 32 26 48 26C64 26 76 28 84 30L96 22L93 32L96 42L84 34C76 36 64 38 48 38C32 38 20 36 14 32Z M2 31.6L14 31.2L14 32.8Z M24 27C28 9 50 3 70 27C56 26 40 26 24 27Z',
    detail: 'M30 24L32 10M40 26L42 7M50 26L52 8M60 26L60 14M22 29C21 31 21 34 22 36',
    eyes: [[18, 30.5, 1.3]],
  },
  lionfish: {
    body: 'M10 34C12 24 22 18 36 18C50 18 62 24 68 32L84 24L82 34L84 44L68 36C62 44 50 50 36 50C22 50 12 44 10 34Z',
    detail: 'M26 18L20 4M32 18L30 2M38 18L40 3M44 19L50 5M50 20L58 8M56 22L66 12M34 40C28 48 22 56 14 60M38 42C36 50 34 58 30 63M42 42C44 50 46 58 48 63M24 22C27 28 27 40 24 46M10 34L15 35',
    eyes: [[18, 30, 1.8]],
  },
  lurker: {
    body: 'M6 40C8 30 18 24 30 24C36 18 46 16 54 20C64 22 72 28 78 34L92 28L90 38L94 46L78 42C68 48 52 50 36 50C22 50 8 48 6 40Z',
    detail: 'M6 40C12 42 18 42 24 40M40 22L42 16M48 20L52 14M56 22L60 17M36 34L38 36M46 30L48 32M54 38L56 40M44 42L46 44M64 36L66 38M30 44C34 46 40 48 46 47',
    eyes: [[26, 29, 1.8]],
  },
  seahorse: {
    body: 'M40 14C42 9 50 7 54 10C58 13 58 20 54 23L46 22L36 21C33 21 33 17 36 17Z',
    limbs: [{ d: 'M52 22C58 28 58 38 52 44C46 50 46 58 52 60C56 61 58 57 55 55', width: 8 }],
    detail: 'M57 30L61 29M57 36L61 36M54 42L58 44M50 12L52 8L55 11',
    eyes: [[49, 14, 1.3]],
  },
  eel: {
    body: 'M5 26C5 20 11 17 17 19C21 21 22 29 18 31C12 33 5 31 5 26Z',
    limbs: [{ d: 'M17 25C24 24 29 28 34 34C40 42 50 46 60 40C70 34 78 28 93 32', width: 10 }],
    detail: 'M6 28C9 29 12 29 15 28',
    eyes: [[11, 23.5, 1.3]],
  },
  seaSnake: {
    body: 'M4 24C4 20 8 18 12 19C15 20 16 26 13 28C9 29 4 28 4 24Z',
    limbs: [{ d: 'M12 23C20 21 26 26 30 32C36 40 46 44 56 38C66 32 74 26 84 30C90 32 94 36 96 40', width: 7 }],
    light: [{ d: 'M22 23.5L22 29M34 31L32 37M46 41L46 47M58 33L59 39M70 28L70 34M82 28L81 34', width: 3.5 }],
    eyes: [[8, 22.5, 1.1]],
  },
  pipe: {
    body: 'M88 32L97 25L97 39Z',
    limbs: [{ d: 'M6 32L89 32', width: 6 }],
    detail: 'M28 28L30 24M48 28L50 24M66 36L68 40',
    eyes: [[12, 31, 1.1]],
  },
  octopus: {
    body: 'M50 4C62 4 70 12 70 22C70 30 64 34 58 36L42 36C36 34 30 30 30 22C30 12 38 4 50 4Z',
    limbs: [
      { d: 'M40 35C34 44 38 50 28 58', width: 5 },
      { d: 'M46 36C44 46 48 52 42 62', width: 5 },
      { d: 'M54 36C56 46 52 52 58 62', width: 5 },
      { d: 'M60 35C66 44 62 50 72 58', width: 5 },
      { d: 'M36 31C26 37 22 45 12 47', width: 4.5 },
      { d: 'M64 31C74 37 78 45 88 47', width: 4.5 },
    ],
    eyes: [[44, 24, 1.8], [56, 24, 1.8]],
  },
  cuttlefish: {
    body: 'M30 32C30 20 46 14 64 16C80 18 90 24 90 32C90 40 80 46 64 48C46 50 30 44 30 32Z M20 32C20 28 24 26 30 27L30 37C24 38 20 36 20 32Z',
    limbs: [
      { d: 'M21 29C15 27 11 25 6 25', width: 3 },
      { d: 'M20 32L5 32', width: 3 },
      { d: 'M21 35C15 37 11 39 6 39', width: 3 },
    ],
    detail: 'M34 24C50 16 76 17 88 27M34 40C50 48 76 47 88 37M24 29L26 31L28 29',
  },
  squid: {
    body: 'M30 32C30 26 44 22 70 24L90 16L86 32L90 48L70 40C44 42 30 38 30 32Z M22 32C22 28 26 26 30 27L30 37C26 38 22 36 22 32Z',
    limbs: [
      { d: 'M23 30C15 26 9 24 3 24', width: 2.6 },
      { d: 'M22 32L3 32', width: 2.6 },
      { d: 'M23 34C15 38 9 40 3 40', width: 2.6 },
    ],
    detail: 'M34 32C50 30 64 31 78 32',
    eyes: [[26, 30.5, 1.5]],
  },
  nautilus: {
    body: 'M60 8C78 8 90 20 90 34C90 48 78 58 62 58C50 58 40 50 38 40L30 40C26 40 24 36 24 32C24 28 26 24 30 24L40 24C44 14 52 8 60 8Z',
    limbs: [
      { d: 'M25 29C18 26 12 24 6 25', width: 2.4 },
      { d: 'M24 33L6 34', width: 2.4 },
      { d: 'M25 37C18 40 12 42 6 41', width: 2.4 },
    ],
    detail: 'M62 20C72 20 78 28 76 36C74 44 64 46 58 40C54 36 56 28 62 28M48 14C50 20 50 26 46 30M80 16C76 22 74 28 76 34M86 44C80 44 76 42 74 40',
    eyes: [[33, 30, 1.3]],
  },
  nudibranch: {
    body: 'M8 42C10 34 22 30 40 30C60 30 80 32 92 40C94 44 90 48 84 48L16 48C10 48 7 46 8 42Z',
    detail: 'M18 32L14 22M24 31L22 21M80 33C80 25 86 24 89 30M85 34C87 27 93 29 92 35M12 44C30 40 66 40 88 44',
    dots: [[13.5, 21, 1.6], [21.5, 20, 1.6]],
  },
  shrimp: {
    body: 'M14 30C16 24 24 20 34 20C50 20 64 24 74 30C80 34 82 40 80 44L88 50L84 52L78 46C70 46 60 42 50 40C36 40 22 38 16 36C14 34 14 32 14 30Z',
    detail: 'M14 28C8 16 4 10 2 6M16 27C12 18 10 12 10 8M30 39L28 48M38 40L36 49M46 41L44 50M54 42L54 50M44 21C46 28 46 34 44 40M54 23C56 30 56 36 54 41M64 27C66 32 66 38 64 43',
    eyes: [[20, 25, 1.6]],
  },
  worm: {
    body: 'M30 54C24 44 26 30 34 16C40 30 42 44 36 54Z M66 54C60 44 62 30 70 16C76 30 78 44 72 54Z',
    detail: 'M26 46L40 44M27 38L40 36M29 30L38 28M31 22L37 21M62 46L76 44M63 38L76 36M65 30L74 28M67 22L73 21M22 57L80 57',
  },
  clam: {
    body: 'M10 40C10 24 28 14 50 14C72 14 90 24 90 40C90 48 84 52 76 52L24 52C16 52 10 48 10 40Z',
    detail: 'M14 42C22 36 30 46 38 40C46 34 54 46 62 40C70 34 78 46 86 40M30 18C34 26 34 34 32 40M50 14L50 38M70 18C66 26 66 34 68 40',
  },
  jellyfish: {
    body: 'M26 30C26 14 38 6 50 6C62 6 74 14 74 30C70 32 66 30 62 32C58 30 54 32 50 30C46 32 42 30 38 32C34 30 30 32 26 30Z',
    limbs: [
      { d: 'M34 32C32 42 38 50 34 62', width: 2.2 },
      { d: 'M44 32C44 44 40 52 44 62', width: 2.2 },
      { d: 'M56 32C56 44 60 52 56 62', width: 2.2 },
      { d: 'M66 32C68 42 62 50 66 62', width: 2.2 },
    ],
    detail: 'M34 22C40 16 46 14 50 14',
  },
  iguana: {
    body: 'M4 34C8 28 18 26 26 28C36 24 50 24 62 28C72 30 82 34 96 30C86 36 74 40 62 40C50 42 40 40 30 40C20 40 8 40 4 34Z',
    detail: 'M30 40L26 48L22 48M50 40L52 48L56 48M30 27L32 23L34 26L36 22L38 25L40 22L42 25L44 22L46 25L48 23L50 26M6 35C9 36 12 36 15 35',
    eyes: [[13, 31, 1.3]],
  },
} as const satisfies Record<string, ArtShape>;

export type ShapeName = keyof typeof SHAPES;

const SHAPE_BY_ID: Record<string, ShapeName> = {
  'whale-shark': 'whaleShark',
  'great-hammerhead': 'hammerhead',
  'scalloped-hammerhead': 'hammerhead',
  'thresher-shark': 'thresher',
  'zebra-shark': 'carpet',
  'tasselled-wobbegong': 'carpet',
  'nurse-shark': 'carpet',
  'reef-manta': 'manta',
  'oceanic-manta': 'manta',
  'munks-devil-ray': 'manta',
  'spotted-eagle-ray': 'eagleRay',
  sawfish: 'sawfish',
  'giant-guitarfish': 'guitarfish',
  'bottlenose-dolphin': 'dolphin',
  'spinner-dolphin': 'dolphin',
  orca: 'orca',
  'humpback-whale': 'bigWhale',
  'sperm-whale': 'bigWhale',
  dugong: 'sirenian',
  'west-indian-manatee': 'sirenian',
  'california-sea-lion': 'seal',
  'harbor-seal': 'seal',
  'sea-otter': 'seal',
  'mola-mola': 'mola',
  sailfish: 'sailfish',
  'yellowfin-tuna': 'tuna',
  'dogtooth-tuna': 'tuna',
  'great-barracuda': 'slender',
  'chevron-barracuda': 'slender',
  tarpon: 'slender',
  clownfish: 'clownfish',
  'moorish-idol': 'disc',
  'emperor-angelfish': 'disc',
  'french-angelfish': 'disc',
  'queen-angelfish': 'disc',
  'king-angelfish': 'disc',
  'raccoon-butterflyfish': 'disc',
  'blue-tang': 'disc',
  'circular-batfish': 'disc',
  lionfish: 'lionfish',
  stonefish: 'lurker',
  'leaf-scorpionfish': 'lurker',
  'giant-frogfish': 'lurker',
  crocodilefish: 'lurker',
  'flying-gurnard': 'lurker',
  lingcod: 'lurker',
  'common-seahorse': 'seahorse',
  'leafy-seadragon': 'seahorse',
  'weedy-seadragon': 'seahorse',
  'pygmy-seahorse': 'seahorse',
  'ribbon-eel': 'eel',
  'giant-moray': 'eel',
  'green-moray': 'eel',
  'garden-eel': 'eel',
  'wolf-eel': 'eel',
  'star-puffer': 'puffer',
  porcupinefish: 'puffer',
  'yellow-boxfish': 'boxfish',
  trumpetfish: 'pipe',
  'ornate-ghost-pipefish': 'pipe',
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

const SHAPE_BY_CATEGORY: Record<Category, ShapeName> = {
  shark: 'shark',
  ray: 'stingray',
  turtle: 'turtle',
  mammal: 'dolphin',
  fish: 'fish',
  cephalopod: 'octopus',
  macro: 'nudibranch',
  reptile: 'seaSnake',
  other: 'fish',
};

/** Wash colours chosen for the species people know by their colour. */
const WASH_BY_ID: Record<string, string> = {
  'whale-shark': '#6E9FCB',
  'great-white-shark': '#9FB0BC',
  'tiger-shark': '#C9B48A',
  'lemon-shark': '#D6C27A',
  'bull-shark': '#A3A79B',
  'zebra-shark': '#D9C28F',
  'tasselled-wobbegong': '#C2A878',
  'nurse-shark': '#C9AE84',
  'sand-tiger-shark': '#B9AE98',
  'reef-manta': '#8E9DEB',
  'oceanic-manta': '#7F90E6',
  'munks-devil-ray': '#9AA8F0',
  'spotted-eagle-ray': '#5E6E9A',
  'bluespotted-ribbontail-ray': '#7DB6D6',
  sawfish: '#B7A68A',
  'giant-guitarfish': '#C9B898',
  'green-turtle': '#86CF97',
  'hawksbill-turtle': '#C79A5A',
  'loggerhead-turtle': '#C98C52',
  'olive-ridley-turtle': '#9DB07A',
  'leatherback-turtle': '#6B7A88',
  orca: '#2B3446',
  'humpback-whale': '#6C7E96',
  'sperm-whale': '#7C8794',
  dugong: '#B8A99A',
  'west-indian-manatee': '#A9A49B',
  'california-sea-lion': '#B88B5E',
  'harbor-seal': '#A6A39A',
  'sea-otter': '#8B6A4E',
  'mola-mola': '#A9BBC9',
  sailfish: '#4E78C4',
  'napoleon-wrasse': '#4FC2B6',
  'bumphead-parrotfish': '#7FB3A4',
  'giant-grouper': '#B49A78',
  'goliath-grouper': '#9A8F72',
  'potato-cod': '#B8B094',
  'yellowfin-tuna': '#5F86C8',
  'dogtooth-tuna': '#7C93A8',
  clownfish: '#FF8A3D',
  'moorish-idol': '#FFD166',
  'emperor-angelfish': '#5F7FD8',
  'french-angelfish': '#6A7180',
  'queen-angelfish': '#5FB4D8',
  'king-angelfish': '#5E86C9',
  'raccoon-butterflyfish': '#FFC94A',
  'stoplight-parrotfish': '#5FC4A0',
  'clown-triggerfish': '#4A5A78',
  lionfish: '#E8806A',
  stonefish: '#A8977E',
  'leaf-scorpionfish': '#E3B04B',
  'giant-frogfish': '#E39A3B',
  'common-seahorse': '#E7B65C',
  'leafy-seadragon': '#C7B25A',
  'weedy-seadragon': '#D98A5A',
  'ribbon-eel': '#5B8FE0',
  'giant-moray': '#B59C6A',
  'green-moray': '#7FAE5E',
  'garden-eel': '#D8D2B8',
  mandarinfish: '#3E8FD8',
  'blue-tang': '#4C7BE0',
  'oriental-sweetlips': '#E7D27A',
  'yellow-boxfish': '#FFD84D',
  garibaldi: '#FF8A3D',
  'sea-goldie': '#FF9A6B',
  'yellowhead-jawfish': '#F2D06B',
  'pygmy-seahorse': '#F2A0B5',
  'ornate-ghost-pipefish': '#E3A06B',
  'anna-chromodoris': '#9D8CF0',
  'pikachu-nudibranch': '#FFD84D',
  'spanish-dancer': '#E8605A',
  'harlequin-shrimp': '#F2A0B5',
  'peacock-mantis-shrimp': '#5FC4A0',
  'caribbean-spiny-lobster': '#E39A5A',
  'christmas-tree-worm': '#F2785A',
  'giant-clam': '#5FA8D8',
  'day-octopus': '#F28C82',
  'giant-pacific-octopus': '#D9705E',
  'blue-ringed-octopus': '#E8C46A',
  'flamboyant-cuttlefish': '#E8708A',
  'chambered-nautilus': '#E3C29A',
  'banded-sea-krait': '#7FA8C8',
  'marine-iguana': '#7E8A78',
  'golden-jellyfish': '#F4C95D',
};

/** The rest of each group takes one of its family's colours. */
const WASH_BY_CATEGORY: Record<Category, string[]> = {
  shark: ['#9DB4C2', '#B4C6D2', '#8FA9BA', '#A8B9C4'],
  ray: ['#C2AE8E', '#B79C82', '#9AA8F0'],
  turtle: ['#86CF97', '#9DB07A'],
  mammal: ['#9FB3C8', '#A8B8CC'],
  fish: ['#4FC2B6', '#FFA45C', '#F28C82', '#FFD166', '#6E9FCB', '#86CF97', '#B79CF0'],
  cephalopod: ['#F28C82', '#D2B48C', '#D8A8B8', '#C9A27A'],
  macro: ['#9D8CF0', '#F2A0B5', '#5FC4A0'],
  reptile: ['#7FA8C8'],
  other: ['#B79CF0'],
};

export interface SpeciesArt {
  shape: ArtShape;
  wash: string;
  seed: number;
}

/** How to draw a species: its body shape and its wash. */
export function artFor(species: Pick<Species, 'id' | 'category'>): SpeciesArt {
  const seed = hashSeed(species.id);
  const shapeName = SHAPE_BY_ID[species.id] ?? SHAPE_BY_CATEGORY[species.category] ?? 'fish';
  const family = WASH_BY_CATEGORY[species.category] ?? WASH_BY_CATEGORY.other;
  return {
    shape: SHAPES[shapeName],
    wash: WASH_BY_ID[species.id] ?? family[seed % family.length],
    seed,
  };
}

export function shapeNameFor(species: Pick<Species, 'id' | 'category'>): ShapeName {
  return SHAPE_BY_ID[species.id] ?? SHAPE_BY_CATEGORY[species.category] ?? 'fish';
}
