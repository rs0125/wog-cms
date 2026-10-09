import { CatalogueLoading } from '@/components/CmsLoading';
import { SERVICE_PAGES } from '@/lib/service-schema';

export default function Loading() {
  return <CatalogueLoading title="Services" pages={SERVICE_PAGES} />;
}
