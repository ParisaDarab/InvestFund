/**
 * Google sign-in: turns a verified external identity into a platform user (created on first
 * sign-in with no role; the role is chosen during onboarding).
 */
import { newId } from '../../core/ids/index.js';
import { recordAudit } from '../shared/audit.js';

import type { ExternalIdentity } from './google-provider.js';
import type { PrismaClient } from '../../core/db/prisma.js';

/**
 * Accounts provisioned before their first sign-in (operator-granted admins) carry a placeholder
 * `google_sub` with this prefix; the first Google sign-in with the same verified email links it.
 */
export const PENDING_SUB_PREFIX = 'pending:';

export type SignInFailure = 'email_unverified' | 'account_conflict' | 'suspended';

export type SignInResult =
  | { readonly ok: true; readonly userId: string; readonly isNew: boolean }
  | { readonly ok: false; readonly reason: SignInFailure };

export class AuthService {
  constructor(private readonly prisma: PrismaClient) {}

  async signIn(identity: ExternalIdentity): Promise<SignInResult> {
    if (!identity.emailVerified) return { ok: false, reason: 'email_unverified' };
    const now = new Date();

    const bySub = await this.prisma.user.findUnique({ where: { googleSub: identity.sub } });
    if (bySub !== null) {
      if (bySub.status === 'suspended') return { ok: false, reason: 'suspended' };
      const emailTaken =
        bySub.email !== identity.email &&
        (await this.prisma.user.findUnique({ where: { email: identity.email } })) !== null;
      await this.prisma.user.update({
        where: { id: bySub.id },
        data: {
          lastLoginAt: now,
          avatarUrl: identity.picture,
          ...(emailTaken ? {} : { email: identity.email }),
        },
      });
      await recordAudit(this.prisma, {
        actorId: bySub.id,
        action: 'auth.sign_in',
        entityType: 'user',
        entityId: bySub.id,
      });
      return { ok: true, userId: bySub.id, isNew: false };
    }

    const byEmail = await this.prisma.user.findUnique({ where: { email: identity.email } });
    if (byEmail !== null) {
      // Same email, different Google account: never merge silently, except a provisioned
      // placeholder account waiting for its first sign-in.
      if (!byEmail.googleSub.startsWith(PENDING_SUB_PREFIX)) {
        return { ok: false, reason: 'account_conflict' };
      }
      if (byEmail.status === 'suspended') return { ok: false, reason: 'suspended' };
      await this.prisma.user.update({
        where: { id: byEmail.id },
        data: {
          googleSub: identity.sub,
          lastLoginAt: now,
          avatarUrl: identity.picture,
          name: identity.name,
        },
      });
      await recordAudit(this.prisma, {
        actorId: byEmail.id,
        action: 'auth.account_linked',
        entityType: 'user',
        entityId: byEmail.id,
      });
      return { ok: true, userId: byEmail.id, isNew: false };
    }

    const id = newId();
    await this.prisma.user.create({
      data: {
        id,
        email: identity.email,
        googleSub: identity.sub,
        name: identity.name,
        avatarUrl: identity.picture,
        lastLoginAt: now,
      },
    });
    await recordAudit(this.prisma, {
      actorId: id,
      action: 'auth.sign_up',
      entityType: 'user',
      entityId: id,
    });
    return { ok: true, userId: id, isNew: true };
  }
}
