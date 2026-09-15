import type { Metadata, Viewport } from 'next';
import { Cormorant_Garamond, DM_Sans } from 'next/font/google';
import './globals.css';
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister';
import { CallProvider } from '@/lib/call-context';

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  variable: '--font-cormorant',
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
  display: 'swap',
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  weight: ['400', '500', '600'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'KAM-ROMS - KAM Rice Operations Management System',
  description:
    'The operations backbone for KAM Trading and Farms Limited - from paddy field to Pectra Rice on the shelf.',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'KAM-ROMS',
  },
  icons: {
    // Explicit and comprehensive on purpose, not left to Next.js's
    // file-convention auto-detection (app/icon.svg) alone - SVG-only
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
    <html lang="en" className={`${cormorant.variable} ${dmSans.variable}`}>
      <body className="bg-rice-50 font-sans text-ink-900 antialiased">
        <ServiceWorkerRegister />
        <CallProvider>{children}</CallProvider>
      </body>
    </html>
  );
}
