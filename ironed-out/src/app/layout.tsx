import type { Metadata, Viewport } from 'next';
import { Caveat, Patrick_Hand } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';

// next/font downloads these at build time and serves them from our own origin.
const display = Caveat({ subsets: ['latin'], weight: ['700'], variable: '--font-display', display: 'swap' });
const body = Patrick_Hand({ subsets: ['latin'], weight: ['400'], variable: '--font-body', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Ironed Out', template: '%s · Ironed Out' },
  description: 'Book the tee time. Drop one link in the group chat. Let the foursome sort itself out.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#FBF6E9',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
