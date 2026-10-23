import type { Metadata, Viewport } from 'next';
import type { CSSProperties } from 'react';
import localFont from 'next/font/local';
import tokens from '@/ui/tokens.json';
import './globals.css';
import '@/ui/primitives.css';
import '@/ui/viewer.css';

const geist = localFont({
  src: './fonts/geist-latin.woff2',
  variable: '--font-geist',
  weight: '100 900',
  display: 'swap',
});
const geistMono = localFont({
  src: './fonts/geist-mono-latin.woff2',
  variable: '--font-geist-mono',
  weight: '100 900',
  display: 'swap',
});
const theme = Object.fromEntries(
  Object.entries(tokens.css).map(([name, value]) => [`--${name}`, value]),
) as CSSProperties;

export const metadata: Metadata = {
  title: 'Sur-Ron · Parts Explorer',
  description:
    'Explore Sur-Ron motorcycle assemblies, inspect parts in 3D, and follow the model hierarchy from the whole bike to individual components.',
  applicationName: 'Sur-Ron Parts Explorer',
  appleWebApp: {
    capable: true,
    title: 'Parts Explorer',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: [{ url: '/icons/app.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  // The app is already dark; prevent Dark Reader from changing SVG attributes before hydration.
  other: { 'darkreader-lock': 'true' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
  themeColor: tokens.css.panel,
  colorScheme: 'dark',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`} style={theme}>
      <body>{children}</body>
    </html>
  );
}
