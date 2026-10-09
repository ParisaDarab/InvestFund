/**
 * The authenticated caller, attached to `req.user` by the auth guards. Only the ID and role come
 * from the access token; everything else (status, memberships) is loaded by the services.
 */
import type { UserRole } from '@investfund/shared';

export interface AuthUser {
  readonly id: string;
  readonly role: UserRole;
}

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
