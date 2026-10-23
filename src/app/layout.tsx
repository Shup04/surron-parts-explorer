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
    'Interactive motorcycle assembly explorer and local model-mapping workbench. Demonstration geometry; mechanical data awaits verification.',
  // The app is already dark; prevent Dark Reader from changing SVG attributes before hydration.
  other: { 'darkreader-lock': 'true' },
};

export const viewport: Viewport = {
  colorScheme: 'dark',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`} style={theme}>
      <body>{children}</body>
    </html>
  );
}
