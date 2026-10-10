/** Helpers for the authenticated caller in services. */
import type { UserRole } from '@investfund/shared';

import { ForbiddenError, UnauthenticatedError } from '../../core/errors/domain-errors.js';

import type { AuthUser } from '../../core/auth/auth.types.js';

export function requireUser(user: AuthUser | undefined): AuthUser {
  if (user === undefined) throw new UnauthenticatedError();
  return user;
}

export function requireRoleOf(
  user: AuthUser | undefined,
  ...roles: UserRole[]
): AuthUser & { role: UserRole } {
  const actor = requireUser(user);
  if (actor.role === null || !roles.includes(actor.role)) throw new ForbiddenError();
  return actor as AuthUser & { role: UserRole };
}
