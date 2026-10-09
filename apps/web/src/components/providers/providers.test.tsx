import { useQueryClient } from '@tanstack/react-query';
import { NextIntlClientProvider, useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Providers } from './providers';

import messages from '@/messages/en-GB.json';

function Probe() {
  const client = useQueryClient();
  const { themes } = useTheme();
  const t = useTranslations('home');
  return (
    <p data-testid="probe">
      {t('title')}|retry={String(client.getDefaultOptions().queries?.retry)}|themes=
      {themes.join(',')}
    </p>
  );
}

function renderWithProviders() {
  return renderToString(
    <NextIntlClientProvider locale="en-GB" messages={messages}>
      <Providers>
        <Probe />
      </Providers>
    </NextIntlClientProvider>,
  );
}

describe('Providers', () => {
  it('renders children with query, theme and i18n context available', () => {
    const html = renderWithProviders();
    expect(html).toContain('data-testid="probe"');
    expect(html).toContain('InvestFund');
    expect(html).toContain('retry=<!-- -->1');
    expect(html).toMatch(/themes=(<!-- -->)?light,dark,system/);
  });

  it('injects the blocking next-themes script with the dark default and class attribute', () => {
    const html = renderWithProviders();
    expect(html).toContain('<script');
    expect(html).toContain('"class"');
    expect(html).toContain('"dark"');
  });
});
