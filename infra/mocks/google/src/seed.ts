import { z } from 'zod';

import { parseRfc3339 } from './time.js';

const DateTimeWithOffset = z
  .string()
  .refine((value) => parseRfc3339(value) !== null, 'Expected an RFC 3339 date-time with offset');

const BusyBlock = z
  .strictObject({ start: DateTimeWithOffset, end: DateTimeWithOffset })
  .refine((block) => (parseRfc3339(block.end) ?? 0) > (parseRfc3339(block.start) ?? 0), {
    message: 'end must be after start',
  });

export const SeedUser = z.strictObject({
  /** Google subject ID. Derived from the email when omitted. */
  sub: z
    .string()
    .regex(/^\d{1,32}$/)
    .optional(),
  email: z.email().transform((email) => email.toLowerCase()),
  name: z.string().min(1),
  givenName: z.string().min(1).optional(),
  familyName: z.string().min(1).optional(),
  picture: z.url().optional(),
  /** Busy blocks on the user's primary calendar (in addition to events created through the API). */
  busy: z.array(BusyBlock).default([]),
});

/** Body of `POST /__seed`. Users are added or replaced by email. */
export const SeedInput = z.strictObject({
  users: z.array(SeedUser).default([]),
  /** Ready-made access tokens, so tests can call Gmail/Calendar without the OAuth dance. */
  accessTokens: z
    .array(
      z.strictObject({
        token: z.string().min(8).max(512),
        email: z.email().transform((email) => email.toLowerCase()),
        scopes: z.array(z.string().min(1)).min(1),
      }),
    )
    .default([]),
});
export type SeedInput = z.input<typeof SeedInput>;

/**
 * State after start-up and after `POST /__reset`: two synthetic users on the reserved `.test`
 * domain. The founder has two busy blocks on Monday 5 January 2026 (UTC).
 */
export const DEFAULT_SEED: SeedInput = {
  users: [
    {
      email: 'founder@investfund.test',
      name: 'Fay Founder',
      givenName: 'Fay',
      familyName: 'Founder',
      busy: [
        { start: '2026-01-05T09:00:00Z', end: '2026-01-05T10:00:00Z' },
        { start: '2026-01-05T13:30:00Z', end: '2026-01-05T14:00:00Z' },
      ],
    },
    {
      email: 'investor@investfund.test',
      name: 'Ian Investor',
      givenName: 'Ian',
      familyName: 'Investor',
      busy: [{ start: '2026-01-05T11:00:00Z', end: '2026-01-05T12:00:00Z' }],
    },
  ],
};
