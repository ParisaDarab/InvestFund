'use client';

import { useQuery } from '@tanstack/react-query';
import { Download, FileLock2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useToast } from '@/components/feedback/toaster';
import { Button } from '@/components/ui/button';
import { api, downloadDocument } from '@/lib/api/endpoints';
import { keys } from '@/lib/api/keys';
import { useSession } from '@/lib/auth/session';

/** Documents the founder shared with the viewer (the API returns only what they may access). */
export function SharedDocuments({ startupId }: { startupId: string }) {
  const t = useTranslations('startupPage.documents');
  const { getToken } = useSession();
  const toast = useToast();
  const query = useQuery({
    queryKey: keys.documents(startupId),
    queryFn: () => api.documents(startupId),
  });
  if (query.isPending || query.isError) return null;
  return (
    <div className="space-y-2 border-t border-border pt-3" data-testid="shared-documents">
      <p className="flex items-center gap-2 text-sm font-medium">
        <FileLock2 aria-hidden="true" className="size-4" />
        {t('title')}
      </p>
      {query.data.data.length === 0 ? (
        <p className="type-meta">{t('none')}</p>
      ) : (
        <ul className="grid gap-1">
          {query.data.data.map((doc) => (
            <li key={doc.id}>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                onClick={() => {
                  void (async () => {
                    const token = await getToken();
                    if (token === null) return;
                    await downloadDocument(token, doc.id, doc.fileName).catch(() => {
                      toast({ title: t('failed'), variant: 'destructive' });
                    });
                  })();
                }}
              >
                <Download aria-hidden="true" />
                <span className="truncate">{doc.fileName}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
