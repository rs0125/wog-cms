export type NavigationItem = {
  id: string;
  label: string;
  href: string;
  children?: NavigationItem[];
};

export const NAVIGATION_GROUPS: { id: string; label: string; items: NavigationItem[] }[] = [
  { id: 'content', label: 'Content', items: [
    { id: 'blogs', label: 'Blogs', href: '/blogs' },
  ] },
  { id: 'overviews', label: 'Overview pages', items: [
    { id: 'states', label: 'States', href: '/locations?kind=STATE' },
    { id: 'cities', label: 'Cities', href: '/locations?kind=CITY' },
    { id: 'micromarkets', label: 'Micromarkets', href: '/micromarkets' },
  ] },
  { id: 'website', label: 'Website pages', items: [
    { id: 'legal', label: 'Legal pages', href: '/legal', children: [
      { id: 'privacy', label: 'Privacy Policy', href: '/legal/privacy-policy' },
      { id: 'terms', label: 'Terms of Service', href: '/legal/terms-of-service' },
    ] },
  ] },
];

export function currentSection(pathname: string, rawKind: string | null) {
  if (pathname === '/dashboard') return { item: 'dashboard', group: '', label: 'Dashboard' };
  for (const group of NAVIGATION_GROUPS) {
    for (const item of group.items) {
      const child = item.children?.find(child => child.href === pathname);
      if (child) return { item: child.id, group: group.id, label: `${item.label} / ${child.label}` };
      if (!item.href.includes('?') && (pathname === item.href || pathname.startsWith(`${item.href}/`))) {
        return { item: item.id, group: group.id, label: item.label };
      }
    }
  }
  if (pathname === '/locations' || pathname === '/locations/new') {
    const state = rawKind?.toUpperCase() === 'STATE';
    return { item: state ? 'states' : 'cities', group: 'overviews', label: state ? 'States' : 'Cities' };
  }
  // Existing /locations/:id URLs don't contain the kind. Highlight the group
  // instead of incorrectly labelling a state editor as a city; the editor's
  // own heading and back-link supply the specific context.
  if (pathname.startsWith('/locations/')) return { item: '', group: 'overviews', label: 'Overview pages / Edit page' };
  return { item: '', group: '', label: 'Content Studio' };
}
