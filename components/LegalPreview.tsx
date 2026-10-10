'use client';

import type { LegalContent } from '@/lib/legal-schema';
import WebsitePreview from './WebsitePreview';

export default function LegalPreview({ content }: { content: LegalContent }) {
  return <WebsitePreview content={{ type: 'legal', content }} />;
}
