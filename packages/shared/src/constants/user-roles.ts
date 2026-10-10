/**
 * Platform account roles (docs/DATABASE.md `UserRole`, one role per user). A user has no role
 * until onboarding, where they choose `founder` or `supporter`. `admin` is never self-assigned:
 * it is provisioned by an operator command (docs/OPERATIONS.md). Access tokens carry the role as
 * the `role` claim (`null` before onboarding), and the API's `requireRole(...)` guard checks it.
 */
export const USER_ROLES = ['founder', 'supporter', 'admin'] as const;

export type UserRole = (typeof USER_ROLES)[number];

/** Roles a user may pick during onboarding. */
export const SELF_SERVICE_ROLES = ['founder', 'supporter'] as const;
export type SelfServiceRole = (typeof SELF_SERVICE_ROLES)[number];

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && (USER_ROLES as readonly string[]).includes(value);
}
