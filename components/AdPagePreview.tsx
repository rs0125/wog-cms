'use client';

import { useState } from 'react';
import type { AdPageContent } from '@/lib/ad-page-schema';
import WebsitePreview from './WebsitePreview';

export default function AdPagePreview({ content, url }: { content: AdPageContent; url: string }) {
  const [view, setView] = useState('page');
  return <WebsitePreview content={content} url={url} message="wareongo:ad-page-preview" title="Bangalore website preview" view={view} controls={
    <label className="flex items-center gap-2 text-sm text-wareongo-slate">Preview state
      <select aria-label="Preview state" className="cms-input w-auto" value={view} onInput={event => event.stopPropagation()} onChange={event => setView(event.target.value)}>
        <option value="page">Page</option>
        <option value="hero-success">Hero thank-you</option>
        <option value="contact">Contact dialog</option>
        <option value="contact-success">Contact thank-you</option>
      </select>
    </label>
  } />;
}
