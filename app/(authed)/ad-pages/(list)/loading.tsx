import { CatalogueLoading } from '@/components/CmsLoading';
import { AD_PAGES } from '@/lib/ad-page-schema';

export default function Loading() {
  return <CatalogueLoading title="Ad pages" pages={AD_PAGES} />;
}
