/** Conversions from database values to API values. */

export const iso = (date: Date): string => date.toISOString();
export const isoOrNull = (date: Date | null): string | null => (date === null ? null : iso(date));
/** `@db.Date` columns → `YYYY-MM-DD`. */
export const dateOnly = (date: Date | null): string | null =>
  date === null ? null : date.toISOString().slice(0, 10);
export const minor = (value: bigint): string => value.toString();
export const minorOrNull = (value: bigint | null): string | null =>
  value === null ? null : value.toString();
export const bigintOrNull = (value: string | null | undefined): bigint | null =>
  value === null || value === undefined ? null : BigInt(value);
/** `YYYY-MM-DD` → UTC midnight for `@db.Date` columns. */
export const toDate = (value: string | null | undefined): Date | null =>
  value === null || value === undefined ? null : new Date(`${value}T00:00:00.000Z`);
