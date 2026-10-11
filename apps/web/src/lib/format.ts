/**
 * Locale-aware display formatting. Money stays a decimal string end to end (no floats); dates
 * are stored in UTC and shown in the viewer's time zone.
 */
import { formatMoney, fromMinor, toMinor, type Currency } from '@investfund/shared';

export function money(
  amountMinor: string | null | undefined,
  currency: string,
  locale = 'en-GB',
): string {
  if (amountMinor === null || amountMinor === undefined) return '—';
  return formatMoney({ amountMinor, currency: currency as Currency }, locale);
}

/**
 * Money without pence when the amount is whole (£8,000 rather than £8,000.00), for cards.
 * Deliberately not `notation: 'compact'`: its output differs between ICU builds (server vs
 * browser), which breaks hydration.
 */
export function moneyCompact(
  amountMinor: string | null | undefined,
  currency: string,
  locale = 'en-GB',
): string {
  if (amountMinor === null || amountMinor === undefined) return '—';
  const [whole = '0', fraction = '00'] = fromMinor(amountMinor).split('.');
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: fraction === '00' ? 0 : 2,
    maximumFractionDigits: fraction === '00' ? 0 : 2,
  }).format(`${whole}.${fraction}` as `${number}`);
}

/** Major-unit input ("1,250.50", "£1250") → minor units, or `null` when invalid/empty. */
export function parseMajorInput(value: string): string | null {
  const cleaned = value.replace(/[£€$,\s]/g, '');
  if (cleaned === '') return null;
  try {
    return toMinor(cleaned);
  } catch {
    return null;
  }
}

/** Minor units → a major-unit input value: "125050" → "1250.50", "125000" → "1250". */
export function minorToInput(amountMinor: string | null | undefined): string {
  if (amountMinor === null || amountMinor === undefined) return '';
  const value = fromMinor(amountMinor);
  return value.endsWith('.00') ? value.slice(0, -3) : value;
}

/** Percentage (0-100, integer) of `part` over `whole`, using BigInt to stay exact. */
export function percentOf(part: string, whole: string | null): number {
  if (whole === null || whole === '0') return 0;
  const pct = (BigInt(part) * 100n) / BigInt(whole);
  return Number(pct > 100n ? 100n : pct);
}

export function dateTime(iso: string, locale = 'en-GB'): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(iso),
  );
}

export function dateOnly(isoDate: string, locale = 'en-GB'): string {
  // `YYYY-MM-DD` is a calendar date: format it in UTC so it never shifts by a day.
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(`${isoDate}T00:00:00Z`),
  );
}

export function timeOnly(iso: string, locale = 'en-GB'): string {
  return new Intl.DateTimeFormat(locale, { timeStyle: 'short' }).format(new Date(iso));
}

/** "3 min ago", "yesterday" ... */
export function relativeTime(iso: string, locale = 'en-GB', now = Date.now()): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const abs = Math.abs(seconds);
  if (abs < 60) return rtf.format(seconds, 'second');
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), 'minute');
  if (abs < 86_400) return rtf.format(Math.round(seconds / 3600), 'hour');
  if (abs < 604_800) return rtf.format(Math.round(seconds / 86_400), 'day');
  return dateOnly(iso.slice(0, 10), locale);
}
