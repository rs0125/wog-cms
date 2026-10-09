/** Shared with the route fallback so guidance wraps the same way while loading. */
export default function OverviewIntro({ micromarket = false, kind }: { micromarket?: boolean; kind?: 'CITY' | 'STATE' }) {
  return <p className="mb-7 rounded-xl border border-ui-line bg-ui-surface p-4 text-sm text-wareongo-slate">
    {micromarket ? <>
      Publish prose, FAQs and market context at <strong>/overview/&#123;state&#125;/&#123;city&#125;/&#123;micromarket&#125;</strong>.
      The state comes from the city&apos;s location data. Existing micromarket listing URLs
      continue to show the plain warehouse grid. Deleting or delisting content removes its
      overview page on the next build.
    </> : <>
      Publish a {kind ? kind === 'CITY' ? 'city overview at /overview/{state}/{city}' : 'state overview at /overview/{state}'
        : <span className="cms-skeleton text-transparent">city overview at /overview/&#123;state&#125;/&#123;city&#125;</span>}
      {' '}using the shared wireframe: prose, images, FAQs and live inventory statistics.
      The existing listing pages keep their warehouse grids. Deleting or delisting content
      removes its overview on the next build.
    </>}
  </p>;
}
