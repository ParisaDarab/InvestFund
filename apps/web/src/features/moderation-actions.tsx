'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ban } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { useErrorMessage } from '@/components/common/query-states';
import { useToast } from '@/components/feedback/toaster';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api/endpoints';
import { keys } from '@/lib/api/keys';

/** Block (with confirmation) or unblock another user. */
export function BlockButton({
  userId,
  name,
  blocked,
}: {
  userId: string;
  name: string;
  blocked: boolean;
}) {
  const t = useTranslations('block');
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const refresh = async () => {
    for (const key of [
      keys.connectionsAll,
      keys.conversations,
      keys.dealsAll,
      keys.blocks,
      ['deal'],
      ['startups'],
    ]) {
      await queryClient.invalidateQueries({ queryKey: key });
    }
  };
  const unblock = useMutation({
    mutationFn: () => api.unblock(userId),
    onSuccess: async () => {
      toast({ title: t('unblocked', { name }) });
      await refresh();
    },
    onError: (error) => {
      toast({ title: t('failed'), description: errorMessage(error), variant: 'destructive' });
    },
  });
  if (blocked) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          unblock.mutate();
        }}
        disabled={unblock.isPending}
      >
        {t('unblock')}
      </Button>
    );
  }
  return (
    <ConfirmDialog
      trigger={
        <Button variant="ghost" size="sm" data-testid="block-user">
          <Ban aria-hidden="true" />
          {t('block')}
        </Button>
      }
      title={t('title', { name })}
      description={t('body')}
      confirmLabel={t('confirm')}
      cancelLabel={t('cancel')}
      destructive
      onConfirm={async () => {
        try {
          await api.block(userId);
          toast({ title: t('blocked', { name }) });
          await refresh();
        } catch (error) {
          toast({ title: t('failed'), description: errorMessage(error), variant: 'destructive' });
          throw error;
        }
      }}
    />
  );
}
