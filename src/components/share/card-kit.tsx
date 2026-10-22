/**
 * The pieces every share card is built from: the page (paper, watercolour, a double-ruled border),
 * the "ScubaGo" wordmark and footer line, and the typewriter, serif and sans type, set for a
 * 1080×1350 picture.
 *
 * A card is a picture, not a screen: it uses its own fixed colours (never `useTheme()`), so it comes
 * out the same whether the phone is in light or dark mode, and its text ignores the phone's font
 * size setting (`allowFontScaling={false}`), so the layout is the one that was designed.
 */
import { createContext, useContext, useId, useMemo, type ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextProps, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { Wash } from '@/components/journal/wash';
import { mix } from '@/lib/art-color';
import { Colors, Type } from '@/constants/theme';
import { PAPER as PLATE_PAPER } from '@/lib/plates';
import { RARITY_COLOR, RARITY_LABEL, RARITY_ORDER, RARITY_TEXT } from '@/lib/rarity';
import type { Rarity } from '@/lib/types';
import { seededRandom } from '@/lib/wash';

import { CARD_SIZE } from './card-spec';

const L = Colors.light;

/** The card's fixed colours: Reef Journal's paper scheme, whatever the phone is set to. */
export const CARD_COLORS = {
  paper: L.background,
  sheet: L.backgroundElement,
  sand: '#FFF3D1',
  sandEdge: '#EED9AE',
  ink: L.text,
  soft: L.textSecondary,
  rule: L.rule,
  ruleFaint: '#EFE6D2',
  lagoon: L.lagoon,
  tint: L.tint,
  turquoise: L.turquoise,
  coral: L.coral,
  sun: L.sun,
  stamp: L.stamp,
  wash: L.wash,
  twilight: L.twilight,
  /** The paper the species plates are tinted against. */
  plate: PLATE_PAPER,
} as const;

export type CardTone = 'paper' | 'twilight';

export interface CardPalette {
  tone: CardTone;
  page: string;
  ink: string;
  soft: string;
  rule: string;
  /** The double-ruled border. */
  frame: string;
  /** Rarity lettering (checked against this page). */
  rarityText: 'light' | 'dark';
}

export const PALETTES: Record<CardTone, CardPalette> = {
  paper: { tone: 'paper', page: CARD_COLORS.paper, ink: CARD_COLORS.ink, soft: CARD_COLORS.soft, rule: CARD_COLORS.rule, frame: CARD_COLORS.ink, rarityText: 'light' },
  // The new-species moment: the twilight page, with cream ink and a sun-yellow border.
  twilight: { tone: 'twilight', page: '#1C2559', ink: '#FBF6EC', soft: '#C7D0EE', rule: 'rgba(251, 246, 236, 0.22)', frame: CARD_COLORS.sun, rarityText: 'dark' },
};

const PaletteContext = createContext<CardPalette>(PALETTES.paper);
export const useCardPalette = () => useContext(PaletteContext);

/** Text styles at card size. 28 px is the smallest lettering: about 10 pt when the card shows at phone width. */
export const CARD_TEXT = StyleSheet.create({
  label: { fontFamily: Type.label, fontSize: 28, lineHeight: 34, letterSpacing: 3.4, textTransform: 'uppercase' },
  body: { fontFamily: Type.bodySemiBold, fontSize: 38, lineHeight: 48 },
  bodyBold: { fontFamily: Type.bodyBold, fontSize: 38, lineHeight: 48 },
  small: { fontFamily: Type.bodySemiBold, fontSize: 32, lineHeight: 40 },
  italic: { fontFamily: Type.displayItalic, fontSize: 46, lineHeight: 58 },
  title: { fontFamily: Type.display, fontSize: 96, lineHeight: 104, letterSpacing: -1 },
  figure: { fontFamily: Type.display, fontSize: 92, lineHeight: 100 },
});

type Kind = keyof typeof CARD_TEXT;

/** A line of card text. `tone="soft"` is the quieter ink; the lettering never scales with the phone's text size. */
export function CardText({ kind, tone = 'ink', style, ...rest }: TextProps & { kind: Kind; tone?: 'ink' | 'soft' }) {
  const palette = useCardPalette();
  return <Text allowFontScaling={false} {...rest} style={[CARD_TEXT[kind], { color: tone === 'soft' ? palette.soft : palette.ink }, style]} />;
}

/**
 * How to set a name in Fraunces across the card: as large as fits on one line (to 120), or, for a
 * long name, on two lines at up to 80. The sizes assume characters a little wider than they are, so
 * the layout never depends on the font being as narrow as it usually is.
 */
/** Em per character, with room to spare: Fraunces SemiBold, mixed case, wide letters (m, w, H) included. */
const CHAR = 0.57;

export function nameLayout(name: string, max = 120): { size: number; lines: 1 | 2; lineHeight: number } {
  const room = CARD_SIZE.width - 2 * 96;
  const one = Math.floor(room / (CHAR * Math.max(1, name.length)));
  if (one >= 72) return { size: Math.min(max, one), lines: 1, lineHeight: Math.round(Math.min(max, one) * 1.06) };
  const size = Math.max(56, Math.min(80, Math.floor(room / (CHAR * Math.ceil(name.length / 1.8)))));
  return { size, lines: 2, lineHeight: Math.round(size * 1.06) };
}

// ── The ScubaGo mark: the app icon's manta on its sea ────────────────────────────────────────────
const MANTA =
  'M512 360.1C528.6 358.2 543.3 330.6 549.7 295.7 561.7 308.6 570.9 328.8 574.6 350.9 655.5 363.8 777 455.8 859.8 591.9 777 579 679.4 593.8 604 636.1 580.1 650.8 552.5 678.4 532.2 700.5 526.7 707.8 521.2 711.5 518.4 715.2 516.6 777.8 514.8 833 513.4 888.2L510.6 888.2C509.2 833 507.4 777.8 505.6 715.2 502.8 711.5 497.3 707.8 491.8 700.5 471.5 678.4 443.9 650.8 420 636.1 344.6 593.8 247 579 164.2 591.9 247 455.8 368.5 363.8 449.4 350.9 453.1 328.8 462.3 308.6 474.3 295.7 480.7 330.6 495.4 358.2 512 360.1Z';

export function ScubaGoMark({ size }: { size: number }) {
  const id = `mk${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024">
      <Defs>
        <LinearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#2CC8DA" />
          <Stop offset="0.55" stopColor="#0891B2" />
          <Stop offset="1" stopColor="#0A4A78" />
        </LinearGradient>
      </Defs>
      <Rect width={1024} height={1024} rx={236} fill={`url(#${id}s)`} />
      <Path d={MANTA} fill="#FFFFFF" />
      <Circle cx={706} cy={250} r={26} fill="#FFFFFF" opacity={0.85} />
      <Circle cx={744} cy={190} r={16} fill="#FFFFFF" opacity={0.85} />
      <Circle cx={688} cy={158} r={11} fill="#FFFFFF" opacity={0.85} />
    </Svg>
  );
}

/** "ScubaGo", set in Fraunces beside the mark. */
export function Wordmark() {
  const palette = useCardPalette();
  return (
    <View style={styles.wordmark} accessibilityLabel="ScubaGo">
      <ScubaGoMark size={64} />
      <Text allowFontScaling={false} style={[styles.wordmarkText, { color: palette.ink }]}>
        ScubaGo
      </Text>
    </View>
  );
}

/** Dots of watercolour-paper starlight for the twilight page (the same every time). */
function Stars() {
  const stars = useMemo(() => {
    const rand = seededRandom(23);
    return Array.from({ length: 46 }, () => ({ x: rand() * CARD_SIZE.width, y: rand() * CARD_SIZE.height, r: 1.4 + rand() * 3.2, o: 0.25 + rand() * 0.55 }));
  }, []);
  return (
    <Svg width={CARD_SIZE.width} height={CARD_SIZE.height} style={StyleSheet.absoluteFill}>
      {stars.map((s, i) => (
        <Circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#FBF6EC" opacity={s.o} />
      ))}
    </Svg>
  );
}

function Backdrop({ tone }: { tone: CardTone }) {
  const id = `bd${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  if (tone === 'twilight') {
    return (
      <View aria-hidden style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
        <Svg width={CARD_SIZE.width} height={CARD_SIZE.height}>
          <Defs>
            <LinearGradient id={`${id}g`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#2E3C86" />
              <Stop offset="0.55" stopColor="#1C2559" />
              <Stop offset="1" stopColor="#121842" />
            </LinearGradient>
            <RadialGradient id={`${id}r`} cx="0.5" cy="0.36" rx="0.7" ry="0.5">
              <Stop offset="0" stopColor="#6F82E0" stopOpacity="0.42" />
              <Stop offset="1" stopColor="#6F82E0" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Rect width={CARD_SIZE.width} height={CARD_SIZE.height} fill={`url(#${id}g)`} />
          <Rect width={CARD_SIZE.width} height={CARD_SIZE.height} fill={`url(#${id}r)`} />
        </Svg>
        <Stars />
      </View>
    );
  }
  return (
    <View aria-hidden style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
      <Wash width={760} height={520} color={CARD_COLORS.wash} seed={11} opacity={0.62} style={{ position: 'absolute', right: -190, top: -150 }} />
      <Wash width={640} height={440} color={CARD_COLORS.sun} seed={5} opacity={0.3} style={{ position: 'absolute', left: -220, bottom: -140 }} />
      <Wash width={420} height={320} color={CARD_COLORS.coral} seed={17} opacity={0.12} style={{ position: 'absolute', left: -150, top: 420 }} />
    </View>
  );
}

export const FOOTER_LINE = 'Log your dives. Grow your own archipelago.';

/**
 * The card's page, 1080×1350: paper and watercolour, a double-ruled border, the wordmark and an
 * eyebrow at the head, a footer line at the foot, and `children` between.
 */
export function CardCanvas({ tone = 'paper', eyebrow, children, gap = 0, style }: { tone?: CardTone; eyebrow: string; children: ReactNode; /** Space between the blocks of the body. */ gap?: number; style?: StyleProp<ViewStyle> }) {
  const palette = PALETTES[tone];
  return (
    <PaletteContext.Provider value={palette}>
      <View style={[styles.canvas, { backgroundColor: palette.page }, style]}>
        <Backdrop tone={tone} />
        <View aria-hidden style={[styles.frameOuter, { borderColor: palette.frame, pointerEvents: 'none' }]} />
        <View aria-hidden style={[styles.frameInner, { borderColor: palette.frame, pointerEvents: 'none' }]} />
        <View style={styles.page}>
          <View style={styles.header}>
            <Wordmark />
            <CardText kind="label" tone="soft" numberOfLines={1} style={styles.eyebrow}>
              {eyebrow}
            </CardText>
          </View>
          <View style={[styles.rule, { backgroundColor: palette.rule }]} />
          <View style={[styles.body, { gap }]}>{children}</View>
          <View style={[styles.rule, { backgroundColor: palette.rule }]} />
          <Text allowFontScaling={false} style={[styles.footer, { color: palette.soft }]}>
            {FOOTER_LINE}
          </Text>
        </View>
      </View>
    </PaletteContext.Provider>
  );
}

/** The page's measures, so a card can size its blocks to the room the canvas leaves them. */
const PAGE = { padX: 96, padY: 62, gap: 18, header: 60, footer: 38, rule: 2 } as const;
/** The room between the header's rule and the footer's, in a canvas. */
export const BODY_SIZE = {
  width: CARD_SIZE.width - 2 * PAGE.padX,
  height: CARD_SIZE.height - 2 * PAGE.padY - PAGE.header - PAGE.footer - 2 * PAGE.rule - 4 * PAGE.gap,
} as const;

/** A tier's five pips: filled up to the tier. */
export function RarityPips({ rarity, size = 22, color }: { rarity: Rarity; size?: number; color?: string }) {
  const rank = RARITY_ORDER.indexOf(rarity);
  const fill = color ?? RARITY_COLOR[rarity];
  return (
    <View style={{ flexDirection: 'row', gap: size * 0.4 }} aria-hidden>
      {RARITY_ORDER.map((tier, i) => (
        <View key={tier} style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 2.5, borderColor: fill, backgroundColor: i <= rank ? fill : 'transparent' }} />
      ))}
    </View>
  );
}

/** The rarity as a tier label in the tier's colour, with its pips. */
export function TierLabel({ rarity, size = 'large', style }: { rarity: Rarity; size?: 'large' | 'small'; style?: StyleProp<ViewStyle> }) {
  const palette = useCardPalette();
  const edge = RARITY_COLOR[rarity];
  const text = RARITY_TEXT[palette.rarityText][rarity];
  const large = size === 'large';
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          alignSelf: 'center',
          gap: large ? 18 : 10,
          borderRadius: large ? 16 : 12,
          borderWidth: large ? 3 : 2.5,
          borderColor: edge,
          backgroundColor: palette.tone === 'twilight' ? '#151B49' : mix(palette.page, edge, 0.2),
          paddingHorizontal: large ? 28 : 16,
          paddingVertical: large ? 8 : 4,
        },
        style,
      ]}>
      {large ? <RarityPips rarity={rarity} /> : null}
      <Text allowFontScaling={false} style={{ fontFamily: Type.bodyHeavy, fontSize: large ? 36 : 28, lineHeight: large ? 46 : 36, letterSpacing: large ? 4.5 : 3, color: text, textTransform: 'uppercase' }}>
        {RARITY_LABEL[rarity]}
      </Text>
    </View>
  );
}

/**
 * A framed print: a band of the rarity colour round an ink line round the paper the plate is drawn
 * on. Children sit on a pale `wash` of the species' own colour.
 */
export function PlateMount({ rarity, wash, washSeed = 3, width, height, radius = 30, band = 12, children, style }: {
  rarity: Rarity;
  wash?: string;
  washSeed?: number;
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  band?: number;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const palette = useCardPalette();
  const w = typeof width === 'number' ? width : undefined;
  const h = height;
  const inner = Math.max(0, radius - band);
  return (
    <View style={[{ width, height, borderRadius: radius, borderWidth: 2.5, borderColor: palette.tone === 'twilight' ? CARD_COLORS.paper : CARD_COLORS.ink, backgroundColor: RARITY_COLOR[rarity], padding: band }, style]}>
      <View style={{ flex: 1, borderRadius: inner, borderWidth: 2, borderColor: CARD_COLORS.ink, backgroundColor: CARD_COLORS.sheet, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
        {wash && w && h ? (
          <Wash
            width={w - 2 * band - 40}
            height={h - 2 * band - 40}
            color={wash}
            seed={washSeed}
            opacity={0.5}
            style={{ position: 'absolute', left: 16, top: 16 }}
          />
        ) : null}
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: { width: CARD_SIZE.width, height: CARD_SIZE.height, overflow: 'hidden' },
  frameOuter: { position: 'absolute', left: 30, top: 30, right: 30, bottom: 30, borderWidth: 3, borderRadius: 32 },
  frameInner: { position: 'absolute', left: 46, top: 46, right: 46, bottom: 46, borderWidth: 1.5, borderRadius: 20, opacity: 0.7 },
  page: { flex: 1, paddingHorizontal: PAGE.padX, paddingVertical: PAGE.padY, gap: PAGE.gap },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: PAGE.header },
  eyebrow: { flexShrink: 1, textAlign: 'right', marginLeft: 24 },
  rule: { height: PAGE.rule },
  body: { flex: 1 },
  footer: { fontFamily: Type.displayItalic, fontSize: 34, lineHeight: 40, textAlign: 'center', height: PAGE.footer },
  wordmark: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  wordmarkText: { fontFamily: Type.display, fontSize: 52, lineHeight: 62, letterSpacing: -0.6 },
});

