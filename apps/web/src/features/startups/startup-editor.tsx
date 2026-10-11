'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import { DetailsForm } from './details-form';
import { DocumentsPanel } from './documents-panel';
import { MilestonesEditor } from './milestones-editor';
import { PublishPanel } from './publish-panel';

import { PageHeader } from '@/components/common/page-header';
import { ListSkeleton, QueryError } from '@/components/common/query-states';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api/endpoints';
import { keys } from '@/lib/api/keys';

export function StartupEditor({ id }: { id: string }) {
  const t = useTranslations('editor');
  const query = useQuery({ queryKey: keys.myStartup(id), queryFn: () => api.myStartup(id) });
  if (query.isPending) return <ListSkeleton rows={4} />;
  if (query.isError) return <QueryError error={query.error} onRetry={() => void query.refetch()} />;
  const startup = query.data;
  return (
    <div className="space-y-6">
      <Link href="/app/startups" className="type-meta hover:text-foreground">
        {t('back')}
      </Link>
      <PageHeader title={startup.name} description={t('description')} />
      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <Tabs defaultValue="details" className="min-w-0">
          <TabsList>
            <TabsTrigger value="details">{t('tabs.details')}</TabsTrigger>
            <TabsTrigger value="milestones" data-testid="tab-milestones">
              {t('tabs.milestones', { count: startup.milestones.length })}
            </TabsTrigger>
            <TabsTrigger value="documents" data-testid="tab-documents">
              {t('tabs.documents')}
            </TabsTrigger>
          </TabsList>
          {/* Keyed by version so forms reload after any save. */}
          <TabsContent value="details" className="pt-4">
            <DetailsForm key={startup.version} startup={startup} />
          </TabsContent>
          <TabsContent value="milestones" className="pt-4">
            <MilestonesEditor key={startup.version} startup={startup} />
          </TabsContent>
          <TabsContent value="documents" className="pt-4">
            <DocumentsPanel startup={startup} />
          </TabsContent>
        </Tabs>
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <PublishPanel startup={startup} />
        </aside>
      </div>
    </div>
  );
}
