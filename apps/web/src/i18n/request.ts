import { locale as rootLocale } from 'next/root-params';
import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';

import { routing } from './routing';

import type { AppLocale } from './routing';

const messageLoaders = {
  'en-GB': () => import('../messages/en-GB.json'),
} satisfies Record<AppLocale, () => Promise<unknown>>;

export default getRequestConfig(async ({ locale: explicitLocale }) => {
  // An explicit locale (e.g. `getTranslations({ locale })`) wins; otherwise the `[locale]` root
  // param is read via next/root-params, which keeps pages statically renderable.
  const requested = explicitLocale ?? (await rootLocale());
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  const messages = (await messageLoaders[locale]()).default;
  return { locale, messages };
});
