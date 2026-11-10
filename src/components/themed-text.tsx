import { StyleSheet, Text, type TextProps } from 'react-native';

import { ThemeColor, Type, TypeScale, type TypeName } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * The old type names, kept so unmigrated screens compile, each drawn as a style of the v2 scale
 * (docs/design.md): `small` is subhead, `heading` is headline, `caption` is callout (no italic: that is
 * for scientific names, `scientific`), `label` is footnoteStrong in the secondary colour, `number` is figure.
 */
type OldName = 'default' | 'small' | 'smallBold' | 'subtitle' | 'link' | 'linkPrimary' | 'code' | 'heading' | 'caption' | 'label' | 'number';

export type ThemedTextProps = TextProps & {
  type?: TypeName | OldName;
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'body', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();
  const quiet = type === 'label';
  return <Text style={[{ color: theme[themeColor ?? (quiet ? 'textSecondary' : type === 'linkPrimary' ? 'tint' : 'text')] }, styles[type], style]} {...rest} />;
}

/** The same styles, for places that render their own <Text>: the v2 scale, then the old names mapped onto it. */
export const TextStyles = StyleSheet.create({
  ...TypeScale,
  default: TypeScale.body,
  small: TypeScale.subhead,
  smallBold: TypeScale.subheadStrong,
  subtitle: TypeScale.title,
  heading: TypeScale.headline,
  caption: TypeScale.callout,
  label: TypeScale.footnoteStrong,
  number: TypeScale.figure,
  link: TypeScale.subheadStrong,
  linkPrimary: TypeScale.subheadStrong,
  code: { ...TypeScale.footnote, fontFamily: Type.label },
});

const styles = TextStyles;
