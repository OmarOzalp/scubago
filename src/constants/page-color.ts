/**
 * The page colour in each scheme, on its own so the web's HTML shell (src/app/+html.tsx, which runs in Node and
 * cannot load the theme's React Native imports) paints the same colour before the app starts. `Colors.background`
 * is this.
 */
export const PageColor = { light: '#F3F6F8', dark: '#0B1524' } as const;
