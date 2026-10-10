'use client';

import type { BlogInput } from '@/lib/blog-schema';
import WebsitePreview from './WebsitePreview';

export default function BlogPreview({ blog }: { blog: BlogInput }) {
  return <WebsitePreview content={{ type: 'blog', content: blog }} />;
}
