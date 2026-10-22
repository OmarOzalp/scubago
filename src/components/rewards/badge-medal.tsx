import { useMemo } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';
import Svg, { Circle, G, Path } from 'react-native-svg';

import { areaColor, EmblemArt } from '@/components/rewards/emblem';
import { medalPalette } from '@/components/rewards/palette';
import { useSchemeName, useTheme } from '@/hooks/use-theme';
import type { BadgeResult } from '@/lib/rewards';

const CENTRE = 50;
const SCALLOPS = 20;

/** The scalloped rim of a rosette: `SCALLOPS` shallow bumps around a circle of radius `r`. */
function rosette(r: number, bulge: number): string {
  const point = (angle: number, radius: number) => `${(CENTRE + radius * Math.cos(angle)).toFixed(2)} ${(CENTRE + radius * Math.sin(angle)).toFixed(2)}`;
  let d = `M${point(-Math.PI / 2, r)}`;
  for (let i = 0; i < SCALLOPS; i++) {
    const a0 = -Math.PI / 2 + (i * 2 * Math.PI) / SCALLOPS;
    const a1 = a0 + (2 * Math.PI) / SCALLOPS;
    d += ` Q${point((a0 + a1) / 2, r + bulge)} ${point(a1, r)}`;
  }
  return `${d}Z`;
}
const RIM = rosette(44.5, 6.5);

/** Two ribbon tails behind a medal, for the ones shown large. */
const RIBBON_LEFT = 'M33 80 L22 121 L35 113 L44 122 L51 84 Z';
const RIBBON_RIGHT = 'M67 80 L78 121 L65 113 L56 122 L49 84 Z';

/** How a medal comes in: it drops, overshoots and settles, like a stamp. Nothing moves under Reduce Motion. */
export function useMedalIn(delay = 0): ViewStyle {
  const reduced = useReducedMotion();
  if (reduced) return {};
  return {
    animationName: {
      '0%': { opacity: 0, transform: [{ scale: 0.35 }, { rotate: '-16deg' }] },
      '55%': { opacity: 1, transform: [{ scale: 1.13 }, { rotate: '4deg' }] },
      '78%': { opacity: 1, transform: [{ scale: 0.97 }, { rotate: '-1deg' }] },
      '100%': { opacity: 1, transform: [{ scale: 1 }, { rotate: '0deg' }] },
    },
    animationDuration: '780ms',
    animationDelay: `${delay}ms`,
    animationTimingFunction: 'ease-out',
    animationFillMode: 'both',
  } as ViewStyle;
}

interface Props {
  badge: BadgeResult;
  size?: number;
  /** Ribbon tails below the medal (it is then taller than wide). */
  ribbon?: boolean;
  /** Drop the medal in when it first appears. */
  reveal?: boolean;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * A badge as a medal. Earned: a scalloped rim in its tier's metal (pips for the tier, so colour is
 * never the only cue), the emblem on a tinted face. Not earned: a pencil outline in dashes, with
 * the progress so far inked over it as an arc. Decorative: the control around it says what it is.
 */
export function BadgeMedal({ badge, size = 72, ribbon = false, reveal = false, delay = 0, style }: Props) {
  const theme = useTheme();
  const scheme = useSchemeName();
  const area = badge.areaId;
  const palette = useMemo(() => medalPalette(badge, theme, scheme, area ? areaColor(area) : undefined), [badge, theme, scheme, area]);
  const motion = useMedalIn(delay);
  const height = ribbon ? size * 1.22 : size;
  const pips = badge.tier === 'gold' ? 3 : badge.tier === 'silver' ? 2 : badge.tier === 'bronze' ? 1 : 0;
  const { have, need } = badge.progress;
  const circumference = 2 * Math.PI * 46;
  const inked = need > 0 ? Math.max(0, Math.min(1, have / need)) : 0;
  const pencil = theme.textSecondary;
  const emblemSize = size * (pips > 0 && badge.earned ? 0.4 : 0.44);

  return (
    <Animated.View aria-hidden style={[{ width: size, height, pointerEvents: 'none' }, reveal && badge.earned ? motion : null, style]}>
      <Svg width={size} height={height} viewBox={`0 0 100 ${ribbon ? 122 : 100}`}>
        {badge.earned ? (
          <G>
            {ribbon ? (
              <G>
                <Path d={RIBBON_LEFT} fill={palette.ribbon} stroke={palette.ink} strokeWidth={1.4} strokeLinejoin="round" />
                <Path d={RIBBON_RIGHT} fill={palette.ribbon} stroke={palette.ink} strokeWidth={1.4} strokeLinejoin="round" />
              </G>
            ) : null}
            <Path d={RIM} fill={palette.shadow} transform="translate(0 2.2)" />
            <Path d={RIM} fill={palette.rim} stroke={palette.ink} strokeWidth={1.5} strokeLinejoin="round" />
            <Circle cx={CENTRE} cy={CENTRE} r={40.5} fill="none" stroke={palette.bevel} strokeWidth={2.6} />
            <Circle cx={CENTRE} cy={CENTRE} r={38} fill={palette.face} stroke={palette.ink} strokeWidth={1.4} />
            <Circle cx={CENTRE} cy={CENTRE} r={34} fill="none" stroke={palette.ink} strokeWidth={0.9} strokeDasharray="1.2 2.6" opacity={0.32} />
            <Path d="M27 40 A25 25 0 0 1 43 26" fill="none" stroke="#FFFFFF" strokeWidth={2.4} strokeLinecap="round" opacity={0.55} />
            {pips > 0 && size >= 56
              ? Array.from({ length: pips }, (_, i) => (
                  <Circle key={i} cx={CENTRE + (i - (pips - 1) / 2) * 7} cy={77} r={2.1} fill={palette.ink} />
                ))
              : null}
          </G>
        ) : (
          <G>
            <Circle cx={CENTRE} cy={CENTRE} r={45} fill={theme.backgroundElement} />
            <Circle cx={CENTRE} cy={CENTRE} r={46} fill="none" stroke={pencil} strokeWidth={1.6} strokeDasharray="2.6 4.2" strokeLinecap="round" opacity={0.7} />
            {inked > 0 ? (
              <Circle
                cx={CENTRE}
                cy={CENTRE}
                r={46}
                fill="none"
                stroke={theme.lagoon}
                strokeWidth={3.4}
                strokeLinecap="round"
                strokeDasharray={`${circumference * inked} ${circumference}`}
                transform={`rotate(-90 ${CENTRE} ${CENTRE})`}
              />
            ) : null}
          </G>
        )}
      </Svg>
      <View style={{ position: 'absolute', left: 0, top: 0, width: size, height: size, alignItems: 'center', justifyContent: 'center', paddingBottom: pips > 0 && badge.earned ? size * 0.05 : 0 }}>
        <EmblemArt
          emblem={badge.emblem}
          area={area}
          size={emblemSize}
          ink={palette.ink}
          pencil={pencil}
          found={badge.earned}
          paper={theme.backgroundElement}
        />
      </View>
    </Animated.View>
  );
}
