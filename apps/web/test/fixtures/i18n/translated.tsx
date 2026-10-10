// Fixture for test/i18n-lint.test.ts: all copy comes from next-intl; this must pass the guard.
import { useTranslations } from 'next-intl';

export function Translated({ count }: { count: number }) {
  const t = useTranslations('home');
  return (
    <section title={t('title')} className="flex gap-4" data-testid="translated">
      <h1>{t('title')}</h1>
      <p>
        {t('description')} · {count} / {'·'}
      </p>
      <img src="/x.png" alt="" />
    </section>
  );
}
