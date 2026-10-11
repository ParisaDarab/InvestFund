'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { COUNTRIES, FounderProfileInput, type FounderProfile } from '@investfund/shared';

import { useErrorMessage } from '@/components/common/query-states';
import { useToast } from '@/components/feedback/toaster';
import { Field, describedBy } from '@/components/forms/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api/endpoints';
import { keys } from '@/lib/api/keys';

export function FounderProfileForm({
  initial,
  onSaved,
  submitLabel,
}: {
  initial: FounderProfile | null;
  onSaved: () => void;
  submitLabel: string;
}) {
  const t = useTranslations('profile.founder');
  const tc = useTranslations('common');
  const tx = useTranslations('taxonomy');
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const [values, setValues] = useState({
    displayName: initial?.displayName ?? '',
    headline: initial?.headline ?? '',
    bio: initial?.bio ?? '',
    country: initial?.country ?? '',
    linkedinUrl: initial?.linkedinUrl ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (key: keyof typeof values) => (e: { target: { value: string } }) => {
    setValues((v) => ({ ...v, [key]: e.target.value }));
  };

  const mutation = useMutation({
    mutationFn: (body: FounderProfileInput) => api.saveFounderProfile(body),
    onSuccess: (profile) => {
      queryClient.setQueryData(keys.founderProfile, profile);
      toast({ title: t('saved') });
      onSaved();
    },
    onError: (error) => {
      toast({ title: t('saveFailed'), description: errorMessage(error), variant: 'destructive' });
    },
  });

  return (
    <form
      className="grid gap-5"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const body = {
          displayName: values.displayName,
          headline: values.headline,
          bio: values.bio,
          country: values.country === '' ? null : values.country,
          linkedinUrl: values.linkedinUrl.trim() === '' ? null : values.linkedinUrl.trim(),
        };
        const parsed = FounderProfileInput.safeParse(body);
        if (!parsed.success) {
          setErrors(
            Object.fromEntries(
              parsed.error.issues.map((i) => [
                String(i.path[0]),
                t(`errors.${String(i.path[0])}` as 'errors.displayName'),
              ]),
            ),
          );
          return;
        }
        setErrors({});
        mutation.mutate(body as FounderProfileInput);
      }}
    >
      <Field
        id="fp-name"
        label={t('displayName')}
        hint={t('displayNameHint')}
        error={errors.displayName}
      >
        <Input
          {...describedBy('fp-name', t('displayNameHint'), errors.displayName)}
          value={values.displayName}
          onChange={set('displayName')}
          maxLength={80}
          required
          autoComplete="name"
        />
      </Field>
      <Field
        id="fp-headline"
        label={t('headline')}
        optional={tc('optional')}
        hint={t('headlineHint')}
      >
        <Input
          {...describedBy('fp-headline', t('headlineHint'))}
          value={values.headline}
          onChange={set('headline')}
          maxLength={120}
        />
      </Field>
      <Field id="fp-bio" label={t('bio')} optional={tc('optional')}>
        <Textarea id="fp-bio" value={values.bio} onChange={set('bio')} maxLength={2000} rows={4} />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="fp-country" label={t('country')} optional={tc('optional')}>
          <NativeSelect id="fp-country" value={values.country} onChange={set('country')}>
            <option value="">{tc('notProvided')}</option>
            {COUNTRIES.map((c) => (
              <option key={c} value={c}>
                {tx(`country.${c}`)}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field
          id="fp-linkedin"
          label={t('linkedin')}
          optional={tc('optional')}
          error={errors.linkedinUrl}
        >
          <Input
            {...describedBy('fp-linkedin', undefined, errors.linkedinUrl)}
            type="url"
            value={values.linkedinUrl}
            onChange={set('linkedinUrl')}
            placeholder={t('linkedinPlaceholder')}
          />
        </Field>
      </div>
      <p className="type-meta">{t('visibility')}</p>
      <div>
        <Button type="submit" disabled={mutation.isPending} data-testid="save-founder-profile">
          {mutation.isPending ? tc('saving') : submitLabel}
        </Button>
      </div>
    </form>
  );
}
