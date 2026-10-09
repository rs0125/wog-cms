'use client';

import Link, { useLinkStatus } from 'next/link';
import { createPortal } from 'react-dom';
import type { ComponentProps } from 'react';

/** Keep Next's navigation, prefetching and modifier-click behavior intact. */
export default function CmsLink({ children, ...props }: ComponentProps<typeof Link>) {
  return <Link {...props}>{children}<NavigationProgress /></Link>;
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
