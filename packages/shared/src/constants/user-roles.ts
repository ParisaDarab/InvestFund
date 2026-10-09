/**
 * Platform account roles (docs/DATABASE.md §3 `UserRole`, one role per user). Access tokens carry
 * the role as the `role` claim, and the API's `requireRole(...)` guard checks it.
 */
export const USER_ROLES = ['founder', 'investor', 'admin'] as const;

export type UserRole = (typeof USER_ROLES)[number];

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && (USER_ROLES as readonly string[]).includes(value);
}
