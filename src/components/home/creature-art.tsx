import Svg, { Circle, Ellipse, G, Path } from 'react-native-svg';
import type { Species } from '@/lib/types';

const INKS = ['#397E87', '#D59B56', '#66978C', '#718DA5', '#C98172'];
export function creatureColor(id: string) {
  return INKS[Array.from(id).reduce((sum, char) => sum + char.charCodeAt(0), 0) % INKS.length];
}

/** Small, top-down silhouettes; individual species use stable colors within their family. */
export function CreatureArt({ species, size = 58 }: { species: Species; size?: number }) {
  const color = creatureColor(species.id);
  let shape;
  switch (species.category) {
    case 'ray':
      shape = <><Path d="M37 26 Q28 16 12 8 Q15 27 7 41 Q29 39 37 32 Q47 39 64 41 Q57 25 63 9 Q45 16 37 26Z" /><Path d="M37 31 Q40 48 49 53" fill="none" stroke={color} strokeWidth="2" /><Ellipse cx="37" cy="26" rx="5" ry="12" /></>;
      break;
    case 'turtle':
      shape = <><Path d="M29 22 Q14 9 13 17 L24 30 Q13 38 20 42 L31 34 M44 22 Q61 10 59 19 L49 30 Q60 40 52 42 L43 34" /><Ellipse cx="37" cy="27" rx="13" ry="16" /><Ellipse cx="37" cy="8" rx="5" ry="6" /><Path d="M37 16 L44 22 L44 32 L37 38 L30 32 L30 22Z" fill="none" stroke="#D6E4CB" strokeWidth="1.4" /></>;
      break;
    case 'shark':
    case 'mammal':
      shape = <><Path d="M8 29 Q27 13 58 24 Q69 28 58 33 Q31 44 8 29Z M13 28 L2 16 L5 29 L1 40Z M35 23 L27 9 L46 22Z M38 35 L28 45 L46 34Z" /><Path d="M25 27 Q41 22 57 27" fill="none" stroke="#D9ECE7" strokeWidth="1.5" opacity=".6" /><Circle cx="57" cy="27" r="1.3" fill="#213F47" /></>;
      break;
    case 'cephalopod':
      shape = <><Ellipse cx="39" cy="20" rx="14" ry="15" /><Path d="M28 28 Q11 38 20 45 M33 30 Q23 47 31 48 M40 31 Q37 50 43 47 M47 28 Q60 45 55 47" fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" /><Circle cx="34" cy="22" r="1.5" fill="#E7F0E2" /><Circle cx="44" cy="22" r="1.5" fill="#E7F0E2" /></>;
      break;
    case 'macro':
      shape = <><Path d="M20 30 Q27 15 47 21 Q61 29 49 36 Q32 43 20 30Z" /><Path d="M25 25 L21 16 M29 23 L29 14 M46 23 L51 15" stroke={color} strokeWidth="3" strokeLinecap="round" /><Path d="M28 29 Q38 23 49 28" fill="none" stroke="#F3DABE" strokeWidth="3" /></>;
      break;
    case 'reptile':
      shape = <Path d="M12 35 C38 49 24 7 47 18 S48 41 65 24" fill="none" stroke={color} strokeWidth="7" strokeLinecap="round" />;
      break;
    case 'other':
      shape = <><Path d="M37 9 L42 24 L59 23 L46 33 L51 48 L37 39 L23 48 L28 33 L15 23 L32 24Z" /><Circle cx="37" cy="30" r="3" fill="#E9D6AD" /></>;
      break;
    default:
      shape = <><Path d="M17 29 Q37 9 61 28 Q43 47 17 31 L5 41 L7 28 L5 17Z" /><Path d="M31 21 L39 14 L46 21 M32 37 L40 44 L46 36" /><Path d="M35 21 Q30 29 36 37" fill="none" stroke="#EAF0D8" strokeWidth="4" opacity=".8" /><Circle cx="53" cy="27" r="1.6" fill="#233F45" /></>;
  }
  return <Svg width={size} height={size * .75} viewBox="0 0 74 56"><G fill={color}>{shape}</G></Svg>;
}
