import type { Metadata } from 'next';
import { Instrument_Serif, Montserrat } from 'next/font/google';
import './globals.css';

// Same two families the public site loads, so preview type matches the real
// pages rather than merely approximating them. Self-hosted by next/font, so
// there's no render-blocking request to Google.
const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  variable: '--font-montserrat',
  display: 'swap',
});

const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-instrument-serif',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'WareOnGo CMS',
  description: 'Content management for wareongo.com',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${montserrat.variable} ${instrumentSerif.variable}`}>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
