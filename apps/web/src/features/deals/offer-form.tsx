'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { FUNDING_TYPES, type Milestone, type OfferTerms, type OfferView } from '@investfund/shared';

import { Field, describedBy } from '@/components/forms/field';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { money, minorToInput, parseMajorInput } from '@/lib/format';

export interface OfferFormProps {
  currency: string;
  milestones: readonly Milestone[];
  /** Pre-fill from existing terms (counter/revise). */
  initial?: OfferView | undefined;
  submitLabel: string;
  busy: boolean;
  onSubmit: (terms: OfferTerms) => void;
}

/** Structured grant/donation terms. No equity fields exist by design. */
export function OfferForm({
  currency,
  milestones,
  initial,
  submitLabel,
  busy,
  onSubmit,
}: OfferFormProps) {
  const t = useTranslations('deals.form');
  const tc = useTranslations('common');
  const tx = useTranslations('taxonomy');
  const [fundingType, setFundingType] = useState<'grant' | 'donation'>(
    initial?.fundingType ?? 'grant',
  );
  const [amount, setAmount] = useState(minorToInput(initial?.amountMinor));
  const [purpose, setPurpose] = useState(initial?.purpose ?? '');
  const [conditions, setConditions] = useState(initial?.conditions ?? '');
  const [message, setMessage] = useState('');
  const [respondBy, setRespondBy] = useState('');
  const [milestoneIds, setMilestoneIds] = useState<string[]>(
    initial?.milestones.map((m) => m.id) ?? [],
  );
  const [touched, setTouched] = useState(false);
  const amountMinor = parseMajorInput(amount);
  const amountError =
    touched && (amountMinor === null || amountMinor === '0') ? t('errors.amount') : undefined;
  const purposeError = touched && purpose.trim() === '' ? t('errors.purpose') : undefined;
  const today = new Date().toISOString().slice(0, 10);
  const dateError =
    touched && respondBy !== '' && respondBy <= today ? t('errors.respondBy') : undefined;

  return (
    <form
      className="grid gap-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (
          amountMinor === null ||
          amountMinor === '0' ||
          purpose.trim() === '' ||
          (respondBy !== '' && respondBy <= today)
        )
          return;
        onSubmit({
          fundingType,
          amountMinor,
          currency: currency as 'GBP',
          purpose: purpose.trim(),
          conditions: conditions.trim() === '' ? null : conditions.trim(),
          message: message.trim() === '' ? null : message.trim(),
          // End of the chosen day, in the user's time zone, sent as UTC.
          respondBy: respondBy === '' ? null : new Date(`${respondBy}T23:59:59`).toISOString(),
          milestoneIds,
        });
      }}
    >
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">{t('type')}</legend>
        <div className="flex gap-2" role="radiogroup">
          {FUNDING_TYPES.map((type) => (
            <label
              key={type}
              className="has-[:checked]:border-primary has-[:checked]:bg-primary/5 flex flex-1 cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
            >
              <input
                type="radio"
                name="funding-type"
                value={type}
                checked={fundingType === type}
                onChange={() => {
                  setFundingType(type);
                }}
                className="accent-[var(--primary)]"
              />
              {tx(`fundingType.${type}`)}
            </label>
          ))}
        </div>
        <p className="type-meta">{t('typeHint')}</p>
      </fieldset>
      <Field id="of-amount" label={t('amount', { currency })} error={amountError}>
        <Input
          {...describedBy('of-amount', undefined, amountError)}
          inputMode="decimal"
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
          }}
          data-testid="offer-amount"
        />
      </Field>
      <Field id="of-purpose" label={t('purpose')} error={purposeError}>
        <Textarea
          {...describedBy('of-purpose', undefined, purposeError)}
          value={purpose}
          maxLength={2000}
          rows={2}
          onChange={(e) => {
            setPurpose(e.target.value);
          }}
          data-testid="offer-purpose"
        />
      </Field>
      <Field
        id="of-conditions"
        label={t('conditions')}
        optional={tc('optional')}
        hint={t('conditionsHint')}
      >
        <Textarea
          {...describedBy('of-conditions', t('conditionsHint'))}
          value={conditions}
          maxLength={4000}
          rows={2}
          onChange={(e) => {
            setConditions(e.target.value);
          }}
        />
      </Field>
      {milestones.length === 0 ? null : (
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">
            {t('milestones')} <span className="type-meta font-normal">({tc('optional')})</span>
          </legend>
          {milestones.map((m) => (
            <label key={m.id} className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={milestoneIds.includes(m.id)}
                onCheckedChange={(checked) => {
                  setMilestoneIds((ids) =>
                    checked === true ? [...ids, m.id] : ids.filter((x) => x !== m.id),
                  );
                }}
              />
              <span>
                {m.title}{' '}
                <span className="type-meta">({money(m.targetAmountMinor, m.currency)})</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="of-respond" label={t('respondBy')} optional={tc('optional')} error={dateError}>
          <Input
            {...describedBy('of-respond', undefined, dateError)}
            type="date"
            min={today}
            value={respondBy}
            onChange={(e) => {
              setRespondBy(e.target.value);
            }}
          />
        </Field>
        <Field id="of-message" label={t('message')} optional={tc('optional')}>
          <Input
            id="of-message"
            value={message}
            maxLength={2000}
            onChange={(e) => {
              setMessage(e.target.value);
            }}
          />
        </Field>
      </div>
      <p className="type-meta">{t('disclaimer')}</p>
      <div>
        <Button type="submit" disabled={busy} data-testid="submit-offer">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
