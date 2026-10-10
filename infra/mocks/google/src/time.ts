/** Time helpers for Calendar: RFC 3339 parsing, time-zone conversion and free/busy windows. */

export interface Interval {
  /** Epoch milliseconds, inclusive. */
  start: number;
  /** Epoch milliseconds, exclusive. */
  end: number;
}

const RFC3339 =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:\d{2})?$/i;

/** Parses an RFC 3339 date-time with an offset (`Z` or `±hh:mm`). Returns `null` otherwise. */
export function parseRfc3339(value: string): number | null {
  const match = RFC3339.exec(value);
  if (match?.[8] === undefined) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

/** Offset of `timeZone` from UTC at `instant`, in milliseconds. Throws on an unknown zone. */
function zoneOffset(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instant));
  const part = (type: string): number =>
    Number(parts.find((candidate) => candidate.type === type)?.value);
  const asUtc = Date.UTC(
    part('year'),
    part('month') - 1,
    part('day'),
    part('hour'),
    part('minute'),
    part('second'),
  );
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/**
 * Converts a Calendar `{ dateTime, timeZone }` to epoch ms. A `dateTime` with an offset wins; a
 * local `dateTime` needs `timeZone` (IANA name), as in the Calendar API. Returns `null` if invalid.
 */
export function eventTimeToEpoch(dateTime: string, timeZone: string | undefined): number | null {
  const withOffset = parseRfc3339(dateTime);
  if (withOffset !== null) return withOffset;
  const match = RFC3339.exec(dateTime);
  if (match === null || timeZone === undefined) return null;
  const [, y, mo, d, h, mi, s] = match;
  const local = Date.UTC(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    Number(s ?? 0),
  );
  try {
    // Two passes settle the offset around DST changes.
    const first = local - zoneOffset(local, timeZone);
    return local - zoneOffset(first, timeZone);
  } catch {
    return null;
  }
}

/** `YYYY-MM-DD` (all-day event) → UTC midnight. */
export function dateToEpoch(date: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const ms = Date.parse(`${date}T00:00:00Z`);
  return Number.isNaN(ms) ? null : ms;
}

/** UTC RFC 3339 without milliseconds when they are zero, as the Calendar API formats it. */
export function toUtcString(ms: number): string {
  return new Date(ms).toISOString().replace('.000Z', 'Z');
}

/**
 * Busy intervals overlapping `[windowStart, windowEnd)`: clipped to the window, sorted and with
 * overlapping or touching intervals merged.
 */
export function busyInWindow(
  intervals: readonly Interval[],
  windowStart: number,
  windowEnd: number,
): Interval[] {
  const clipped = intervals
    .filter((interval) => interval.start < windowEnd && interval.end > windowStart)
    .map((interval) => ({
      start: Math.max(interval.start, windowStart),
      end: Math.min(interval.end, windowEnd),
    }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: Interval[] = [];
  for (const interval of clipped) {
    const last = merged.at(-1);
    if (last !== undefined && interval.start <= last.end) {
      last.end = Math.max(last.end, interval.end);
    } else {
      merged.push({ ...interval });
    }
  }
  return merged;
}
