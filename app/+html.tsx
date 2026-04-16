import { ScrollViewStyleReset } from "expo-router/html";
import { type PropsWithChildren } from "react";

/**
 * Root HTML shell for the web build.
 *
 * Expo Router wraps every static-exported page in this component. We use it
 * to inject the PWA manifest, theme metadata, apple-touch icons, and to
 * register the service worker once the page has loaded.
 *
 * Only rendered on web — native builds ignore this file entirely.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, viewport-fit=cover, user-scalable=no"
        />

        <title>Vin</title>
        <meta
          name="description"
          content="Your personal wine cellar tracker and AI sommelier."
        />

        {/* PWA manifest + theming */}
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="theme-color" content="#722F37" />
        <meta name="color-scheme" content="light dark" />

        {/* iOS standalone support */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />
        <meta name="apple-mobile-web-app-title" content="Vin" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />

        {/* Favicons */}
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" type="image/png" href="/icons/icon-192.png" />

        <ScrollViewStyleReset />

        {/* Fill the background to match the splash colour so there is no
            flash of white while the JS bundle is downloading. */}
        <style dangerouslySetInnerHTML={{ __html: backgroundCss }} />

        {/* Register the service worker. Defer so we don't block initial
            render — the SW only enhances subsequent visits. */}
        <script dangerouslySetInnerHTML={{ __html: swRegisterScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

const backgroundCss = `
html, body, #root { background-color: #FDF8F5; }
@media (prefers-color-scheme: dark) {
  html, body, #root { background-color: #1A0A0C; }
}
`;

const swRegisterScript = `
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').catch(function (err) {
      console.warn('SW registration failed:', err);
    });
  });
}
`;
