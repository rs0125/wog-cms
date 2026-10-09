'use client';

import Link, { useLinkStatus } from 'next/link';
import { createPortal } from 'react-dom';
import { useState, type ComponentProps } from 'react';

/** Keep Next's navigation, prefetching and modifier-click behavior intact. */
export default function CmsLink({ children, prefetch, onMouseEnter, onFocus, onTouchStart, ...props }: ComponentProps<typeof Link>) {
  const [intent, setIntent] = useState(false);
  return <Link {...props}
    prefetch={prefetch ?? (intent ? null : false)}
    onMouseEnter={event => { onMouseEnter?.(event); if (!event.defaultPrevented) setIntent(true); }}
    onFocus={event => { onFocus?.(event); if (!event.defaultPrevented) setIntent(true); }}
    onTouchStart={event => { onTouchStart?.(event); if (!event.defaultPrevented) setIntent(true); }}
  >{children}<NavigationProgress /></Link>;
}

function NavigationProgress() {
  const { pending } = useLinkStatus();
  if (!pending || typeof document === 'undefined') return null;
  // Outside the link so its accessible name stays unchanged. A portal also
  // keeps feedback visible when the mobile menu closes after a click.
  return createPortal(<div className="cms-navigation-progress" role="status">
    <span className="sr-only">Opening page…</span>
    <span className="cms-navigation-progress-track" aria-hidden="true"><span /></span>
  </div>, document.body);
}
