import { CatalogueLoading } from '@/components/CmsLoading';
import { LEGAL_PAGES } from '@/lib/legal-schema';

export default function Loading() {
  return <CatalogueLoading title="Legal pages" pages={LEGAL_PAGES} action={false} />;
}
