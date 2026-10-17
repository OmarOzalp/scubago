import { StyleSheet, Text, type TextProps } from 'react-native';

import { ThemeColor, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?:
    | 'default'
    | 'title'
    | 'small'
    | 'smallBold'
    | 'subtitle'
    | 'link'
    | 'linkPrimary'
    | 'code'
    /** Fraunces: a screen's title. */
    | 'display'
    /** Fraunces: a section's title. */
    | 'heading'
    /** Fraunces italic: captions and scientific names. */
    | 'caption'
    /** Courier Prime capitals: logbook labels. */
    | 'label'
    /** Fraunces: a figure in a ledger (dives, depth, species). */
    | 'number';
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();

  return (
    <Text
      style={[
        { color: theme[themeColor ?? (type === 'label' ? 'textSecondary' : 'text')] },
        styles[type],
        style,
      ]}
      {...rest}
    />
  );
}

/** The same styles, for places that render their own <Text>. */
export const TextStyles = StyleSheet.create({
  default: {
    fontFamily: Type.body,
    fontSize: 16,
    lineHeight: 24,
  },
  small: {
    fontFamily: Type.body,
    fontSize: 14,
    lineHeight: 20,
  },
  smallBold: {
    fontFamily: Type.bodyBold,
    fontSize: 14,
    lineHeight: 20,
  },
  title: {
    fontFamily: Type.display,
    fontSize: 40,
    lineHeight: 46,
    letterSpacing: -0.4,
  },
  subtitle: {
    fontFamily: Type.display,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.2,
  },
  display: {
    fontFamily: Type.display,
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: -0.3,
  },
  heading: {
    fontFamily: Type.display,
    fontSize: 21,
    lineHeight: 27,
  },
  caption: {
    fontFamily: Type.displayItalic,
    fontSize: 15,
    lineHeight: 21,
  },
  label: {
    fontFamily: Type.label,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  number: {
    fontFamily: Type.display,
    fontSize: 28,
    lineHeight: 32,
  },
  link: {
    fontFamily: Type.bodyBold,
    lineHeight: 30,
    fontSize: 14,
  },
  linkPrimary: {
    fontFamily: Type.bodyBold,
    lineHeight: 30,
    fontSize: 14,
    color: '#0E6F78',
  },
  code: {
    fontFamily: Type.label,
    fontSize: 12,
  },
});

const styles = TextStyles;
