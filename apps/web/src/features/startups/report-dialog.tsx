'use client';

import { Flag } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { REPORT_CATEGORIES } from '@investfund/shared';

import { useErrorMessage } from '@/components/common/query-states';
import { useToast } from '@/components/feedback/toaster';
import { Button } from '@/components/ui/button';
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
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api/endpoints';

export function ReportDialog({
  targetType,
  targetId,
}: {
  targetType: 'user' | 'startup';
  targetId: string;
}) {
  const t = useTranslations('report');
  const tx = useTranslations('taxonomy');
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<string>('');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" data-testid="report-open">
          <Flag aria-hidden="true" />
          {t(targetType === 'user' ? 'openUser' : 'openStartup')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(targetType === 'user' ? 'titleUser' : 'titleStartup')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="report-category">{t('category')}</Label>
            <NativeSelect
              id="report-category"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
              }}
              required
            >
              <option value="" disabled>
                {t('choose')}
              </option>
              {REPORT_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {tx(`reportCategory.${value}`)}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="report-details">{t('details')}</Label>
            <Textarea
              id="report-details"
              maxLength={2000}
              value={details}
              onChange={(e) => {
                setDetails(e.target.value);
              }}
            />
            <p className="type-meta">{t('detailsHint')}</p>
          </div>
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
            disabled={category === '' || busy}
            onClick={() => {
              void (async () => {
                setBusy(true);
                try {
                  await api.report({
                    targetType,
                    targetId,
                    category: category as 'spam',
                    details: details.trim() || null,
                  });
                  toast({ title: t('sent'), description: t('sentBody') });
                  setOpen(false);
                  setCategory('');
                  setDetails('');
                } catch (error) {
                  toast({
                    title: t('failed'),
                    description: errorMessage(error),
                    variant: 'destructive',
                  });
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            {t('submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
