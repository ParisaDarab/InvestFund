'use client';

import { useTranslations } from 'next-intl';

import { StatusPill, type StatusTone } from '@/components/ui/badge';

type Kind = 'startup' | 'connection' | 'deal' | 'offer' | 'report';

const TONES: Record<Kind, Record<string, StatusTone>> = {
  startup: { draft: 'neutral', published: 'success', archived: 'warning' },
  connection: { pending: 'warning', accepted: 'success', declined: 'danger', withdrawn: 'neutral' },
  deal: {
    negotiating: 'info',
    declined: 'danger',
    withdrawn: 'neutral',
    expired: 'neutral',
    accepted: 'success',
    funding_reported: 'info',
    receipt_disputed: 'warning',
    cancellation_requested: 'warning',
    completed: 'success',
    cancelled: 'neutral',
  },
  offer: {
    pending: 'info',
    countered: 'neutral',
    superseded: 'neutral',
    accepted: 'success',
    declined: 'danger',
    withdrawn: 'neutral',
    expired: 'neutral',
  },
  report: { open: 'warning', resolved: 'success', dismissed: 'neutral' },
};

export function StatusLabel({ kind, status }: { kind: Kind; status: string }) {
  const t = useTranslations('status');
  return (
    <StatusPill tone={TONES[kind][status] ?? 'neutral'} data-status={status}>
      {t(`${kind}.${status}` as 'startup.draft')}
    </StatusPill>
  );
}
