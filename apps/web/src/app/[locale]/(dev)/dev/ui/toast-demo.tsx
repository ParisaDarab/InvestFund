'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Toast,
  ToastAction,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from '@/components/ui/toast';

/** Showcase-only: opens a controlled toast. */
export function ToastDemo() {
  const t = useTranslations('devUi.toast');
  const [open, setOpen] = useState(false);

  return (
    <ToastProvider swipeDirection="right" label={t('regionLabel')}>
      <div>
        <Button
          variant="outline"
          onClick={() => {
            setOpen(true);
          }}
          data-testid="dev-show-toast"
        >
          {t('show')}
        </Button>
      </div>
      <Toast open={open} onOpenChange={setOpen} data-testid="dev-toast">
        <div className="flex flex-1 flex-col gap-1">
          <ToastTitle>{t('title')}</ToastTitle>
          <ToastDescription>{t('description')}</ToastDescription>
        </div>
        <ToastAction altText={t('actionAltText')}>{t('action')}</ToastAction>
        <ToastClose />
      </Toast>
      <ToastViewport />
    </ToastProvider>
  );
}
