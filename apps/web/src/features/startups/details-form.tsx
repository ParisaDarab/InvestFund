'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

import {
  COUNTRIES,
  CURRENCIES,
  FUNDING_PURPOSES,
  SECTORS,
  STAGES,
  checkFundingPlan,
  type OwnedStartup,
  type UpdateStartupRequest,
} from '@investfund/shared';

import { useErrorMessage } from '@/components/common/query-states';
import { useToast } from '@/components/feedback/toaster';
import { ChipGroup } from '@/components/forms/chip-group';
import { Field, describedBy } from '@/components/forms/field';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { isApiError } from '@/lib/api/client';
import { api } from '@/lib/api/endpoints';
import { keys } from '@/lib/api/keys';
import { minorToInput, parseMajorInput } from '@/lib/format';

type Purpose = (typeof FUNDING_PURPOSES)[number];
const TEXT_FIELDS = [
  'name',
  'tagline',
  'description',
  'problem',
  'solution',
  'targetMarket',
  'productDescription',
  'businessModel',
  'teamDescription',
  'websiteUrl',
  'fundingPurposeText',
] as const;
type TextField = (typeof TEXT_FIELDS)[number];
const LIMITS: Record<TextField, number> = {
  name: 80,
  tagline: 140,
  description: 5000,
  problem: 2000,
  solution: 2000,
  targetMarket: 200,
  productDescription: 2000,
  businessModel: 1000,
  teamDescription: 2000,
  websiteUrl: 255,
  fundingPurposeText: 2000,
};
const MULTILINE = new Set<TextField>([
  'description',
  'problem',
  'solution',
  'productDescription',
  'businessModel',
  'teamDescription',
  'fundingPurposeText',
]);

export function DetailsForm({ startup }: { startup: OwnedStartup }) {
  const t = useTranslations('editor.details');
  const tc = useTranslations('common');
  const tx = useTranslations('taxonomy');
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const [text, setText] = useState<Record<TextField, string>>(
    () =>
      Object.fromEntries(TEXT_FIELDS.map((f) => [f, startup[f] ?? ''])) as Record<
        TextField,
        string
      >,
  );
  const [sector, setSector] = useState(startup.sector ?? '');
  const [stage, setStage] = useState(startup.stage ?? '');
  const [country, setCountry] = useState(startup.country ?? '');
  const [purposes, setPurposes] = useState<Purpose[]>(startup.fundingPurposes);
  const [currency, setCurrency] = useState<string>(startup.currency);
  const [target, setTarget] = useState(minorToInput(startup.targetAmountMinor));
  const [min, setMin] = useState(minorToInput(startup.minAmountMinor));
  const [max, setMax] = useState(minorToInput(startup.maxAmountMinor));
  const [deadline, setDeadline] = useState(startup.fundingDeadline ?? '');
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});

  const amounts = {
    targetAmountMinor: parseMajorInput(target),
    minAmountMinor: parseMajorInput(min),
    maxAmountMinor: parseMajorInput(max),
  };
  const amountInvalid = {
    targetAmountMinor: target.trim() !== '' && amounts.targetAmountMinor === null,
    minAmountMinor: min.trim() !== '' && amounts.minAmountMinor === null,
    maxAmountMinor: max.trim() !== '' && amounts.maxAmountMinor === null,
  };
  // The same rules the API enforces, for immediate feedback.
  const ruleIssues = useMemo(() => {
    const toBig = (v: string | null) => (v === null ? null : BigInt(v));
    return checkFundingPlan(
      {
        currency,
        targetAmountMinor: toBig(amounts.targetAmountMinor),
        minAmountMinor: toBig(amounts.minAmountMinor),
        maxAmountMinor: toBig(amounts.maxAmountMinor),
        fundingDeadline: deadline === '' ? null : deadline,
        milestones: startup.milestones.map((m) => ({
          targetAmountMinor: BigInt(m.targetAmountMinor),
          currency: m.currency,
        })),
      },
      { requireComplete: false },
    );
  }, [
    currency,
    amounts.targetAmountMinor,
    amounts.minAmountMinor,
    amounts.maxAmountMinor,
    deadline,
    startup.milestones,
  ]);
  const errorFor = (path: string) => {
    if (path in amountInvalid && amountInvalid[path as keyof typeof amountInvalid])
      return t('errors.amount');
    const issue = ruleIssues.find((i) => i.path === path);
    return issue === undefined ? serverErrors[path] : t(`rules.${issue.code}` as 'rules.required');
  };

  const mutation = useMutation({
    mutationFn: (body: UpdateStartupRequest) => api.updateStartup(startup.id, body),
    onSuccess: (updated) => {
      queryClient.setQueryData(keys.myStartup(startup.id), updated);
      void queryClient.invalidateQueries({ queryKey: keys.myStartups });
      setServerErrors({});
      toast({ title: t('saved') });
    },
    onError: (error) => {
      if (isApiError(error)) {
        setServerErrors(
          Object.fromEntries(
            error.fieldErrors.map((e) => [e.path.replace(/^body\./, ''), e.message]),
          ),
        );
      }
      toast({
        title: isApiError(error) && error.status === 409 ? t('conflict') : t('saveFailed'),
        description: errorMessage(error),
        variant: 'destructive',
      });
    },
  });

  const locked = startup.status === 'archived';
  const blocked =
    ruleIssues.length > 0 || Object.values(amountInvalid).some(Boolean) || text.name.trim() === '';
  const textField = (field: TextField, opts: { optional?: boolean; hint?: boolean } = {}) => {
    const id = `sd-${field}`;
    const hint = opts.hint === true ? t(`hints.${field}` as 'hints.tagline') : undefined;
    const error = serverErrors[field];
    const common = {
      ...describedBy(id, hint, error),
      value: text[field],
      maxLength: LIMITS[field],
      disabled: locked,
      onChange: (e: { target: { value: string } }) => {
        setText((v) => ({ ...v, [field]: e.target.value }));
      },
    };
    return (
      <Field
        id={id}
        label={t(`fields.${field}`)}
        hint={hint}
        error={error}
        optional={opts.optional === true ? tc('optional') : undefined}
      >
        {MULTILINE.has(field) ? (
          <Textarea {...common} rows={field === 'description' ? 6 : 3} />
        ) : (
          <Input {...common} type={field === 'websiteUrl' ? 'url' : 'text'} />
        )}
      </Field>
    );
  };

  return (
    <form
      className="grid gap-6"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (blocked) return;
        const nullable = (v: string) => (v.trim() === '' ? null : v.trim());
        mutation.mutate({
          version: startup.version,
          name: text.name.trim(),
          tagline: text.tagline,
          description: text.description,
          problem: text.problem,
          solution: text.solution,
          targetMarket: text.targetMarket,
          productDescription: text.productDescription,
          businessModel: text.businessModel,
          teamDescription: text.teamDescription,
          websiteUrl: nullable(text.websiteUrl),
          fundingPurposeText: text.fundingPurposeText,
          sector: (sector || null) as UpdateStartupRequest['sector'],
          stage: (stage || null) as UpdateStartupRequest['stage'],
          country: (country || null) as UpdateStartupRequest['country'],
          fundingPurposes: purposes,
          currency: currency as 'GBP',
          ...amounts,
          fundingDeadline: deadline === '' ? null : deadline,
        });
      }}
    >
      <Card className="grid gap-5 p-6">
        <h2 className="type-h3">{t('basics')}</h2>
        {textField('name')}
        {textField('tagline', { hint: true })}
        <div className="grid gap-5 sm:grid-cols-3">
          <Field id="sd-sector" label={t('fields.sector')}>
            <NativeSelect
              id="sd-sector"
              value={sector}
              disabled={locked}
              onChange={(e) => {
                setSector(e.target.value);
              }}
            >
              <option value="">{t('choose')}</option>
              {SECTORS.map((v) => (
                <option key={v} value={v}>
                  {tx(`sector.${v}`)}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field id="sd-stage" label={t('fields.stage')}>
            <NativeSelect
              id="sd-stage"
              value={stage}
              disabled={locked}
              onChange={(e) => {
                setStage(e.target.value);
              }}
            >
              <option value="">{t('choose')}</option>
              {STAGES.map((v) => (
                <option key={v} value={v}>
                  {tx(`stage.${v}`)}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field id="sd-country" label={t('fields.country')}>
            <NativeSelect
              id="sd-country"
              value={country}
              disabled={locked}
              onChange={(e) => {
                setCountry(e.target.value);
              }}
            >
              <option value="">{t('choose')}</option>
              {COUNTRIES.map((v) => (
                <option key={v} value={v}>
                  {tx(`country.${v}`)}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>
        {textField('description')}
        {textField('targetMarket', { optional: true })}
        {textField('websiteUrl', { optional: true })}
      </Card>

      <Card className="grid gap-5 p-6">
        <h2 className="type-h3">{t('story')}</h2>
        <p className="type-meta -mt-3">{t('storyHint')}</p>
        {textField('problem', { optional: true })}
        {textField('solution', { optional: true })}
        {textField('productDescription', { optional: true })}
        {textField('businessModel', { optional: true })}
        {textField('teamDescription', { optional: true })}
      </Card>

      <Card className="grid gap-5 p-6">
        <h2 className="type-h3">{t('funding')}</h2>
        <p className="type-meta -mt-3">{t('fundingHint')}</p>
        <ChipGroup
          name="purpose"
          legend={t('fields.fundingPurposes')}
          options={FUNDING_PURPOSES}
          value={purposes}
          onChange={setPurposes}
          label={(v) => tx(`purpose.${v}`)}
        />
        {textField('fundingPurposeText', { optional: true })}
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            id="sd-currency"
            label={t('fields.currency')}
            hint={
              startup.milestones.length > 0 || startup.status === 'published'
                ? t('currencyLocked')
                : undefined
            }
          >
            <NativeSelect
              id="sd-currency"
              value={currency}
              disabled={locked || startup.milestones.length > 0 || startup.status === 'published'}
              onChange={(e) => {
                setCurrency(e.target.value);
              }}
            >
              {CURRENCIES.map((v) => (
                <option key={v} value={v}>
                  {tx(`currency.${v}`)}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field
            id="sd-deadline"
            label={t('fields.fundingDeadline')}
            optional={tc('optional')}
            error={errorFor('fundingDeadline')}
          >
            <Input
              {...describedBy('sd-deadline', undefined, errorFor('fundingDeadline'))}
              type="date"
              value={deadline}
              disabled={locked}
              onChange={(e) => {
                setDeadline(e.target.value);
              }}
            />
          </Field>
        </div>
        <div className="grid gap-5 sm:grid-cols-3">
          {(
            [
              ['minAmountMinor', min, setMin],
              ['targetAmountMinor', target, setTarget],
              ['maxAmountMinor', max, setMax],
            ] as const
          ).map(([key, value, setter]) => (
            <Field key={key} id={`sd-${key}`} label={t(`fields.${key}`)} error={errorFor(key)}>
              <Input
                {...describedBy(`sd-${key}`, undefined, errorFor(key))}
                inputMode="decimal"
                value={value}
                disabled={locked}
                onChange={(e) => {
                  setter(e.target.value);
                }}
                data-testid={`amount-${key}`}
              />
            </Field>
          ))}
        </div>
        {errorFor('milestones') === undefined ? null : (
          <p className="text-destructive text-sm" role="alert">
            {errorFor('milestones')}
          </p>
        )}
        <p className="type-meta">{t('rangeRule')}</p>
      </Card>

      <div className="flex items-center gap-3">
        <Button
          type="submit"
          disabled={locked || blocked || mutation.isPending}
          data-testid="save-details"
        >
          {mutation.isPending ? tc('saving') : t('save')}
        </Button>
        {locked ? <p className="type-meta">{t('archivedLocked')}</p> : null}
      </div>
    </form>
  );
}
