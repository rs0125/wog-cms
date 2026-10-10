'use client';

import type { AdPageContent } from '@/lib/ad-page-schema';
import WebsitePreview from './WebsitePreview';

export default function AdPagePreview({ content, url }: { content: AdPageContent; url: string }) {
  return <WebsitePreview content={content} url={url} message="wareongo:ad-page-preview" title="Bangalore website preview" />;
}
