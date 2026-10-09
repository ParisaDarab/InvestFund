export type ClassValue = string | false | null | undefined;

/**
 * Joins class names, skipping falsy values. A deliberately tiny stand-in for clsx/tailwind-merge
 * (not on the approved dependency list): it does not resolve conflicting Tailwind utilities, so
 * primitives keep their base classes free of anything a caller is expected to override, and a
 * caller that must win a conflict uses Tailwind's important modifier (`!p-0`).
 */
export function cn(...classes: ClassValue[]): string {
  return classes.filter(Boolean).join(' ');
}
