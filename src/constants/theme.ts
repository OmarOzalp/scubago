/**
 * Tide: ScubaGo's design system (v2, docs/design.md). A cool sea-mist page, white surfaces that lift off it
 * by colour and a soft shadow, navy ink, and the reef's colours only where they mean something: lagoon to
 * act, coral to log a dive, sun for anything new, the rarity colours for rarity. The dark scheme is a
 * night dive: deep navy page, navy surfaces edged by a hairline instead of a shadow, pale ink.
 *
 * Every size on a screen comes from here (TypeScale, Space, Radius, Size, Elevation, Motion); screens never
 * write a literal font size, font family, corner radius, shadow or hex colour (src/__tests__/design-tokens.test.js).
 *
 * Contrast (WCAG AA, 4.5:1 for text), measured with the WCAG formula on each scheme's `background` (page)
 * and `backgroundElement` (surface): the figures are in the comments as page / surface.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    // ── Page, surfaces and ink ────────────────────────────────────────────────────────────────
    /** Navy ink: titles and body text (15.9 / 17.3). */
    text: '#0F1B2E',
    /** Secondary text: subtitles, meta (5.6 / 6.1; 5.2 on backgroundSelected). */
    textSecondary: '#55637A',
    /** Placeholders, chevrons, disabled (2.9 / 3.2): never essential text. */
    textTertiary: '#8792A2',
    /** The page: cool sea mist. */
    background: '#F3F6F8',
    /** Cards, rows, inputs, bars. */
    backgroundElement: '#FFFFFF',
    /** Pressed and selected; sunken fills (search, segmented track, art tiles). */
    backgroundSelected: '#E9EEF2',
    /** A line only where one is needed (inputs, dark-mode cards). */
    cardBorder: '#E3E9EE',
    /** Hairlines between rows. */
    rule: '#E3E9EE',
    // ── The reef's colours ────────────────────────────────────────────────────────────────────
    /** Links, coloured text, selected icons (5.5 / 6.0; 5.1 on lagoonSoft). */
    tint: '#0B6E78',
    /** Primary filled buttons; white text on it is 5.1:1. */
    lagoon: '#0B7A85',
    /** Tinted secondary buttons, icon tiles, soft selections; `tint` text on it is 5.1:1. */
    lagoonSoft: '#E1F1F2',
    /** Progress and highlights (decorative fill, never text). */
    turquoise: '#2EC4B6',
    /** Log-a-dive actions only; ink text on it is 6.3:1. */
    coral: '#FF6F4D',
    coralSoft: '#FFE9E2',
    /** New things; ink text on it is 11.3:1. */
    sun: '#FFC94A',
    /** Notices; ink text on it is 15.8:1. */
    sunSoft: '#FFF4D6',
    /** Big moments (dark panels); white text on it is 12.3:1. */
    twilight: '#23306B',
    /** Deep water panels; white text on it is 8.9:1. */
    deep: '#0B4F6C',
    /** Rubber-stamp ink, also used as text (5.4 / 5.8). */
    stamp: '#B8371F',
    /** The soft colour inside icons and art tiles. */
    wash: '#9FE3DA',
    /** Errors and destructive actions (6.1 / 6.6; 5.8 on dangerSoft). */
    danger: '#B42318',
    dangerSoft: '#FDECEA',
  },
  dark: {
    /** (16.4 / 14.3) */
    text: '#EEF3F8',
    /** (9.3 / 8.1) */
    textSecondary: '#A9BBCD',
    /** (5.7 / 5.0) */
    textTertiary: '#7F92A8',
    background: '#0B1524',
    backgroundElement: '#132238',
    backgroundSelected: '#1B2E49',
    cardBorder: '#22344D',
    rule: '#22344D',
    /** (11.6 / 10.1; 7.5 on lagoonSoft) */
    tint: '#6EE0D4',
    /** Navy text (#0B1524) on it is 8.5:1. */
    lagoon: '#2EC4B6',
    lagoonSoft: '#153C46',
    turquoise: '#2EC4B6',
    /** Navy text on it is 7.9:1. */
    coral: '#FF8A6B',
    coralSoft: '#47261F',
    /** Navy text on it is 12.7:1. */
    sun: '#FFD166',
    /** Pale ink on it is 10.5:1. */
    sunSoft: '#42371A',
    /** White text on it is 10.5:1. */
    twilight: '#2C3A7A',
    /** White text on it is 11.9:1. */
    deep: '#123A55',
    /** (8.0 / 7.0) */
    stamp: '#FF8A75',
    wash: '#1F6F6A',
    /** (8.0 / 7.0; 6.5 on dangerSoft) */
    danger: '#FF8A7A',
    dangerSoft: '#3D1F1F',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;
export type Scheme = 'light' | 'dark';

/** Text that sits on a coloured fill, per scheme. */
export const OnFill = {
  light: { lagoon: '#FFFFFF', coral: '#0F1B2E', sun: '#0F1B2E', twilight: '#FFFFFF', deep: '#FFFFFF', ink: '#FFFFFF' },
  dark: { lagoon: '#0B1524', coral: '#0B1524', sun: '#0B1524', twilight: '#FFFFFF', deep: '#FFFFFF', ink: '#0B1524' },
} as const;

/**
 * The type families (loaded in the root layout). Each weight is its own family, so styles set
 * `fontFamily` and never `fontWeight` (Android would otherwise fall back to a system face).
 */
export const Type = {
  /** Fraunces: titles where the app speaks (screen titles, a detail page's name, big figures). */
  display: 'Fraunces_600SemiBold',
  displayMedium: 'Fraunces_500Medium',
  /** Scientific names only. */
  displayItalic: 'Fraunces_500Medium_Italic',
  /** Figtree: everything you tap or read. */
  body: 'Figtree_500Medium',
  bodySemiBold: 'Figtree_600SemiBold',
  bodyBold: 'Figtree_700Bold',
  bodyHeavy: 'Figtree_800ExtraBold',
  /** Courier Prime: passport stamps and the logbook's "No." only. */
  label: 'CourierPrime_700Bold',
} as const;

type TextToken = { fontFamily: string; fontSize: number; lineHeight: number; letterSpacing: number };
const t = (fontFamily: string, fontSize: number, lineHeight: number, letterSpacing = 0): TextToken => ({ fontFamily, fontSize, lineHeight, letterSpacing });

/**
 * The type scale: ten styles, nothing under 13. Serif for titles and figures, Figtree for the rest.
 * `hero` is `display` at 1.4x, for reward and celebration screens only.
 */
export const TypeScale = {
  hero: t(Type.display, 42, 48, -0.4),
  /** A tab screen's title; the title of a pushed page. */
  display: t(Type.display, 30, 36, -0.3),
  /** The name on a detail hero, sheet titles, reward moments. */
  title: t(Type.display, 22, 28, -0.2),
  /** Big numbers (stats). */
  figure: t(Type.display, 28, 32, -0.2),
  /** Section headers, bar titles, card titles. */
  headline: t(Type.bodyBold, 17, 22),
  /** Reading text. */
  body: t(Type.body, 16, 22),
  /** Row titles (600); button labels use `button` (700). */
  bodyStrong: t(Type.bodySemiBold, 16, 22),
  button: t(Type.bodyBold, 16, 22),
  /** Secondary reading text in cards. */
  callout: t(Type.body, 15, 20),
  /** Scientific names: italic Fraunces at callout size. */
  scientific: t(Type.displayItalic, 15, 20),
  /** Row subtitles, helper text. */
  subhead: t(Type.body, 14, 19),
  /** Segmented labels, species names on cards: footnoteStrong at 14. */
  subheadStrong: t(Type.bodySemiBold, 14, 18, 0.1),
  /** Meta, captions, counts. */
  footnote: t(Type.body, 13, 18),
  /** Chips, tags, tab labels, field labels. */
  footnoteStrong: t(Type.bodySemiBold, 13, 18, 0.1),
} as const;
export type TypeName = keyof typeof TypeScale;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

/**
 * The 4-pt grid. Screen gutter s4 (16); between sections s8 (32); a section header sits s3 (12) above its
 * content; between sibling cards s3; card padding s4; row vertical padding s3.
 */
export const Space = {
  s1: 4,
  s2: 8,
  s3: 12,
  s4: 16,
  s5: 20,
  s6: 24,
  s8: 32,
  s12: 48,
} as const;

/** The old spacing names (unmigrated code): kept compiling, on the same grid. */
export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

/**
 * Corner radii. sm: tags, thumbnails, icon tiles. md: buttons, inputs, small cards. lg: cards and grouped
 * lists. xl: hero panels, sheets. pill: chips. (`xs` and `round` are the old names, mapped onto these.)
 */
export const Radius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
  /** Old name: now `sm`. */
  xs: 10,
  /** Old name: now `pill`. */
  round: 999,
} as const;

/** Control heights and hit targets. */
export const Size = {
  /** The least a finger is asked to hit. */
  hit: 44,
  buttonLg: 52,
  buttonMd: 44,
  input: 52,
  chip: 36,
  rowMin: 56,
  /** An icon button's visible circle (its hit area is `hit`). */
  iconButton: 40,
  /** An icon tile at the start of a row. */
  iconTile: 40,
  /** A thumbnail at the start of a row. */
  thumb: 44,
  /** Icons in rows and buttons; in the tab bar and headers. */
  icon: 22,
  iconBar: 24,
  segmented: 40,
  tag: 24,
  progress: 6,
  tabBarLog: 56,
} as const;

/**
 * Surfaces off the page. Light: a card has a soft shadow and no border; `raised` is for what floats (the
 * Log button, sheets, floating buttons). Dark: a card has no shadow (a 1px `cardBorder` instead); raised
 * keeps a black shadow.
 */
export const Elevation: Record<Scheme, { card: string | undefined; raised: string; cardBorder: boolean }> = {
  light: {
    card: '0px 1px 2px rgba(15, 27, 46, 0.05), 0px 6px 16px -6px rgba(15, 27, 46, 0.10)',
    raised: '0px 2px 4px rgba(15, 27, 46, 0.08), 0px 12px 28px -8px rgba(15, 27, 46, 0.22)',
    cardBorder: false,
  },
  dark: {
    card: undefined,
    raised: '0px 2px 4px rgba(0, 0, 0, 0.35), 0px 12px 28px -8px rgba(0, 0, 0, 0.6)',
    cardBorder: true,
  },
};

/** The old shadow names (unmigrated code), mapped onto Elevation: no more dark outline round the coral button. */
export const Shadow = {
  light: { card: Elevation.light.card as string, raised: Elevation.light.raised, coral: Elevation.light.raised },
  dark: { card: '0px 0px 0px 1px #22344D', raised: Elevation.dark.raised, coral: Elevation.dark.raised },
} as const;

/** Calm motion: nothing bounces. Durations in ms; `easing` is cubic-bezier(.2,.8,.2,1). */
export const Motion = {
  press: 120,
  standard: 200,
  easing: [0.2, 0.8, 0.2, 1] as const,
  /** Press feedback for cards and buttons (rows darken to backgroundSelected instead). */
  pressScale: 0.98,
} as const;

/**
 * Over the island scene's own water (the same in both schemes, src/components/home/three): dark green ink,
 * and the pale veil a one-time tip sits on.
 */
export const OnWater = {
  ink: '#1F4B40',
  veil: 'rgba(255, 255, 255, 0.72)',
} as const;

/** Height of the custom tab bar (above the home indicator). */
export const TabBarHeight = 64;
/** How far the raised "Log dive" button reaches above the tab bar: tab screens leave this much room. */
export const TabBarOverhang = 24;
export const MaxContentWidth = 720;
