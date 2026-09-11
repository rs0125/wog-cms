'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { NAVIGATION_GROUPS, currentSection, type NavigationItem } from '@/lib/navigation';

function Arrow({ className = '' }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={`size-4 ${className}`} aria-hidden="true"><path d="M7 17 17 7M7 7h10v10" /></svg>;
}

function Brand() {
  return <Link href="/dashboard" className="flex items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-wareongo-blue" aria-label="WareOnGo Content Studio dashboard">
    <Image src="/wareongo-logo.webp" alt="" width={120} height={85} priority className="h-8 w-auto" />
    <span><span className="block text-sm font-bold tracking-[0.16em] text-wareongo-blue">WAREONGO</span><span className="block text-[11px] text-wareongo-slate">Content Studio</span></span>
  </Link>;
}

export default function CmsNavigation({ user }: { user: { name: string; email: string } }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const section = currentSection(pathname, params.get('kind'));
  const dialog = useRef<HTMLDialogElement>(null);
  const previousOverflow = useRef<string | null>(null);
  const [open, setOpen] = useState(false);

  const restoreScroll = useCallback(() => {
    if (previousOverflow.current !== null) document.body.style.overflow = previousOverflow.current;
    previousOverflow.current = null;
  }, []);
  const closeMenu = useCallback(() => {
    restoreScroll();
    dialog.current?.close();
  }, [restoreScroll]);
  const openMenu = () => {
    if (!dialog.current || dialog.current.open) return;
    previousOverflow.current = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current.showModal();
    setOpen(true);
  };

  // Back/forward navigation and resizing to desktop dismiss an open drawer.
  useEffect(() => { closeMenu(); }, [pathname, params, closeMenu]);
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)');
    const resize = () => { if (desktop.matches) closeMenu(); };
    desktop.addEventListener('change', resize);
    return () => { desktop.removeEventListener('change', resize); restoreScroll(); };
  }, [closeMenu, restoreScroll]);

  const itemLink = (item: NavigationItem, nested = false, mobile = false) => {
    const active = section.item === item.id;
    const parent = item.children?.some(child => child.id === section.item);
    return <li key={item.id}>
      <Link href={item.href} onNavigate={mobile ? closeMenu : undefined} aria-current={active ? 'page' : undefined}
        className={`cms-nav-link ${nested ? 'text-[13px]' : 'text-sm'} ${active ? 'bg-wareongo-blue text-white' : parent ? 'bg-wareongo-blue/5 font-semibold text-wareongo-blue' : 'text-wareongo-slate hover:bg-wareongo-blue/5 hover:text-wareongo-blue'}`}>
        <span className="min-w-0">{item.label}</span>
        {active && <span className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />}
      </Link>
      {item.children && <ul className="ml-4 mt-1 space-y-1 border-l border-wareongo-blue/15 pl-3">{item.children.map(child => itemLink(child, true, mobile))}</ul>}
    </li>;
  };

  const menu = (mobile = false) => <nav aria-label={mobile ? 'Mobile content menu' : 'Content menu'} className="space-y-7">
    <ul>{itemLink({ id: 'dashboard', label: 'Dashboard', href: '/dashboard' }, false, mobile)}</ul>
    {NAVIGATION_GROUPS.map(group => <div key={group.id}>
      <h2 className={`mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.15em] ${section.group === group.id ? 'text-wareongo-blue' : 'text-wareongo-slate'}`}>{group.label}</h2>
      <ul className="space-y-1">{group.items.map(item => itemLink(item, false, mobile))}</ul>
    </div>)}
  </nav>;

  const account = <div className="border-t border-wareongo-blue/10 p-5">
    <div className="mb-4 flex min-w-0 items-center gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-wareongo-blue/5 text-sm font-semibold text-wareongo-blue" aria-hidden="true">{user.name.trim().slice(0, 1).toUpperCase()}</span>
      <div className="min-w-0"><p className="truncate text-sm font-medium text-wareongo-blue">{user.name}</p><p className="truncate text-[11px] text-wareongo-slate" title={user.email}>{user.email}</p></div>
    </div>
    <form action="/api/auth/logout" method="post"><button className="cms-btn min-h-10 w-full">Sign out</button></form>
  </div>;

  return <>
    <a href="#cms-content" className="fixed left-4 top-4 z-50 -translate-y-24 rounded-lg bg-wareongo-blue px-4 py-3 text-sm text-white focus:translate-y-0">Skip to content</a>
    <aside aria-label="Sidebar" className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-wareongo-blue/10 bg-white lg:flex">
      <div className="px-6 py-7"><Brand /></div>
      <div className="flex-1 overflow-y-auto px-4 pb-6">{menu()}</div>
      {account}
    </aside>
    <header className="sticky top-0 z-10 flex h-18 items-center justify-between gap-3 border-b border-wareongo-blue/10 bg-wareongo-ivory/95 px-5 backdrop-blur sm:px-8 lg:ml-64">
      <div className="flex min-w-0 items-center gap-3">
        <button type="button" onClick={openMenu} aria-haspopup="dialog" aria-expanded={open} aria-controls="cms-menu" className="cms-btn min-h-11 gap-2 px-3 lg:hidden">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="size-4" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>Menu
        </button>
        <div className="min-w-0"><span className="hidden text-[10px] uppercase tracking-[0.16em] text-wareongo-slate sm:block">Content Studio</span><p className="truncate text-sm font-medium text-wareongo-blue" title={section.label}>{section.label}</p></div>
      </div>
      <a href="https://wareongo.com" target="_blank" rel="noreferrer" className="hidden shrink-0 items-center gap-2 rounded-lg px-2 py-3 text-xs font-medium text-wareongo-slate hover:text-wareongo-blue focus-visible:outline-2 sm:inline-flex">View website<Arrow /></a>
    </header>
    <dialog ref={dialog} id="cms-menu" aria-labelledby="cms-menu-title" onClose={() => { restoreScroll(); setOpen(false); }}
      onCancel={event => { event.preventDefault(); closeMenu(); }}
      onKeyDown={event => {
        if (event.key !== 'Tab') return;
        const controls = event.currentTarget.querySelectorAll<HTMLElement>('a[href], button:not([disabled])');
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}
      onClick={event => { if (event.target === event.currentTarget) closeMenu(); }}
      className="cms-menu-drawer m-0 h-dvh max-h-none w-[min(20rem,calc(100vw-2rem))] max-w-none border-0 bg-white p-0 text-wareongo-charcoal backdrop:bg-wareongo-blue/40 backdrop:backdrop-blur-sm">
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-wareongo-blue/10 px-5 py-5"><div><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-wareongo-slate">Content Studio</p><h2 id="cms-menu-title" className="cms-title text-xl">Menu</h2></div>
          <button type="button" onClick={closeMenu} aria-label="Close menu" className="cms-btn size-11 p-0"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="size-5" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-5">{menu(true)}</div>
        {account}
      </div>
    </dialog>
  </>;
}
