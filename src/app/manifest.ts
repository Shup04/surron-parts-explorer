import type { MetadataRoute } from 'next';
import tokens from '@/ui/tokens.json';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Sur-Ron Parts Explorer',
    short_name: 'Parts Explorer',
    description: 'Explore Sur-Ron motorcycle assemblies and inspect individual parts in 3D.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: tokens.css.bg,
    theme_color: tokens.css.panel,
    lang: 'en',
    icons: [
      { src: '/icons/app-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/app-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/app-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
