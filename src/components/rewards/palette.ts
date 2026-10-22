import type { Colors } from '@/constants/theme';
import type { BadgeResult } from '@/lib/rewards';

type Theme = (typeof Colors)['light'] | (typeof Colors)['dark'];

/** Mix two #rrggbb colours: `t` of `b` in `a`. */
export function mix(a: string, b: string, t: number): string {
  const n = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const c = [0, 1, 2].map((i) => Math.round(n(a, i) * (1 - t) + n(b, i) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Tier rims in tones that sit with the paper palette: bronze is a baked clay, silver a cool slate,
 * gold the sun's yellow. Never the only cue: a tier is also written in the label and as pips.
 */
const TIERS = {
  light: { bronze: '#B87145', silver: '#8EA1B3', gold: '#E2A92B' },
  dark: { bronze: '#C98558', silver: '#AEBFCE', gold: '#F2C14E' },
} as const;

export interface MedalPalette {
  /** The scalloped rim. */
  rim: string;
  /** The bevel just inside the rim. */
  bevel: string;
  /** The face the emblem sits on. */
  face: string;
  /** The ribbon tails. */
  ribbon: string;
  /** Lines and the shadow. */
  ink: string;
  shadow: string;
}

/**
 * The colours of a badge's medal: its tier's metal, else a colour for its kind (coral for a first,
 * lagoon for a place, twilight for a collection), else its habitat's colour.
 */
export function medalPalette(badge: Pick<BadgeResult, 'tier' | 'kind'>, theme: Theme, scheme: 'light' | 'dark', areaColor?: string): MedalPalette {
  const rim =
    areaColor ??
    (badge.tier
      ? TIERS[scheme][badge.tier]
      : badge.kind === 'first'
        ? theme.coral
        : badge.kind === 'place'
          ? theme.lagoon
          : badge.kind === 'collection'
            ? (scheme === 'light' ? theme.twilight : '#6B7BD6')
            : theme.lagoon);
  const paper = theme.backgroundElement;
  return {
    rim,
    bevel: mix(rim, '#FFFFFF', scheme === 'light' ? 0.45 : 0.3),
    face: mix(paper, rim, scheme === 'light' ? 0.16 : 0.22),
    ribbon: mix(rim, scheme === 'light' ? '#1D2B45' : '#0F1B2E', 0.28),
    ink: theme.text,
    shadow: scheme === 'light' ? 'rgba(80, 52, 12, 0.22)' : 'rgba(0, 0, 0, 0.45)',
  };
}
