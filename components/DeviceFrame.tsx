'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Renders children inside a same-origin iframe of a given width.
 *
 * An iframe rather than a narrowed div, because the site's layout is built on
 * `sm:` / `lg:` breakpoints and those are *viewport* media queries. Shrinking a
 * container leaves them all matching the real window, so a "mobile" preview
 * would show the desktop layout squeezed into 390px — the one thing a device
 * toggle must not do. An iframe has its own viewport, so the same classes
 * resolve the way they will on a phone.
 *
 * All the DOM setup happens in the ref callback, which runs after commit. Doing
 * it in an effect meant holding the iframe's document in state and then
 * mutating it, which is both a synchronous setState inside an effect and a write
 * to a state value — the two things React's lint rules single out.
 */

/**
 * Clones the parent's stylesheets in. Same document, so Tailwind's compiled CSS
 * and next/font's @font-face rules come with them; wiped and re-cloned rather
 * than diffed, because there are a handful of nodes and a stale rule is worse
 * than the work.
 */
function cloneStyles(doc: Document) {
  doc.head.querySelectorAll('[data-cloned]').forEach((n) => n.remove());
  for (const node of Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))) {
    const copy = node.cloneNode(true) as HTMLElement;
    copy.setAttribute('data-cloned', '');
    doc.head.appendChild(copy);
  }

  /**
   * Neutralise viewport-height minimums inside the frame.
   *
   * This frame sizes itself to its content, so anything measured in `vh` is a
   * feedback loop: the iframe is H tall, `min-h-screen` makes the content at
   * least H, the content therefore measures ≥ H, we set the iframe taller, and
   * round it goes. It presents as the preview randomly growing to an enormous
   * height. Neutralising it costs nothing visually — a page long enough to
   * preview is already taller than one viewport.
   */
  const guard = doc.createElement('style');
  guard.setAttribute('data-cloned', '');
  guard.textContent = `
    .min-h-screen { min-height: 0 !important; }
    .h-screen { height: auto !important; }
  `;
  doc.head.appendChild(guard);
}

export default function DeviceFrame({
  width,
  children,
}: {
  /** Viewport width to render at, in CSS pixels. */
  width: number;
  children: React.ReactNode;
}) {
  const [mount, setMount] = useState<HTMLElement | null>(null);
  const [height, setHeight] = useState(640);
  const [panel, setPanel] = useState<HTMLElement | null>(null);
  const [avail, setAvail] = useState(0);

  const attach = (frame: HTMLIFrameElement | null) => {
    if (!frame) {
      setMount(null);
      return;
    }
    const doc = frame.contentDocument;
    if (!doc) return;

    // Idempotent: a re-attach on the same frame reuses the root it already has.
    let root = doc.body.querySelector<HTMLElement>('[data-preview-root]');
    if (!root) {
      root = doc.createElement('div');
      root.setAttribute('data-preview-root', '');
      // The site paints its own ground; without this the frame shows white.
      doc.body.style.margin = '0';
      doc.body.className = 'bg-wareongo-ivory';
      doc.body.appendChild(root);
    }
    // The <html> class is where next/font declares --font-montserrat. Without it
    // that variable is undefined inside the frame, `font-sans` falls through to
    // the system stack, and the entire preview renders in the wrong typeface —
    // which is most of what made it look unlike the site.
    doc.documentElement.className = document.documentElement.className;
    cloneStyles(doc);
    setMount((prev) => (prev === root ? prev : root));
  };

  // How much room the panel has, so a wide frame can be scaled to fit it.
  useEffect(() => {
    if (!panel) return;
    // No synchronous seed: observe() fires the callback once immediately, so
    // setting state here as well is both redundant and the cascading-render
    // pattern React's lint rules warn about.
    const observer = new ResizeObserver(() => setAvail(panel.clientWidth));
    observer.observe(panel);
    return () => observer.disconnect();
  }, [panel]);

  useEffect(() => {
    if (!mount) return;
    const doc = mount.ownerDocument;

    // Next's dev server appends <style> tags as it compiles, so watch for them.
    const styles = new MutationObserver(() => cloneStyles(doc));
    styles.observe(document.head, { childList: true });

    /**
     * Grow the frame to its content instead of scrolling inside it — the point
     * is to see the whole page at that width. setState from an observer callback
     * is the subscribe-to-an-external-system case, not a synchronous one.
     *
     * Ignoring sub-pixel changes as well: the observer fires on fractional
     * layout shifts, and feeding those straight back into the iframe height is
     * how a measure-then-resize pair starts oscillating.
     */
    const resize = new ResizeObserver(() => {
      const next = mount.scrollHeight;
      setHeight((prev) => (Math.abs(next - prev) > 1 ? next : prev));
    });
    resize.observe(mount);

    return () => {
      styles.disconnect();
      resize.disconnect();
    };
  }, [mount]);

  /*
   * Sizing, which took several tries to get right:
   *
   *   - The width lands on the iframe, because the iframe's content box *is* the
   *     viewport the media queries read. Putting 390px on a bordered wrapper
   *     left the frame at 388.
   *   - `box-content`, because Tailwind sets border-box globally, which would
   *     take those 2px back off the inside.
   *   - And the frame renders at its full nominal width and is *scaled* to fit,
   *     rather than being given whatever room the panel has. The editor sits in
   *     a max-w-4xl column, so "fit the panel" produced a 782px viewport — the
   *     tablet layout, since `lg:` needs 1024 — under a button labelled Desktop.
   *     A preview that shows the wrong breakpoint is worse than no preview.
   */
  const scale = avail > 0 ? Math.min(1, avail / width) : 1;

  return (
    <div className="rounded-2xl border border-wareongo-blue/20 bg-wareongo-blue/[0.03] p-4">
      <div
        // Measured here, not on the padded panel outside it: clientWidth
        // *includes* padding, so measuring the panel overstated the available
        // width by its 32px of p-4, scaled the frame that much too large, and
        // overflow-hidden clipped the right-hand column off the preview.
        //
        // Also reserves the scaled footprint, since a transform doesn't affect
        // layout.
        ref={setPanel}
        style={{ height: height * scale }}
        className="overflow-hidden"
      >
        <iframe
          ref={attach}
          title="Page preview"
          className="box-content block rounded-xl border border-wareongo-blue/15 bg-wareongo-ivory"
          style={{
            width,
            height,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            // Centre it when it doesn't need scaling (a phone in a wide panel).
            marginLeft: scale === 1 ? Math.max(0, (avail - width) / 2) : 0,
          }}
        />
      </div>
      {mount ? createPortal(children, mount) : null}
    </div>
  );
}
