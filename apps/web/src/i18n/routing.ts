import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['en-GB'],
  defaultLocale: 'en-GB',
  localePrefix: 'always',
});

export type AppLocale = (typeof routing.locales)[number];
