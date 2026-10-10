import { describe, expect, it } from 'vitest';

import { formatMoney, Money, ProblemDetails, problemTypeUri } from '@investfund/shared';

describe('@investfund/shared consumed from apps/web', () => {
  it('parses and formats a Money value', () => {
    const money = Money.parse({ amountMinor: '125050', currency: 'GBP' });
    expect(formatMoney(money)).toBe('£1,250.50');
  });

  it('rejects a malformed Money value', () => {
    expect(Money.safeParse({ amountMinor: '12.5', currency: 'GBP' }).success).toBe(false);
  });

  it('parses an RFC 9457 problem document', () => {
    const problem = ProblemDetails.parse({
      type: problemTypeUri('not-found'),
      title: 'Not found',
      status: 404,
      requestId: 'req-123',
    });
    expect(problem.status).toBe(404);
  });
});
