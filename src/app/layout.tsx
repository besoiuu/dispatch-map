import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Dispatch Map',
  description: 'Interactive postal code map for route planning across Europe',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Dispatch Map',
  },
  icons: {
    icon: [
      { url: '/favicon.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: '/icons/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Pinch-zoom stays available. It was pinned at 1 with `userScalable: false`,
  // which blocks magnifying the sidebar - the map has its own zoom, the text
  // next to it had none. The 16px inputs below are what actually prevents the
  // iOS focus-zoom that locking the scale was reaching for.
  maximumScale: 5,
  userScalable: true,
  viewportFit: 'cover',
  themeColor: '#2563eb',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full`}>
      <head>
        <link rel="preconnect" href="https://basemaps.cartocdn.com" />
        <link rel="preconnect" href="https://router.project-osrm.org" />
        <link rel="preconnect" href="https://nominatim.openstreetmap.org" />
      </head>
      <body className="h-full overflow-hidden font-sans touch-manipulation">{children}</body>
    </html>
  );
}
