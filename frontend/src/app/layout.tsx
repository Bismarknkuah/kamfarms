import type { Metadata, Viewport } from 'next';
import { Fraunces, Inter } from 'next/font/google';
import './globals.css';
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister';

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  weight: ['400', '500', '600'],
  style: ['normal', 'italic'],
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'KAM-ROMS — KAM Rice Operations Management System',
  description:
    'The operations backbone for KAM Trading and Farms Limited — from paddy field to Pectra Rice on the shelf.',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'KAM-ROMS',
  },
  icons: {
    // Explicit and comprehensive on purpose, not left to Next.js's
    // file-convention auto-detection (app/icon.svg) alone — SVG-only
    // favicons have real, inconsistent browser support (Safari
    // especially), so a PNG fallback is listed first for broad
    // compatibility, with the SVG offered as a sharper alternative for
    // browsers that support it.
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    shortcut: '/icons/icon-192.png',
    apple: '/icons/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#132C1A',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable}`}>
      <body className="bg-rice-50 font-sans text-ink-900 antialiased">
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
