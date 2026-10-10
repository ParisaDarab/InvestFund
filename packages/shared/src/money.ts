/**
 * Money helpers. Amounts stay strings end to end: conversion is done on digits, and formatting
 * passes a decimal string to `Intl.NumberFormat`, which formats it exactly. No floating-point
 * arithmetic is used anywhere.
 */
import { AmountMinor, type Money } from './api/common.js';

const MAJOR_AMOUNT_PATTERN = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/;

/**
 * Converts a major-unit decimal string to minor units: `"1250.50"` → `"125050"`.
 * Accepts a non-negative amount with at most two fraction digits and no leading zeros.
 * @throws {RangeError} if the input is not such an amount or exceeds the BIGINT range.
 */
export function toMinor(major: string): string {
  const match = MAJOR_AMOUNT_PATTERN.exec(major);
  if (match === null) {
    throw new RangeError(
      'Invalid amount: expected a non-negative decimal with at most 2 fraction digits.',
    );
  }
  const whole = match[1] ?? '0';
  const fraction = (match[2] ?? '').padEnd(2, '0');
  const minor = `${whole}${fraction}`.replace(/^0+(?=\d)/, '');
  if (!AmountMinor.safeParse(minor).success) {
    throw new RangeError('Invalid amount: exceeds the maximum supported amount.');
  }
  return minor;
}

/**
 * Converts minor units back to a major-unit decimal string with two fraction digits:
 * `"125050"` → `"1250.50"`, `"5"` → `"0.05"`.
 * @throws {RangeError} if the input is not a valid `AmountMinor`.
 */
export function fromMinor(amountMinor: string): string {
  if (!AmountMinor.safeParse(amountMinor).success) {
    throw new RangeError('Invalid amountMinor: expected a non-negative digit string.');
  }
  const padded = amountMinor.padStart(3, '0');
  return `${padded.slice(0, -2)}.${padded.slice(-2)}`;
}

/** Formats money for display: `{ amountMinor: "125050", currency: "GBP" }` → `£1,250.50`. */
export function formatMoney(money: Money, locale = 'en-GB'): string {
  const decimal = fromMinor(money.amountMinor) as `${number}`;
  return new Intl.NumberFormat(locale, { style: 'currency', currency: money.currency }).format(
    decimal,
  );
}
