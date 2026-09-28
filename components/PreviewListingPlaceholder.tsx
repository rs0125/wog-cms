/** Geometry matches PageSkeletons.tsx. Inventory is supplied when the site builds. */
const Skeleton = ({ className }: { className: string }) => <div className={`rounded-sm bg-wareongo-blue/10 ${className}`} aria-hidden="true" />;

export const PreviewListingPlaceholder = () => (
  <div data-preview-listing className="warehouse-card ui-listing-placeholder" aria-label="Listing layout placeholder">
    <div className="warehouse-card__photo">
      <div className="absolute inset-0 flex items-center justify-center text-xs text-ui-muted">Listing layout placeholder</div>
    </div>
    <div className="warehouse-card__body">
      <dl className="warehouse-card__metrics">
        {['area', 'rent'].map(metric => (
          <div key={metric} className={`warehouse-card__metric warehouse-card__${metric}`}>
            <dt><Skeleton className="h-[19px] w-20" /></dt>
            <dd><strong><Skeleton className="h-[1lh] w-24" /></strong></dd>
          </div>
        ))}
      </dl>
      <div className="warehouse-card__place"><Skeleton className="h-6 w-3/4" /></div>
      <div className="warehouse-card__specs">
        <Skeleton className="h-[22px] w-28 border border-ui-line" />
        <Skeleton className="h-[22px] w-14 border border-ui-line" />
        <Skeleton className="h-[22px] w-20 border border-ui-line" />
      </div>
      <div className="warehouse-card__actions"><div className="warehouse-card__enquiry"><Skeleton className="h-5 w-24" /></div></div>
    </div>
  </div>
);
