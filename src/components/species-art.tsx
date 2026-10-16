import { memo, useId, useMemo } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, ClipPath, Defs, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';

import { useSchemeName, useTheme } from '@/hooks/use-theme';
import { ART_BOX, artFor, composeArt, type ArtShape } from '@/lib/species-art';
import type { Species } from '@/lib/types';

interface Props {
  species: Pick<Species, 'id' | 'category'>;
  /** Width in points; the drawing is 200×128, so the height follows. */
  width: number;
  /** false: a dashed pencil outline (a species still to find). */
  found?: boolean;
  /** The paper behind the drawing (fills a pencil outline). */
  paper?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * A field-guide drawing of a species: its group's drawing in its own colours and markings, shaded
 * and outlined. Decorative: its name is always written next to it.
 */
export const SpeciesArt = memo(function SpeciesArt({ species, width, found = true, paper, style }: Props) {
  const theme = useTheme();
  const scheme = useSchemeName();
  // Gradient and clip ids must be unique on the page (the web shares one document).
  const id = `sa${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const height = (width * ART_BOX.height) / ART_BOX.width;
  const art = useMemo(
    () => composeArt(artFor(species), { width, found, scheme, paper: paper ?? theme.backgroundElement }),
    [species, width, found, scheme, paper, theme.backgroundElement],
  );
  const { shading } = art;

  const props = (s: ArtShape) => ({
    fill: s.fill === '@body' ? `url(#${id}-body)` : (s.fill ?? 'none'),
    fillOpacity: s.fillOpacity,
    stroke: s.stroke,
    strokeWidth: s.strokeWidth,
    strokeOpacity: s.strokeOpacity,
    strokeDasharray: s.dash,
    strokeLinejoin: 'round' as const,
    strokeLinecap: 'round' as const,
    clipPath: s.clip ? `url(#${id}-clip)` : undefined,
  });

  return (
    // Hidden and untouchable on the wrapper: on the web, Svg hands its props straight to the <svg> element.
    <View aria-hidden style={[{ width, height, pointerEvents: 'none' }, style]}>
      <Svg width={width} height={height} viewBox={`0 0 ${ART_BOX.width} ${ART_BOX.height}`}>
        <Defs>
          {shading.type === 'linear' ? (
            <LinearGradient id={`${id}-body`} x1="0" y1={shading.y1} x2="0" y2={shading.y2} gradientUnits="userSpaceOnUse">
              {shading.stops.map((st) => (
                <Stop key={st.offset} offset={st.offset} stopColor={st.color} />
              ))}
            </LinearGradient>
          ) : (
            <RadialGradient id={`${id}-body`} cx={shading.cx} cy={shading.cy} r={shading.r} gradientUnits="userSpaceOnUse">
              {shading.stops.map((st) => (
                <Stop key={st.offset} offset={st.offset} stopColor={st.color} />
              ))}
            </RadialGradient>
          )}
          <ClipPath id={`${id}-clip`}>
            <Path d={art.clip} />
          </ClipPath>
        </Defs>
        {art.shapes.map((s, i) =>
          s.kind === 'circle' ? <Circle key={i} cx={s.cx} cy={s.cy} r={s.r} {...props(s)} /> : <Path key={i} d={s.d} {...props(s)} />,
        )}
      </Svg>
    </View>
  );
});
