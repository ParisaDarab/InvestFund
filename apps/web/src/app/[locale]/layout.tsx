import '@/styles/globals.css';

import { Inter } from 'next/font/google';
import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getTranslations } from 'next-intl/server';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { Providers } from '@/components/providers/providers';
import { routing } from '@/i18n/routing';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

interface LocaleLayoutProps {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('metadata');
  return {
    title: { default: t('siteName'), template: `%s | ${t('siteName')}` },
    description: t('description'),
  };
}

export default async function LocaleLayout({ children, params }: LocaleLayoutProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  return (
    // next-themes sets the theme class on <html> before hydration, hence suppressHydrationWarning.
    <html lang={locale} className={inter.variable} suppressHydrationWarning>
      <body className="min-h-dvh font-sans antialiased">
        <NextIntlClientProvider>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
