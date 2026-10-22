/**
 * A species' drawing on a card. The app's `SpeciesArt` draws a plate when the screen's turn comes
 * in a queue (a moment after it first appears), and a species a diver added themselves in the
 * colours of the phone's light or dark scheme. A card is captured the moment it is on screen and
 * must be the same in both schemes, so this draws the plate straight away and the group drawing in
 * the light colours.
 */
import { memo, useId, useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Circle, ClipPath, Defs, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';

import { SpeciesArt } from '@/components/species-art';
import { hasPlate, plateDrawing } from '@/lib/plates';
import { ART_BOX, artFor, composeArt, type ArtShape } from '@/lib/species-art';
import type { Species } from '@/lib/types';

import { CARD_COLORS } from './card-kit';

type ArtSpecies = Pick<Species, 'id' | 'category'>;

export const CardSpeciesArt = memo(function CardSpeciesArt({ species, width }: { species: ArtSpecies; width: number }) {
  if (hasPlate(species.id)) {
    // Drawn here, so `SpeciesArt` finds it ready on its first render instead of queueing it.
    plateDrawing(species.id, { width });
    return <SpeciesArt species={species} width={width} paper={CARD_COLORS.sheet} />;
  }
  return <LightGroupArt species={species} width={width} />;
});

/** The group drawing (a generic shark, ray, reef fish…) of a species with no plate, in the light colours. */
function LightGroupArt({ species, width }: { species: ArtSpecies; width: number }) {
  const id = `ca${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const height = (width * ART_BOX.height) / ART_BOX.width;
  const art = useMemo(() => composeArt(artFor(species), { width, found: true, scheme: 'light', paper: CARD_COLORS.sheet }), [species, width]);
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
    <View aria-hidden style={{ width, height, pointerEvents: 'none' }}>
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
