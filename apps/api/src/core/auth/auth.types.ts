/**
 * The authenticated caller, attached to `req.user` by the auth guards. The token proves who the
 * caller is; when an `ActorLoader` is configured the role and status are re-read from the
 * database on every request, so onboarding, suspension and role changes apply immediately.
 * `role` is `null` until the user completes onboarding.
 */
import type { UserRole } from '@investfund/shared';

export interface AuthUser {
  readonly id: string;
  readonly role: UserRole | null;
}

/** Loads the current role and status of a user (null when the user no longer exists). */
export type ActorLoader = (
  userId: string,
) => Promise<{ readonly role: UserRole | null; readonly status: 'active' | 'suspended' } | null>;

declare global {
  // Express merges this into its `Request` type (global namespace augmentation).
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by `requireAuth()` / `requireRole()`. Undefined on public routes. */
      user?: AuthUser;
    }
  }
}
