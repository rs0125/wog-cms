'use client';

import type { ServiceContent } from '@/lib/service-schema';
import WebsitePreview from './WebsitePreview';

export default function ServicePreview({ content }: { content: ServiceContent }) {
  return <WebsitePreview content={{ type: 'service', content }} />;
}
