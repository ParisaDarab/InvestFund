'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import {
  COUNTRIES,
  CURRENCIES,
  FUNDING_PURPOSES,
  SECTORS,
  STAGES,
  SupporterProfileInput,
  type SupporterProfile,
} from '@investfund/shared';

import { useErrorMessage } from '@/components/common/query-states';
import { useToast } from '@/components/feedback/toaster';
import { ChipGroup } from '@/components/forms/chip-group';
import { Field, describedBy } from '@/components/forms/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api/endpoints';
import { keys } from '@/lib/api/keys';
import { minorToInput, parseMajorInput } from '@/lib/format';

type Sector = (typeof SECTORS)[number];
type Stage = (typeof STAGES)[number];
type Purpose = (typeof FUNDING_PURPOSES)[number];
type Country = (typeof COUNTRIES)[number];

export function SupporterProfileForm({
  initial,
  onSaved,
  submitLabel,
}: {
  initial: SupporterProfile | null;
  onSaved: () => void;
  submitLabel: string;
}) {
  const t = useTranslations('profile.supporter');
  const tc = useTranslations('common');
  const tx = useTranslations('taxonomy');
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState(initial?.displayName ?? '');
  const [bio, setBio] = useState(initial?.bio ?? '');
  const [sectors, setSectors] = useState<Sector[]>(initial?.sectors ?? []);
  const [stages, setStages] = useState<Stage[]>(initial?.stages ?? []);
  const [purposes, setPurposes] = useState<Purpose[]>(initial?.purposes ?? []);
  const [countries, setCountries] = useState<Country[]>(initial?.countries ?? []);
  const [currency, setCurrency] = useState<string>(initial?.currency ?? 'GBP');
  const [min, setMin] = useState(minorToInput(initial?.fundingMinMinor));
  const [max, setMax] = useState(minorToInput(initial?.fundingMaxMinor));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation({
    mutationFn: (body: SupporterProfileInput) => api.saveSupporterProfile(body),
    onSuccess: async (profile) => {
      queryClient.setQueryData(keys.supporterProfile, profile);
      await queryClient.invalidateQueries({ queryKey: keys.recommendations });
      toast({ title: t('saved') });
      onSaved();
    },
    onError: (error) => {
      toast({ title: t('saveFailed'), description: errorMessage(error), variant: 'destructive' });
    },
  });

  return (
    <form
      className="grid gap-6"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const next: Record<string, string> = {};
        const minMinor = parseMajorInput(min);
        const maxMinor = parseMajorInput(max);
        if (min.trim() !== '' && minMinor === null) next.fundingMinMinor = t('errors.amount');
        if (max.trim() !== '' && maxMinor === null) next.fundingMaxMinor = t('errors.amount');
        const body = {
          displayName,
          bio,
          sectors,
          stages,
          purposes,
          countries,
          currency: currency as 'GBP',
          fundingMinMinor: minMinor,
          fundingMaxMinor: maxMinor,
        };
        const parsed = SupporterProfileInput.safeParse(body);
        if (!parsed.success) {
          for (const issue of parsed.error.issues) {
            const key = String(issue.path[0]);
            next[key] ??=
              key === 'displayName'
                ? t('errors.displayName')
                : key === 'fundingMinMinor'
                  ? t('errors.range')
                  : t('errors.amount');
          }
        }
        setErrors(next);
        if (Object.keys(next).length > 0) return;
        mutation.mutate(body);
      }}
    >
      <Field
        id="sp-name"
        label={t('displayName')}
        hint={t('displayNameHint')}
        error={errors.displayName}
      >
        <Input
          {...describedBy('sp-name', t('displayNameHint'), errors.displayName)}
          value={displayName}
          onChange={(e) => {
            setDisplayName(e.target.value);
          }}
          maxLength={80}
        />
      </Field>
      <Field id="sp-bio" label={t('bio')} optional={tc('optional')} hint={t('bioHint')}>
        <Textarea
          {...describedBy('sp-bio', t('bioHint'))}
          value={bio}
          onChange={(e) => {
            setBio(e.target.value);
          }}
          maxLength={2000}
          rows={4}
        />
      </Field>
      <p className="type-meta -mb-2">{t('preferencesIntro')}</p>
      <ChipGroup
        name="sector"
        legend={t('sectors')}
        options={SECTORS}
        value={sectors}
        onChange={setSectors}
        label={(v) => tx(`sector.${v}`)}
      />
      <ChipGroup
        name="stage"
        legend={t('stages')}
        options={STAGES}
        value={stages}
        onChange={setStages}
        label={(v) => tx(`stage.${v}`)}
      />
      <ChipGroup
        name="purpose"
        legend={t('purposes')}
        options={FUNDING_PURPOSES}
        value={purposes}
        onChange={setPurposes}
        label={(v) => tx(`purpose.${v}`)}
      />
      <ChipGroup
        name="country"
        legend={t('countries')}
        hint={t('countriesHint')}
        options={COUNTRIES}
        value={countries}
        onChange={setCountries}
        label={(v) => tx(`country.${v}`)}
      />
      <fieldset className="grid gap-3">
        <legend className="text-sm font-medium">{t('range')}</legend>
        <p className="type-meta">{t('rangeHint')}</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field id="sp-currency" label={t('currency')}>
            <NativeSelect
              id="sp-currency"
              value={currency}
              onChange={(e) => {
                setCurrency(e.target.value);
              }}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {tx(`currency.${c}`)}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field
            id="sp-min"
            label={t('min')}
            optional={tc('optional')}
            error={errors.fundingMinMinor}
          >
            <Input
              {...describedBy('sp-min', undefined, errors.fundingMinMinor)}
              inputMode="decimal"
              value={min}
              onChange={(e) => {
                setMin(e.target.value);
              }}
            />
          </Field>
          <Field
            id="sp-max"
            label={t('max')}
            optional={tc('optional')}
            error={errors.fundingMaxMinor}
          >
            <Input
              {...describedBy('sp-max', undefined, errors.fundingMaxMinor)}
              inputMode="decimal"
              value={max}
              onChange={(e) => {
                setMax(e.target.value);
              }}
            />
          </Field>
        </div>
      </fieldset>
      <p className="type-meta">{t('visibility')}</p>
      <div>
        <Button type="submit" disabled={mutation.isPending} data-testid="save-supporter-profile">
          {mutation.isPending ? tc('saving') : submitLabel}
        </Button>
      </div>
    </form>
  );
}
