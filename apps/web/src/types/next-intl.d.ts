import type { routing } from '@/i18n/routing';
import type messages from '@/messages/en-GB.json';

// Strongly typed message keys and locales for `useTranslations` / `getTranslations`.
declare module 'next-intl' {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: typeof messages;
  }
}
