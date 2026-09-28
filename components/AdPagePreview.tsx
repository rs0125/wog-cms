'use client';

import { useEffect, useRef, useState } from 'react';
import type { AdPageContent } from '@/lib/ad-page-schema';

const MESSAGE = 'wareongo:ad-page-preview';
const VIEWPORTS = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } };

/** The website owns the renderer and styles. Drafts only cross into this frame in memory. */
export default function AdPagePreview({ content, url }: { content: AdPageContent; url: string }) {
  const container = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const draft = useRef(content);
  const connected = useRef(false);
  const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop');
  const [availableWidth, setAvailableWidth] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenHeight, setFullscreenHeight] = useState(900);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const origin = new URL(url).origin;

  useEffect(() => {
    draft.current = content;
    if (connected.current) frame.current?.contentWindow?.postMessage({ type: MESSAGE, action: 'content', content }, origin);
  }, [content, origin]);

  useEffect(() => {
    connected.current = false;
    const timeout = window.setTimeout(() => {
      setStatus('error');
      setError('The website preview could not load. Your edits are still here.');
    }, 20000);
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.origin !== origin || event.data?.type !== MESSAGE) return;
      if (event.data.action === 'ready') {
        connected.current = true;
        frame.current?.contentWindow?.postMessage({ type: MESSAGE, action: 'content', content: draft.current }, origin);
      } else if (event.data.action === 'rendered') {
        window.clearTimeout(timeout);
        setError('');
        setStatus('ready');
      } else if (event.data.action === 'error') {
        window.clearTimeout(timeout);
        setStatus('error');
        setError('This draft could not be previewed. Check the page fields and try again.');
      }
    };
    window.addEventListener('message', receive);
    return () => { window.clearTimeout(timeout); window.removeEventListener('message', receive); };
  }, [origin, attempt]);

  useEffect(() => {
    const measure = () => {
      setAvailableWidth(stage.current?.clientWidth ?? 0);
      setFullscreenHeight(Math.max(240, window.innerHeight - 140));
      setFullscreen(document.fullscreenElement === container.current);
    };
    const observer = new ResizeObserver(measure);
    if (stage.current) observer.observe(stage.current);
    document.addEventListener('fullscreenchange', measure);
    window.addEventListener('resize', measure);
    return () => { observer.disconnect(); document.removeEventListener('fullscreenchange', measure); window.removeEventListener('resize', measure); };
  }, []);

  const { width, height } = VIEWPORTS[viewport];
  const scale = Math.min(1, (availableWidth || width) / width, fullscreen ? fullscreenHeight / height : 1);

  return <section ref={container} aria-label="Ad page preview" className="rounded-xl border border-wareongo-blue/20 bg-wareongo-ivory p-3 sm:p-4 [&:fullscreen]:overflow-auto [&:fullscreen]:rounded-none [&:fullscreen]:p-6">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Preview screen size">
        {(['desktop', 'mobile'] as const).map(value => <button type="button" key={value} aria-pressed={viewport === value} onClick={() => setViewport(value)} className={viewport === value ? 'cms-btn-primary' : 'cms-btn'}>
          {value === 'desktop' ? 'Desktop' : 'Mobile'} <span className="ml-2 text-xs opacity-75">{VIEWPORTS[value].width}px</span>
        </button>)}
      </div>
      <button type="button" className="cms-btn" onClick={async () => {
        try {
          if (document.fullscreenElement) await document.exitFullscreen();
          else await container.current?.requestFullscreen();
        } catch { setError('Full screen is unavailable in this browser. You can still use the preview below.'); }
      }}>{fullscreen ? 'Exit full screen' : 'Full screen'}</button>
    </div>
    <p className="mb-4 text-xs leading-5 text-wareongo-slate">Your current edits in the website layout. Scroll inside to explore. Links and form submissions are disabled.</p>
    {error && status === 'ready' && <p role="status" className="mb-3 text-sm text-wareongo-slate">{error}</p>}
    <div ref={stage} className="w-full overflow-hidden">
      <div className="relative mx-auto overflow-hidden rounded-lg border border-wareongo-blue/15 bg-white" style={{ width: width * scale, height: height * scale }}>
        <iframe
          key={attempt}
          ref={frame}
          title="Bangalore website preview"
          src={url}
          sandbox="allow-scripts allow-same-origin"
          referrerPolicy="no-referrer"
          onLoad={() => frame.current?.contentWindow?.postMessage({ type: MESSAGE, action: 'init' }, origin)}
          className="absolute left-0 top-0 origin-top-left border-0"
          style={{ width, height, maxWidth: 'none', transform: `scale(${scale})`, visibility: status === 'ready' ? 'visible' : 'hidden' }}
        />
        {status !== 'ready' && <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
          <p role={status === 'error' ? 'alert' : 'status'} className="max-w-sm text-sm text-wareongo-slate">{status === 'loading' ? 'Loading website preview…' : error}</p>
          {status === 'error' && <button type="button" className="cms-btn" onClick={() => { setStatus('loading'); setError(''); setAttempt(value => value + 1); }}>Retry preview</button>}
        </div>}
      </div>
    </div>
  </section>;
}
