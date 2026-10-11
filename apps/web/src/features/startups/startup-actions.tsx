'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bookmark, BookmarkCheck, MessageSquarePlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { StartupDetail } from '@investfund/shared';

import { ReportDialog } from './report-dialog';
import { SharedDocuments } from './shared-documents';

import { useErrorMessage } from '@/components/common/query-states';
import { StatusLabel } from '@/components/common/status-label';
import { useToast } from '@/components/feedback/toaster';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Link, usePathname } from '@/i18n/navigation';
import { api } from '@/lib/api/endpoints';
import { keys } from '@/lib/api/keys';
import { useSession } from '@/lib/auth/session';

/** Viewer-specific actions on a public startup page. The API decides what is allowed. */
export function StartupActions({ startup }: { startup: StartupDetail }) {
  const t = useTranslations('startupPage.actions');
  const { state } = useSession();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const [message, setMessage] = useState('');
  const [open, setOpen] = useState(false);
  const signedIn = state.status === 'authenticated';

  const relationship = useQuery({
    queryKey: keys.relationship(startup.id),
    queryFn: () => api.relationship(startup.id),
    enabled: signedIn,
  });
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: keys.relationship(startup.id) });

  const save = useMutation({
    mutationFn: (saved: boolean) => (saved ? api.unsave(startup.id) : api.save(startup.id)),
    onSuccess: async () => {
      await invalidate();
      await queryClient.invalidateQueries({ queryKey: keys.saved });
    },
    onError: (error) => {
      toast({ title: t('saveFailed'), description: errorMessage(error), variant: 'destructive' });
    },
  });
  const connect = useMutation({
    mutationFn: () => api.requestConnection(startup.id, message.trim() || null),
    onSuccess: async () => {
      setOpen(false);
      setMessage('');
      toast({ title: t('requested'), description: t('requestedBody') });
      await invalidate();
      await queryClient.invalidateQueries({ queryKey: keys.connectionsAll });
    },
    onError: (error) => {
      toast({
        title: t('requestFailed'),
        description: errorMessage(error),
        variant: 'destructive',
      });
    },
  });

  if (state.status === 'loading' || (signedIn && relationship.isPending)) {
    return (
      <Card className="space-y-3 p-5">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </Card>
    );
  }

  if (!signedIn) {
    return (
      <Card className="space-y-3 p-5" data-testid="startup-actions">
        <p className="font-semibold">{t('anonymousTitle')}</p>
        <p className="type-meta">{t('anonymousBody')}</p>
        <Link
          href={`/login?returnTo=${encodeURIComponent(pathname)}`}
          className={buttonVariants({ className: 'w-full' })}
        >
          {t('signInToConnect')}
        </Link>
      </Card>
    );
  }

  const rel = relationship.data;
  if (rel === undefined) return null;
  if (rel.isOwner) {
    return (
      <Card className="space-y-3 p-5" data-testid="startup-actions">
        <p className="type-meta">{t('ownerBody')}</p>
        <Link
          href={`/app/startups/${startup.id}`}
          className={buttonVariants({ variant: 'outline', className: 'w-full' })}
        >
          {t('edit')}
        </Link>
      </Card>
    );
  }

  return (
    <Card className="space-y-4 p-5" data-testid="startup-actions">
      {rel.connection === null ? null : (
        <div className="flex items-center justify-between gap-2">
          <span className="type-meta">{t('connection')}</span>
          <StatusLabel kind="connection" status={rel.connection.status} />
        </div>
      )}
      {rel.connection?.status === 'accepted' ? (
        <Link href="/app/messages" className={buttonVariants({ className: 'w-full' })}>
          {t('openMessages')}
        </Link>
      ) : rel.canRequestConnection ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="w-full" data-testid="request-connection">
              <MessageSquarePlus aria-hidden="true" />
              {t('requestConnection')}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('dialogTitle', { name: startup.name })}</DialogTitle>
              <DialogDescription>{t('dialogBody')}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-1.5">
              <Label htmlFor="connect-message">{t('messageLabel')}</Label>
              <Textarea
                id="connect-message"
                maxLength={1000}
                value={message}
                onChange={(e) => {
                  setMessage(e.target.value);
                }}
                placeholder={t('messagePlaceholder')}
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setOpen(false);
                }}
              >
                {t('cancel')}
              </Button>
              <Button
                onClick={() => {
                  connect.mutate();
                }}
                disabled={connect.isPending}
                data-testid="send-connection-request"
              >
                {t('send')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : (
        <p className="type-meta" data-testid="request-blocked-reason">
          {t(`blocked.${(rel.requestBlockedReason ?? 'exists') as 'exists'}`)}
        </p>
      )}
      {rel.requestBlockedReason === 'profile_incomplete' ? (
        <Link
          href="/app/profile"
          className={buttonVariants({ variant: 'outline', className: 'w-full' })}
        >
          {t('completeProfile')}
        </Link>
      ) : null}
      {rel.requestBlockedReason === 'not_supporter' ? null : (
        <Button
          variant="outline"
          className="w-full"
          disabled={save.isPending}
          aria-pressed={rel.saved}
          onClick={() => {
            save.mutate(rel.saved);
          }}
          data-testid="save-startup"
        >
          {rel.saved ? <BookmarkCheck aria-hidden="true" /> : <Bookmark aria-hidden="true" />}
          {rel.saved ? t('saved') : t('save')}
        </Button>
      )}
      {rel.connection?.status === 'accepted' ? <SharedDocuments startupId={startup.id} /> : null}
      <p className="type-meta">{t('notCommitment')}</p>
      <div className="border-t border-border pt-3">
        <ReportDialog targetType="startup" targetId={startup.id} />
      </div>
    </Card>
  );
}
