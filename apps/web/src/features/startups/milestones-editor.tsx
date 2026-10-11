'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { OwnedStartup } from '@investfund/shared';

import { useErrorMessage } from '@/components/common/query-states';
import { useToast } from '@/components/feedback/toaster';
import { Field } from '@/components/forms/field';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api/endpoints';
import { keys } from '@/lib/api/keys';
import { minorToInput, money, parseMajorInput } from '@/lib/format';

interface Row {
  key: string;
  id?: string | undefined;
  title: string;
  description: string;
  amount: string;
  targetDate: string;
}

let counter = 0;
const nextKey = () => `new-${String((counter += 1))}`;

export function MilestonesEditor({ startup }: { startup: OwnedStartup }) {
  const t = useTranslations('editor.milestones');
  const tc = useTranslations('common');
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<Row[]>(() =>
    startup.milestones.map((m) => ({
      key: m.id,
      id: m.id,
      title: m.title,
      description: m.description,
      amount: minorToInput(m.targetAmountMinor),
      targetDate: m.targetDate ?? '',
    })),
  );
  const locked = startup.status === 'archived';

  const parsed = rows.map((r) => parseMajorInput(r.amount));
  const total = parsed.reduce<bigint>((sum, v) => sum + (v === null ? 0n : BigInt(v)), 0n);
  const target = startup.targetAmountMinor === null ? null : BigInt(startup.targetAmountMinor);
  const overTarget = target !== null && total > target;
  const invalid = rows.some(
    (r, i) =>
      r.title.trim() === '' ||
      r.description.trim() === '' ||
      parsed[i] === null ||
      parsed[i] === '0',
  );

  const update = (index: number, patch: Partial<Row>) => {
    setRows((current) => current.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };
  const move = (index: number, delta: number) => {
    setRows((current) => {
      const next = [...current];
      const [row] = next.splice(index, 1);
      if (row !== undefined) next.splice(index + delta, 0, row);
      return next;
    });
  };

  const mutation = useMutation({
    mutationFn: () =>
      api.replaceMilestones(startup.id, {
        version: startup.version,
        milestones: rows.map((r, i) => ({
          ...(r.id === undefined ? {} : { id: r.id }),
          title: r.title.trim(),
          description: r.description.trim(),
          targetAmountMinor: parsed[i] ?? '0',
          targetDate: r.targetDate === '' ? null : r.targetDate,
        })),
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(keys.myStartup(startup.id), updated);
      void queryClient.invalidateQueries({ queryKey: keys.myStartups });
      setRows(
        updated.milestones.map((m) => ({
          key: m.id,
          id: m.id,
          title: m.title,
          description: m.description,
          amount: minorToInput(m.targetAmountMinor),
          targetDate: m.targetDate ?? '',
        })),
      );
      toast({ title: t('saved') });
    },
    onError: (error) => {
      toast({ title: t('saveFailed'), description: errorMessage(error), variant: 'destructive' });
    },
  });

  return (
    <div className="grid gap-4">
      <p className="type-meta">{t('intro')}</p>
      {rows.length === 0 ? (
        <p className="text-muted-foreground rounded-md border border-dashed border-border p-6 text-center text-sm">
          {t('empty')}
        </p>
      ) : null}
      <ol className="grid gap-4">
        {rows.map((row, index) => (
          <li key={row.key}>
            <Card className="grid gap-4 p-5" data-testid="milestone-row">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold">{t('number', { n: index + 1 })}</p>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t('moveUp')}
                    disabled={locked || index === 0}
                    onClick={() => {
                      move(index, -1);
                    }}
                  >
                    <ArrowUp aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t('moveDown')}
                    disabled={locked || index === rows.length - 1}
                    onClick={() => {
                      move(index, 1);
                    }}
                  >
                    <ArrowDown aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t('remove')}
                    disabled={locked}
                    onClick={() => {
                      setRows((c) => c.filter((_, i) => i !== index));
                    }}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
              </div>
              <Field id={`ms-title-${row.key}`} label={t('title')}>
                <Input
                  id={`ms-title-${row.key}`}
                  value={row.title}
                  maxLength={120}
                  disabled={locked}
                  onChange={(e) => {
                    update(index, { title: e.target.value });
                  }}
                />
              </Field>
              <Field id={`ms-desc-${row.key}`} label={t('description')}>
                <Textarea
                  id={`ms-desc-${row.key}`}
                  value={row.description}
                  maxLength={2000}
                  rows={2}
                  disabled={locked}
                  onChange={(e) => {
                    update(index, { description: e.target.value });
                  }}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  id={`ms-amount-${row.key}`}
                  label={t('amount', { currency: startup.currency })}
                  error={
                    row.amount.trim() !== '' && (parsed[index] === null || parsed[index] === '0')
                      ? t('amountError')
                      : undefined
                  }
                >
                  <Input
                    id={`ms-amount-${row.key}`}
                    inputMode="decimal"
                    value={row.amount}
                    disabled={locked}
                    onChange={(e) => {
                      update(index, { amount: e.target.value });
                    }}
                  />
                </Field>
                <Field id={`ms-date-${row.key}`} label={t('targetDate')} optional={tc('optional')}>
                  <Input
                    id={`ms-date-${row.key}`}
                    type="date"
                    value={row.targetDate}
                    disabled={locked}
                    onChange={(e) => {
                      update(index, { targetDate: e.target.value });
                    }}
                  />
                </Field>
              </div>
            </Card>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={locked || rows.length >= 20}
          onClick={() => {
            setRows((c) => [
              ...c,
              { key: nextKey(), title: '', description: '', amount: '', targetDate: '' },
            ]);
          }}
          data-testid="add-milestone"
        >
          <Plus aria-hidden="true" />
          {t('add')}
        </Button>
        <p
          className={overTarget ? 'text-destructive text-sm font-medium' : 'type-meta'}
          aria-live="polite"
        >
          {t('allocated', {
            total: money(total.toString(), startup.currency),
            target: money(startup.targetAmountMinor, startup.currency),
          })}
          {overTarget ? ` ${t('overTarget')}` : ''}
        </p>
      </div>
      <div>
        <Button
          type="button"
          disabled={locked || invalid || overTarget || mutation.isPending}
          onClick={() => {
            mutation.mutate();
          }}
          data-testid="save-milestones"
        >
          {mutation.isPending ? tc('saving') : t('save')}
        </Button>
      </div>
    </div>
  );
}
