import type { CurrentUser } from '@investfund/shared';

import { iso, isoOrNull } from '../shared/serialize.js';

import type { Prisma } from '../../core/db/prisma.js';

export const currentUserInclude = {
  founderProfile: { select: { userId: true } },
  supporterProfile: { select: { userId: true } },
} satisfies Prisma.UserInclude;

export type UserWithProfiles = Prisma.UserGetPayload<{ include: typeof currentUserInclude }>;

export function toCurrentUser(user: UserWithProfiles): CurrentUser {
  const profileComplete =
    user.role === 'founder'
      ? user.founderProfile !== null
      : user.role === 'supporter'
        ? user.supporterProfile !== null
        : user.role === 'admin';
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    role: user.role,
    status: user.status,
    emailNotifications: user.emailNotifications,
    onboardedAt: isoOrNull(user.onboardedAt),
    profileComplete,
    createdAt: iso(user.createdAt),
  };
}
