'use client';

import { useState } from 'react';
import type { BlogInput } from '@/lib/blog-schema';
import { previewBlogIndex, type BlogIndexEntry } from '@/lib/blog-index';
import WebsitePreview from './WebsitePreview';

export default function BlogPreview({ blog, indexEntries = [], id }: { blog: BlogInput; indexEntries?: BlogIndexEntry[]; id?: number }) {
  const [view, setView] = useState('page');
  return <>
    {view === 'index' && <p className="cms-hint mb-3">Your current card and sort position alongside listed CMS blogs. Only listed blogs appear on the public index after deployment.</p>}
    <WebsitePreview content={{ type: 'blog', content: view === 'index' ? { ...blog, blocks: [], faqs: [] } : blog, ...(view === 'index' ? { indexEntries: previewBlogIndex(blog, indexEntries, id) } : {}) }} view={view} controls={
      <label className="flex items-center gap-2 text-sm text-wareongo-slate">Preview view
        <select aria-label="Preview view" className="cms-input w-auto" value={view} onInput={event => event.stopPropagation()} onChange={event => setView(event.target.value)}>
          <option value="page">Article</option><option value="index">Blog index</option>
        </select>
      </label>
    } />
  </>;
}
