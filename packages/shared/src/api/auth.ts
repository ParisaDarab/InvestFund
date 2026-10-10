/** Authentication and account contracts (docs/API.md §6.1). Google sign-in only (ADR 0002). */
import { z } from 'zod';

import { SELF_SERVICE_ROLES, USER_ROLES } from '../constants/user-roles.js';

import { IsoDateTime, Uuid } from './common.js';
import { requiredText } from './fields.js';

export const UserRoleSchema = z.enum(USER_ROLES).meta({ id: 'UserRole' });

export const CurrentUser = z
  .object({
    id: Uuid,
    email: z.email(),
    name: z.string(),
    avatarUrl: z.string().nullable(),
    role: UserRoleSchema.nullable().meta({ description: '`null` until onboarding.' }),
    status: z.enum(['active', 'suspended']),
    emailNotifications: z.boolean(),
    onboardedAt: IsoDateTime.nullable(),
    /** True once the role-specific profile exists. */
    profileComplete: z.boolean(),
    createdAt: IsoDateTime,
  })
  .meta({ id: 'CurrentUser' });
export type CurrentUser = z.infer<typeof CurrentUser>;

/** Body of `POST /auth/refresh`: a new short-lived access token and the current user. */
export const SessionResponse = z
  .object({
    accessToken: z.string().min(1),
    /** Seconds until the access token expires. */
    expiresIn: z.int().positive(),
    user: CurrentUser,
  })
  .meta({ id: 'SessionResponse' });
export type SessionResponse = z.infer<typeof SessionResponse>;

/** `GET /auth/google/start?returnTo=` — only same-app relative paths are accepted. */
export const GoogleStartQuery = z.strictObject({
  returnTo: z
    .string()
    .max(300)
    .regex(/^\/(?![/\\])[^\s]*$/, { error: 'Must be a relative path.' })
    .optional(),
  /** Passed to Google as `login_hint` (pre-selects the account). */
  loginHint: z.string().trim().max(254).optional(),
});
export type GoogleStartQuery = z.infer<typeof GoogleStartQuery>;

/** `POST /me/role` (onboarding, once). */
export const ChooseRoleRequest = z
  .strictObject({ role: z.enum(SELF_SERVICE_ROLES) })
  .meta({ id: 'ChooseRoleRequest' });
export type ChooseRoleRequest = z.infer<typeof ChooseRoleRequest>;

/** `PATCH /me` */
export const UpdateAccountRequest = z
  .strictObject({
    name: requiredText(120).optional(),
    emailNotifications: z.boolean().optional(),
  })
  .meta({ id: 'UpdateAccountRequest' });
export type UpdateAccountRequest = z.infer<typeof UpdateAccountRequest>;
