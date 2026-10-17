/**
 * Reef Journal: ScubaGo's look. Warm paper and navy ink, with the reef's colours for what matters
 * (lagoon for actions, coral for logging, sun for anything new, twilight for big moments). The dark
 * scheme is "night dive": navy paper, pale ink and the same colours, lifted for the dark.
 *
 * Contrast (WCAG AA, 4.5:1 for text): every *text* colour below is checked against both `background`
 * and `card` of its scheme. Fills under text say which text colour goes on them.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    // ── Paper and ink ─────────────────────────────────────────────────────────────────────────
    /** Navy ink: body text and line art (13:1 on paper). */
    text: '#1D2B45',
    /** Soft ink: secondary text (5.8:1 on paper). */
    textSecondary: '#5A6070',
    /** The page. */
    background: '#FBF6EC',
    /** Cards, inputs and rows: a lighter sheet laid on the page. */
    backgroundElement: '#FFFDF8',
    /** Pressed and selected paper. */
    backgroundSelected: '#F1E8D6',
    /** Card edges. */
    cardBorder: '#EADFC8',
    /** Hairlines and ledger rules. */
    rule: '#E3D7BF',
    // ── The reef's colours ────────────────────────────────────────────────────────────────────
    /** Links and coloured text (5.3:1 on paper). */
    tint: '#0E6F78',
    /** Filled action buttons; white text on it is 4.9:1. */
    lagoon: '#0E7C86',
    /** Progress and highlights (decorative fill, never text). */
    turquoise: '#2EC4B6',
    /** Log-a-dive and celebration buttons; ink text on it is 5.5:1. */
    coral: '#FF7A59',
    /** New things; ink text on it. */
    sun: '#FFC94A',
    /** Big moments (dark panels); white text on it is 12:1. */
    twilight: '#23306B',
    /** Deep water panels; white text on it is 8.9:1. */
    deep: '#0B4F6C',
    /** Rubber-stamp ink, also used as text (5.4:1 on paper). */
    stamp: '#B8371F',
    /** The watercolour wash behind active icons. */
    wash: '#9FE3DA',
    /** Errors and destructive actions (6.1:1 on paper). */
    danger: '#B42318',
  },
  dark: {
    text: '#EEF3F8',
    textSecondary: '#A9BBCD',
    background: '#0F1B2E',
    backgroundElement: '#16253D',
    backgroundSelected: '#1E3150',
    cardBorder: '#24364F',
    rule: '#2A3D57',
    tint: '#6EE0D4',
    /** Dark text (#0F1B2E) on it is 8:1. */
    lagoon: '#2EC4B6',
    turquoise: '#2EC4B6',
    coral: '#FF8A6B',
    sun: '#FFD166',
    twilight: '#2C3A7A',
    deep: '#123A55',
    stamp: '#FF8A75',
    wash: '#1F6F6A',
    danger: '#FF8A7A',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/** Text that sits on a coloured fill, per scheme. */
export const OnFill = {
  light: { lagoon: '#FFFFFF', coral: '#1D2B45', sun: '#1D2B45', twilight: '#FFFFFF', deep: '#FFFFFF' },
  dark: { lagoon: '#0F1B2E', coral: '#0F1B2E', sun: '#0F1B2E', twilight: '#FFFFFF', deep: '#FFFFFF' },
} as const;

/**
 * The type families (loaded in the root layout). Each weight is its own family, so styles set
 * `fontFamily` and never `fontWeight` (Android would otherwise fall back to a system face).
 */
export const Type = {
  /** Fraunces: titles, big numbers, species names. */
  display: 'Fraunces_600SemiBold',
  displayMedium: 'Fraunces_500Medium',
  displayItalic: 'Fraunces_500Medium_Italic',
  /** Figtree: everything you read. */
  body: 'Figtree_500Medium',
  bodySemiBold: 'Figtree_600SemiBold',
  bodyBold: 'Figtree_700Bold',
  bodyHeavy: 'Figtree_800ExtraBold',
  /** Courier Prime: logbook labels only. */
  label: 'CourierPrime_700Bold',
} as const;

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

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

/** Corner radii: gently rounded, never bubbly. */
export const Radius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 22,
  round: 999,
} as const;

/** Paper lifting off the page. */
export const Shadow = {
  light: {
    card: '0px 1px 0px #EADFC8, 0px 10px 22px -14px rgba(90, 64, 20, 0.35)',
    raised: '0px 1px 0px #EADFC8, 0px 16px 30px -16px rgba(90, 64, 20, 0.45)',
    coral: '0px 0px 0px 1.5px #1D2B45, 0px 8px 18px -8px rgba(210, 69, 43, 0.55)',
  },
  dark: {
    card: '0px 1px 0px #24364F, 0px 10px 22px -14px rgba(0, 0, 0, 0.6)',
    raised: '0px 1px 0px #24364F, 0px 16px 30px -16px rgba(0, 0, 0, 0.7)',
    coral: '0px 0px 0px 1.5px #EEF3F8, 0px 8px 18px -8px rgba(255, 138, 107, 0.35)',
  },
} as const;

/** Height of the custom tab bar (above the home indicator). */
export const TabBarHeight = 64;
/** How far the raised "Log dive" button reaches above the tab bar: tab screens leave this much room. */
export const TabBarOverhang = 24;
export const MaxContentWidth = 720;
