export type NavigationItem = {
  id: string;
  label: string;
  href: string;
  children?: NavigationItem[];
};

export const NAVIGATION_GROUPS: { id: string; label: string; description: string; items: (NavigationItem & { description: string })[] }[] = [
  { id: 'content', label: 'Content', description: 'Articles and resources for your readers.', items: [
    { id: 'blogs', description: 'Write and manage articles, guides and warehouse insights.', label: 'Blogs', href: '/blogs' },
    { id: 'imports', description: 'Review incoming drafts before approving them for a website build.', label: 'Content imports', href: '/imports' },
  ] },
  { id: 'overviews', label: 'Overview pages', description: 'Market guides, organized from states to individual clusters.', items: [
    { id: 'states', description: 'Regional market context and state-wide warehouse overviews.', label: 'States', href: '/locations?kind=STATE' },
    { id: 'cities', description: 'City market guides, rental trends and local warehouse insights.', label: 'Cities', href: '/locations?kind=CITY' },
    { id: 'micromarkets', description: 'Detailed guides to individual warehouse and logistics clusters.', label: 'Micromarkets', href: '/micromarkets' },
  ] },
  { id: 'website', label: 'Website pages', description: 'The information pages that support your website.', items: [
    { id: 'ad-pages', description: 'Manage campaign landing page copy, images and enquiry buttons.', label: 'Ad pages', href: '/ad-pages', children: [
      { id: 'ad-bangalore', label: 'Bangalore', href: '/ad-pages/bangalore' },
    ] },
    { id: 'services', description: 'Describe your services. Only written, approved pages appear on the website.', label: 'Services', href: '/services', children: [
      { id: 'warehouse-search', label: 'Warehouse Search', href: '/services/warehouse-search' },
      { id: 'build-to-suit', label: 'Build-To-Suit', href: '/services/build-to-suit' },
      { id: 'lease-negotiation', label: 'Lease Negotiation', href: '/services/lease-negotiation' },
      { id: 'compliance-procurement', label: 'Compliance Procurement', href: '/services/compliance-procurement' },
    ] },
    { id: 'legal', description: 'Manage policy wording, dates and legal information.', label: 'Legal pages', href: '/legal', children: [
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
