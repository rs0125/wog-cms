'use client';

import { useState } from 'react';
import DeviceFrame from './DeviceFrame';
import { PreviewNavbar, PreviewFooter } from './PreviewChrome';

/** Public breakpoints resolve inside the iframe, independently of the editor. */
export default function PagePreview({ children }: { children: React.ReactNode }) {
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const width = device === 'mobile' ? 390 : 1440;
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Preview device">
      {(['desktop', 'mobile'] as const).map(value => <button type="button" key={value}
        aria-pressed={device === value} onClick={() => setDevice(value)} className="cms-btn"
        style={device === value ? { background: 'var(--ui-ink)', color: 'var(--ui-surface)', borderColor: 'var(--ui-ink)' } : undefined}>
        {value === 'desktop' ? 'Desktop' : 'Mobile'}
      </button>)}
      <span className="text-xs text-ui-muted">{width}px viewport · scaled to fit</span>
    </div>
    <DeviceFrame width={width}>
      <div className="flex flex-col bg-ui-paper text-ui-ink"><PreviewNavbar />{children}<PreviewFooter /></div>
    </DeviceFrame>
  </div>;
}
