'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, CircleAlert, ExternalLink } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { OwnedStartup } from '@investfund/shared';

import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { useErrorMessage } from '@/components/common/query-states';
import { StatusLabel } from '@/components/common/status-label';
import { useToast } from '@/components/feedback/toaster';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { Card } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api/endpoints';
import { keys } from '@/lib/api/keys';

const ISSUE_FIELDS = [
  'name',
  'tagline',
  'description',
  'sector',
  'stage',
  'country',
  'fundingPurposes',
  'targetAmountMinor',
  'minAmountMinor',
  'maxAmountMinor',
  'milestones',
  'fundingDeadline',
] as const;

export function PublishPanel({ startup }: { startup: OwnedStartup }) {
  const t = useTranslations('editor.publish');
  const tf = useTranslations('editor.details');
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (action: 'publish' | 'unpublish' | 'archive' | 'restore') =>
      api.startupStatus(startup.id, action, startup.version),
    onSuccess: (updated, action) => {
      queryClient.setQueryData(keys.myStartup(startup.id), updated);
      void queryClient.invalidateQueries({ queryKey: keys.myStartups });
      toast({ title: t(`done.${action}`) });
    },
    onError: (error) => {
      toast({ title: t('failed'), description: errorMessage(error), variant: 'destructive' });
    },
  });
  const issues = startup.publicationIssues;
  const fieldLabel = (path: string) => {
    const field = path.split('.')[0] ?? path;
    return (ISSUE_FIELDS as readonly string[]).includes(field)
      ? tf(`fields.${field as (typeof ISSUE_FIELDS)[number]}`)
      : field;
  };

  return (
    <Card className="space-y-4 p-5" data-testid="publish-panel">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold">{t('title')}</p>
        <StatusLabel kind="startup" status={startup.status} />
      </div>
      {startup.status === 'draft' ? (
        issues.length === 0 ? (
          <p className="text-success flex items-center gap-2 text-sm">
            <CheckCircle2 aria-hidden="true" className="size-4" />
            {t('ready')}
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm">{t('missing', { count: issues.length })}</p>
            <ul className="space-y-1 text-sm" data-testid="publication-issues">
              {issues.map((issue) => (
                <li key={`${issue.path}-${issue.code}`} className="flex gap-2">
                  <CircleAlert aria-hidden="true" className="text-warning mt-0.5 size-4 shrink-0" />
                  <span>
                    <span className="font-medium">{fieldLabel(issue.path)}:</span>{' '}
                    {tf(`rules.${issue.code}` as 'rules.required')}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )
      ) : null}
      <div className="grid gap-2">
        {startup.status === 'draft' ? (
          <Button
            disabled={issues.length > 0 || mutation.isPending}
            onClick={() => {
              mutation.mutate('publish');
            }}
            data-testid="publish-startup"
          >
            {t('publish')}
          </Button>
        ) : null}
        {startup.status === 'published' ? (
          <>
            <Link
              href={`/startups/${startup.slug}`}
              className={buttonVariants({ variant: 'outline' })}
            >
              {t('viewPublic')}
              <ExternalLink aria-hidden="true" />
            </Link>
            <Button
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => {
                mutation.mutate('unpublish');
              }}
            >
              {t('unpublish')}
            </Button>
          </>
        ) : null}
        {startup.status === 'archived' ? (
          <Button
            variant="outline"
            disabled={mutation.isPending}
            onClick={() => {
              mutation.mutate('restore');
            }}
          >
            {t('restore')}
          </Button>
        ) : (
          <ConfirmDialog
            trigger={
              <Button variant="ghost" className="text-destructive">
                {t('archive')}
              </Button>
            }
            title={t('archiveTitle')}
            description={t('archiveBody')}
            confirmLabel={t('archive')}
            cancelLabel={t('cancel')}
            destructive
            onConfirm={() => mutation.mutateAsync('archive')}
          />
        )}
      </div>
      <p className="type-meta">{t(`help.${startup.status}`)}</p>
    </Card>
  );
}
