import { NextIntlClientProvider } from 'next-intl';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Logo } from './logo';

import messages from '@/messages/en-GB.json';

describe('Logo', () => {
  it('renders the wordmark with a decorative accent dot', () => {
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="en-GB" timeZone="Europe/London" messages={messages}>
        <Logo className="text-2xl" />
      </NextIntlClientProvider>,
    );
    expect(html).toContain('data-testid="logo"');
    expect(html).toContain(
      `${messages.metadata.siteName}<span aria-hidden="true" class="text-primary">.</span>`,
    );
    expect(html).toContain('text-2xl');
  });
});
