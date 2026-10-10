/**
 * Everything domain modules may depend on, built once by the composition root
 * (`core/container.ts` → `buildModules`). Tests build their own with fakes where useful.
 */
import type { IdentityProvider } from './auth/google-provider.js';
import type { SessionService } from './auth/session.service.js';
import type { Notifier } from './notifications/notifier.js';
import type { RealtimeBus } from './realtime/realtime-bus.js';
import type { RealtimeHub } from './realtime/realtime-hub.js';
import type { JwtAccessTokenIssuer } from '../core/auth/access-token.js';
import type { AuthGuards } from '../core/auth/auth-guards.js';
import type { AppConfig } from '../core/config/config.js';
import type { PrismaClient } from '../core/db/prisma.js';
import type { UnitOfWork } from '../core/db/unit-of-work.js';
import type { StorageProvider } from '../core/file-storage/storage-provider.js';
import type { Logger } from '../core/logger/logger.js';
import type { RateLimiter } from '../core/rateLimit/rate-limit.js';

export interface ModuleContext {
  readonly config: AppConfig;
  readonly logger: Logger;
  readonly prisma: PrismaClient;
  readonly unitOfWork: UnitOfWork;
  readonly authGuards: AuthGuards;
  readonly rateLimiter: RateLimiter;
  readonly storage: StorageProvider;
  /** `null` when Google sign-in is not configured. */
  readonly identityProvider: IdentityProvider | null;
  readonly accessTokens: JwtAccessTokenIssuer;
  readonly sessions: SessionService;
  readonly realtimeBus: RealtimeBus;
  readonly realtimeHub: RealtimeHub;
  readonly notifier: Notifier;
}
