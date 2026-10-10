'use client';

import { Moon, Sun } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { useSyncExternalStore } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

export type ResolvedTheme = 'light' | 'dark';

/** The theme the toggle switches to. Anything other than an explicit light theme counts as dark. */
export function nextTheme(resolvedTheme: string | undefined): ResolvedTheme {
  return resolvedTheme === 'light' ? 'dark' : 'light';
}

const noopSubscribe = () => () => undefined;

/** False during server rendering and hydration, true afterwards (no setState-in-effect). */
function useIsClient(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

export interface ThemeToggleProps {
  className?: string;
}

/**
 * Switches between the dark (default) and light themes. It is a toggle button: the accessible name
 * stays "Dark theme" and `aria-pressed` reports whether the dark theme is on. The theme is only
 * known on the client (next-themes reads localStorage), so the pressed state is rendered after
 * hydration to avoid a server/client mismatch.
 */
export function ThemeToggle({ className }: ThemeToggleProps) {
  const t = useTranslations('ui.themeToggle');
  const { resolvedTheme, setTheme } = useTheme();
  const isClient = useIsClient();
  const isDark = resolvedTheme !== 'light';

  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn('relative', className)}
      aria-label={t('label')}
      aria-pressed={isClient ? isDark : undefined}
      title={isClient ? (isDark ? t('switchToLight') : t('switchToDark')) : undefined}
      onClick={() => {
        setTheme(nextTheme(resolvedTheme));
      }}
      data-testid="theme-toggle"
      data-theme-state={isClient ? (isDark ? 'dark' : 'light') : undefined}
    >
      <Sun aria-hidden="true" className="hidden dark:block" />
      <Moon aria-hidden="true" className="block dark:hidden" />
    </Button>
  );
}
