'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileText, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';

import {
  DOCUMENT_CONTENT_TYPES,
  MAX_DOCUMENT_BYTES,
  type DocumentView,
  type OwnedStartup,
} from '@investfund/shared';

import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { EmptyState } from '@/components/common/empty-state';
import { ListSkeleton, QueryError, useErrorMessage } from '@/components/common/query-states';
import { useToast } from '@/components/feedback/toaster';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { api, downloadDocument, uploadDocument } from '@/lib/api/endpoints';
import { keys } from '@/lib/api/keys';
import { useSession } from '@/lib/auth/session';
import { dateOnly } from '@/lib/format';

const ACCEPT = Object.values(DOCUMENT_CONTENT_TYPES)
  .flat()
  .map((ext) => `.${ext}`)
  .join(',');

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${String(Math.ceil(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Owner view: upload, share with all or selected accepted connections, revoke, delete. */
export function DocumentsPanel({ startup }: { startup: OwnedStartup }) {
  const t = useTranslations('editor.documents');
  const { getToken } = useSession();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [visibility, setVisibility] = useState<'all_connections' | 'selected'>('all_connections');
  const documents = useQuery({
    queryKey: keys.documents(startup.id),
    queryFn: () => api.documents(startup.id),
  });
  const connections = useQuery({
    queryKey: keys.connections({ direction: 'all', status: 'accepted' }),
    queryFn: () => api.connections({ direction: 'all', status: 'accepted', limit: 50 }),
  });
  const accepted = (connections.data?.data ?? []).filter((c) => c.startup.id === startup.id);
  const refresh = () => queryClient.invalidateQueries({ queryKey: keys.documents(startup.id) });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const token = await getToken();
      if (token === null) throw new Error('signed out');
      return uploadDocument(token, startup.id, file, visibility);
    },
    onSuccess: async () => {
      toast({ title: t('uploaded') });
      await refresh();
    },
    onError: (error) => {
      toast({
        title: t('uploadFailed'),
        description: error instanceof Error ? error.message : errorMessage(error),
        variant: 'destructive',
      });
    },
  });
  const sharing = useMutation({
    mutationFn: ({
      doc,
      next,
      ids,
    }: {
      doc: DocumentView;
      next: 'all_connections' | 'selected';
      ids: string[];
    }) => api.updateSharing(doc.id, { visibility: next, connectionIds: ids }),
    onSuccess: async () => {
      await refresh();
    },
    onError: (error) => {
      toast({ title: t('shareFailed'), description: errorMessage(error), variant: 'destructive' });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteDocument(id),
    onSuccess: async () => {
      toast({ title: t('deleted') });
      await refresh();
    },
    onError: (error) => {
      toast({ title: t('deleteFailed'), description: errorMessage(error), variant: 'destructive' });
    },
  });

  return (
    <div className="grid gap-4">
      <p className="type-meta">{t('intro')}</p>
      <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-end">
        <div className="grid flex-1 gap-1.5">
          <Label htmlFor="doc-visibility">{t('visibilityLabel')}</Label>
          <NativeSelect
            id="doc-visibility"
            value={visibility}
            onChange={(e) => {
              setVisibility(e.target.value as 'selected');
            }}
          >
            <option value="all_connections">{t('visibility.all_connections')}</option>
            <option value="selected">{t('visibility.selected')}</option>
          </NativeSelect>
        </div>
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          data-testid="document-input"
          aria-label={t('upload')}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file === undefined) return;
            if (file.size > MAX_DOCUMENT_BYTES) {
              toast({ title: t('tooLarge'), variant: 'destructive' });
              return;
            }
            upload.mutate(file);
          }}
        />
        <Button
          onClick={() => input.current?.click()}
          disabled={upload.isPending || startup.status === 'archived'}
        >
          <Upload aria-hidden="true" />
          {upload.isPending ? t('uploading') : t('upload')}
        </Button>
      </Card>
      <p className="type-meta">{t('limits')}</p>
      {documents.isPending ? (
        <ListSkeleton rows={2} />
      ) : documents.isError ? (
        <QueryError error={documents.error} onRetry={() => void documents.refetch()} />
      ) : documents.data.data.length === 0 ? (
        <EmptyState icon={FileText} title={t('emptyTitle')} description={t('emptyBody')} />
      ) : (
        <ul className="grid gap-3">
          {documents.data.data.map((doc) => (
            <li key={doc.id}>
              <Card className="grid gap-3 p-4" data-testid="document-row">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{doc.fileName}</p>
                    <p className="type-meta">
                      {formatSize(doc.sizeBytes)} · {dateOnly(doc.createdAt.slice(0, 10))}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        void (async () => {
                          const token = await getToken();
                          if (token !== null)
                            await downloadDocument(token, doc.id, doc.fileName).catch(() => {
                              toast({ title: t('downloadFailed'), variant: 'destructive' });
                            });
                        })();
                      }}
                    >
                      <Download aria-hidden="true" />
                      {t('download')}
                    </Button>
                    <ConfirmDialog
                      trigger={
                        <Button variant="ghost" size="sm" className="text-destructive">
                          {t('delete')}
                        </Button>
                      }
                      title={t('deleteTitle')}
                      description={t('deleteBody')}
                      confirmLabel={t('delete')}
                      cancelLabel={t('cancel')}
                      destructive
                      onConfirm={() => remove.mutateAsync(doc.id)}
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <NativeSelect
                    aria-label={t('visibilityLabel')}
                    value={doc.visibility}
                    onChange={(e) => {
                      sharing.mutate({
                        doc,
                        next: e.target.value as 'selected',
                        ids: doc.grantedConnectionIds ?? [],
                      });
                    }}
                  >
                    <option value="all_connections">{t('visibility.all_connections')}</option>
                    <option value="selected">{t('visibility.selected')}</option>
                  </NativeSelect>
                  {doc.visibility === 'selected' ? (
                    accepted.length === 0 ? (
                      <p className="type-meta">{t('noConnections')}</p>
                    ) : (
                      <fieldset className="grid gap-2">
                        <legend className="type-meta mb-1">{t('sharedWith')}</legend>
                        {accepted.map((c) => {
                          const granted = doc.grantedConnectionIds?.includes(c.id) ?? false;
                          return (
                            <label key={c.id} className="flex items-center gap-2 text-sm">
                              <Checkbox
                                checked={granted}
                                onCheckedChange={(checked) => {
                                  const current = doc.grantedConnectionIds ?? [];
                                  const ids =
                                    checked === true
                                      ? [...current, c.id]
                                      : current.filter((id) => id !== c.id);
                                  sharing.mutate({ doc, next: 'selected', ids });
                                }}
                              />
                              {c.supporter.displayName}
                            </label>
                          );
                        })}
                      </fieldset>
                    )
                  ) : null}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
