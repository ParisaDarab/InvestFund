import { NextIntlClientProvider } from 'next-intl';
import { ThemeProvider } from 'next-themes';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { nextTheme, ThemeToggle } from './theme-toggle';

import messages from '@/messages/en-GB.json';

function render(): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en-GB" timeZone="Europe/London" messages={messages}>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
        <ThemeToggle />
      </ThemeProvider>
    </NextIntlClientProvider>,
  );
}

describe('nextTheme', () => {
  it('switches dark to light and light to dark', () => {
    expect(nextTheme('dark')).toBe('light');
    expect(nextTheme('light')).toBe('dark');
  });

  it('treats an unresolved theme as the dark default', () => {
    expect(nextTheme(undefined)).toBe('light');
  });
});

describe('ThemeToggle', () => {
  it('renders a native button (keyboard operable) with a translated accessible name', () => {
    const html = render();
    expect(html).toMatch(/<button type="button"/);
    expect(html).toContain(`aria-label="${messages.ui.themeToggle.label}"`);
    expect(html).toContain('data-testid="theme-toggle"');
    expect(html).toContain('focus-visible:ring-ring');
  });

  it('leaves the pressed state to the client, so server and client markup match', () => {
    const html = render();
    expect(html).not.toContain('aria-pressed');
    expect(html).not.toContain('data-theme-state');
  });

  it('shows the icon for the other theme through the dark: variant', () => {
    const html = render();
    expect(html).toContain('hidden dark:block');
    expect(html).toContain('block dark:hidden');
  });
});
