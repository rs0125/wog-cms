import type { Metadata } from 'next';
import { Montserrat } from 'next/font/google';
import './globals.css';

// Montserrat only — the same family the public site uses for everything except
// a few display headings. The CMS is a working tool, so it stays on one family
// rather than borrowing the site's serif accent.
const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  variable: '--font-montserrat',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'WareOnGo CMS',
  description: 'Content management for wareongo.com',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={montserrat.variable}>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
