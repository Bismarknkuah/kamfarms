import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'KAM-ROMS — KAM Rice Operations Management System',
    short_name: 'KAM-ROMS',
    description: 'Operations system for KAM Trading and Farms Limited — farm to warehouse to mill to market.',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#FBF8F2',
    theme_color: '#132C1A',
    orientation: 'portrait-primary',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
