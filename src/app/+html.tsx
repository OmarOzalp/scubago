import { ScrollViewStyleReset, useServerDocumentContext } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

import { PageColor } from '@/constants/page-color';

// The HTML shell for the web build (`npx expo export --platform web`). Besides
// Expo's defaults it adds what a phone needs to install ScubaGo from the
// browser as a home-screen web app: a full-screen launch, the app icon, and
// `viewport-fit=cover` so the tab bar clears the iPhone home indicator. The
// icons and manifest live in `public/`. See docs/ios-distribution.md.
//
// The app's scripts and styles come in through `headNodes` and `bodyNodes`: a
// page without them is the pre-rendered HTML alone, which never starts.

export default function Root({ children }: PropsWithChildren) {
  const { htmlAttributes, bodyAttributes, headNodes, bodyNodes } = useServerDocumentContext();
  return (
    <html lang="en" {...htmlAttributes}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />

        <meta name="application-name" content="ScubaGo" />
        <meta name="apple-mobile-web-app-title" content="ScubaGo" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="theme-color" media="(prefers-color-scheme: light)" content={PageColor.light} />
        <meta name="theme-color" media="(prefers-color-scheme: dark)" content={PageColor.dark} />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/manifest.webmanifest" />

        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: responsiveBackground }} />
        {headNodes}
      </head>
      <body {...bodyAttributes}>
        {children}
        {bodyNodes}
      </body>
    </html>
  );
}

const responsiveBackground = `
body { background-color: ${PageColor.light}; }
@media (prefers-color-scheme: dark) { body { background-color: ${PageColor.dark}; } }`;
