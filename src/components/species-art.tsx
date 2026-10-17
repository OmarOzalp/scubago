import { memo, useEffect, useId, useMemo, useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, ClipPath, Defs, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';

import { useSchemeName, useTheme } from '@/hooks/use-theme';
import { cachedPlate, hasPlate, PLATE_BOX, type PlateDrawing, requestPlate } from '@/lib/plates';
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
 * A field-guide drawing of a species: its own engraved, hand-tinted plate, or for a species added
 * by a diver (which has none) its group's drawing. Decorative: its name is always written next to it.
 */
export const SpeciesArt = memo(function SpeciesArt({ species, width, found = true, paper, style }: Props) {
  const theme = useTheme();
  const backing = paper ?? theme.backgroundElement;
  return hasPlate(species.id) ? (
    <PlateArt id={species.id} width={width} found={found} paper={backing} style={style} />
  ) : (
    <GroupArt species={species} width={width} found={found} paper={backing} style={style} />
  );
});

interface ArtProps {
  width: number;
  found: boolean;
  paper: string;
  style?: StyleProp<ViewStyle>;
}

/** An engraved plate, drawn when the queue reaches it (at once if it has been drawn before). */
function PlateArt({ id, width, found, paper, style }: ArtProps & { id: string }) {
  // Clip ids must be unique on the page (the web shares one document).
  const uid = `pl${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const height = (width * PLATE_BOX.height) / PLATE_BOX.width;
  const options = useMemo(() => ({ width, found, paper }), [width, found, paper]);
  const key = `${id}|${Math.round(width)}|${found}|${paper}`;
  const [ready, setReady] = useState<{ key: string; drawing: PlateDrawing | null } | null>(null);
  const drawing = ready?.key === key ? ready.drawing : (cachedPlate(id, options) ?? null);

  useEffect(() => {
    if (cachedPlate(id, options)) return;
    return requestPlate(id, options, (d) => setReady({ key, drawing: d }));
  }, [id, options, key]);

  return (
    // Hidden and untouchable on the wrapper: on the web, Svg hands its props straight to the <svg> element.
    <View aria-hidden style={[{ width, height, pointerEvents: 'none' }, style]}>
      {drawing ? (
        <Svg width={width} height={height} viewBox={`0 0 ${PLATE_BOX.width} ${PLATE_BOX.height}`}>
          <Defs>
            <ClipPath id={`${uid}-trunk`}>
              <Path d={drawing.trunk} />
            </ClipPath>
            <ClipPath id={`${uid}-body`}>
              <Path d={drawing.body} />
            </ClipPath>
          </Defs>
          {drawing.shapes.map((s, i) => (
            <Path
              key={i}
              d={s.d}
              fill={s.fill ?? 'none'}
              fillOpacity={s.fillOpacity}
              stroke={s.stroke}
              strokeWidth={s.strokeWidth}
              strokeOpacity={s.strokeOpacity}
              strokeDasharray={s.dash}
              strokeLinejoin="round"
              strokeLinecap="round"
              clipPath={s.clip ? `url(#${uid}-${s.clip})` : undefined}
            />
          ))}
        </Svg>
      ) : null}
    </View>
  );
}

/** The group drawing (a generic shark, ray, reef fish…) in the species' colours. */
function GroupArt({ species, width, found, paper, style }: ArtProps & { species: Pick<Species, 'id' | 'category'> }) {
  const scheme = useSchemeName();
  // Gradient and clip ids must be unique on the page (the web shares one document).
  const id = `sa${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const height = (width * ART_BOX.height) / ART_BOX.width;
  const art = useMemo(() => composeArt(artFor(species), { width, found, scheme, paper }), [species, width, found, scheme, paper]);
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
}
