import Image from 'next/image';

/** Presentational public chrome; editing a draft must never navigate away. */
export function PreviewNavbar() {
  return <header className="wog-nav-header wog-navigation">
    <div className="wog-nav-bar">
      <span className="wog-nav-brand"><Image src="/wareongo-logo.webp" alt="" width={120} height={85} /><span>WAREONGO</span></span>
      <nav aria-label="Main navigation" className="wog-nav-desktop">
        <div className="wog-nav-page-links">{['Listings', 'Locations', 'Blogs', 'About Us'].map(label => <span className="wog-nav-item" key={label}>{label}{label === 'Locations' && <span aria-hidden="true">⌄</span>}</span>)}</div>
        <div className="wog-nav-actions"><span className="wog-nav-request">Request a Warehouse</span><span className="wog-nav-contact">Contact Us</span></div>
      </nav>
      <span className="wog-nav-mobile-toggle" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 6h16M4 12h16M4 18h16" /></svg></span>
    </div>
  </header>;
}

const FOOTER_COLUMNS: [string, string[]][] = [
  ['Quick Links', ['Home', 'How It Works', 'Listings', 'Request a Warehouse', 'About Us', 'Case Studies', 'Blogs']],
  ['Services', ['Warehouse Search', 'Build-To-Suit', 'Lease Negotiation', 'Compliance Procurement']],
];

/** Mirrors the public footer in its initial, collapsed state. */
export function PreviewFooter() {
  return <footer className="bg-ui-ink text-ui-surface">
    <div className="container mx-auto py-12">
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
        <div><h2 className="ui-card-title mb-4">WareOnGo</h2><p className="mb-4 text-ui-line">Find the Right Warehouse, Faster.</p></div>
        {FOOTER_COLUMNS.map(([heading, items]) => <div key={heading}>
          <h2 className="ui-card-title mb-4">{heading}</h2>
          <ul className="space-y-2 text-ui-line">{items.map(item => <li key={item}>{item}</li>)}</ul>
        </div>)}
        <div>
          <h2 className="ui-card-title mb-4">Contact Us</h2>
          <ul className="space-y-3">
            <li className="flex items-center"><svg className="mr-2 size-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.2 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.69 2.79a2 2 0 0 1-.45 2.11L8.09 9.89a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.33 1.83.56 2.79.69A2 2 0 0 1 22 16.92Z" /></svg>(+91) 74001-84225</li>
            <li className="flex items-center"><svg className="mr-2 size-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 6-10 7L2 6" /></svg>sales@wareongo.com</li>
          </ul>
        </div>
      </div>
      <div className="mt-10 border-t border-ui-surface/10 pt-6">
        <h2 className="mb-3 flex items-center justify-between text-lg font-semibold">Explore our spaces<span aria-hidden="true">⌄</span></h2>
      </div>
      <div className="mt-12 border-t border-gray-700 pt-6 text-center text-sm text-ui-line">
        <div className="mb-4 flex flex-col items-center justify-center gap-4 sm:flex-row"><span>Privacy Policy</span><span className="hidden sm:inline">•</span><span>Terms of Service</span><span className="hidden sm:inline">•</span><span className="text-xs">Login</span></div>
        <p>© {new Date().getFullYear()} Neuroware Technologies Private Limited. All rights reserved.</p>
      </div>
    </div>
  </footer>;
}
