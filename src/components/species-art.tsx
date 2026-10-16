import { memo } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';

import { useSchemeName, useTheme } from '@/hooks/use-theme';
import { ART_BOX, artFor } from '@/lib/species-art';
import type { Species } from '@/lib/types';

/** Pencil for species still to find. */
const PENCIL = { light: '#9C9381', dark: '#6F829A' };
/** The wash sits a hair off the ink, as when a print or a painting is slightly out of register. */
const OFFSET = 'translate(1.6 1.4)';

interface Props {
  species: Pick<Species, 'id' | 'category'>;
  /** Width in points; the drawing is 100×64, so the height follows. */
  width: number;
  /** false: a dashed pencil outline, no colour (a species still to find). */
  found?: boolean;
  /** The paper behind the drawing (fills the inside of eels and tails). */
  paper?: string;
  style?: StyleProp<ViewStyle>;
}

/** A field-guide drawing of a species: ink line art with a watercolour wash. Decorative. */
export const SpeciesArt = memo(function SpeciesArt({ species, width, found = true, paper, style }: Props) {
  const theme = useTheme();
  const scheme = useSchemeName();
  const { shape, wash } = artFor(species);
  const height = (width * ART_BOX.height) / ART_BOX.width;
  const scale = width / ART_BOX.width;
  // About 1.3pt of ink on screen at any size (a little more on big plates).
  const ink = found ? theme.text : PENCIL[scheme];
  const sw = Math.min(1.9, Math.max(1.15, width / 70)) / scale;
  const dash = found ? undefined : `${3.2 / scale / 1.4} ${2.6 / scale / 1.4}`;
  const ground = paper ?? theme.backgroundElement;

  return (
    <Svg
      width={width}
      height={height}
      viewBox={`0 0 ${ART_BOX.width} ${ART_BOX.height}`}
      style={style}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      {found ? (
        <G transform={OFFSET}>
          <Path d={shape.body} fill={wash} opacity={0.82} />
          {shape.limbs?.map((limb) => (
            <Path key={limb.d} d={limb.d} fill="none" stroke={wash} strokeWidth={limb.width} strokeLinecap="round" opacity={0.82} />
          ))}
          <Path d={shape.body} fill="none" stroke={wash} strokeWidth={2.4} strokeLinejoin="round" opacity={0.5} />
        </G>
      ) : null}
      {shape.limbs?.map((limb) => (
        <G key={limb.d}>
          <Path d={limb.d} fill="none" stroke={ink} strokeWidth={limb.width + sw * 2} strokeLinecap="round" strokeDasharray={dash} />
          <Path d={limb.d} fill="none" stroke={ground} strokeWidth={limb.width} strokeLinecap="round" />
          {found ? <Path d={limb.d} fill="none" stroke={wash} strokeWidth={limb.width} strokeLinecap="round" opacity={0.82} /> : null}
        </G>
      ))}
      {found
        ? shape.light?.map((mark) => (
            <Path
              key={mark.d}
              d={mark.d}
              fill={mark.width ? 'none' : '#FFFFFF'}
              fillOpacity={0.85}
              stroke={mark.width ? '#FFFFFF' : 'none'}
              strokeOpacity={0.85}
              strokeWidth={mark.width ?? 0}
              strokeLinecap="round"
            />
          ))
        : null}
      {found ? shape.spots?.map(([x, y, r]) => <Circle key={`${x},${y}`} cx={x} cy={y} r={r} fill="#FFFFFF" fillOpacity={0.9} />) : null}
      <Path d={shape.body} fill="none" stroke={ink} strokeWidth={sw} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={dash} />
      {shape.detail ? (
        <Path d={shape.detail} fill="none" stroke={ink} strokeWidth={sw * 0.8} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={dash} opacity={found ? 0.9 : 0.8} />
      ) : null}
      {found ? shape.dots?.map(([x, y, r]) => <Circle key={`${x},${y}`} cx={x} cy={y} r={r} fill={ink} />) : null}
      {shape.eyes?.map(([x, y, r]) => <Circle key={`${x},${y}`} cx={x} cy={y} r={r} fill={ink} />)}
    </Svg>
  );
});
